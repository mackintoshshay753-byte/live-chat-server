const bcrypt = require('bcrypt');
const { data, saveData } = require('../data');
const { clean, createProfile } = require('../helpers');

// ✅ Track online users: username -> socket.id
const onlineUsers = new Map();

// ✅ Rate limiting to prevent abuse
const loginAttempts = new Map(); // username/IP -> { count, lastAttempt }
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

// ✅ Security helpers
function sanitizeUsername(username) {
  if (typeof username !== 'string') return '';
  return clean(username.trim());
}

function isStrongPassword(password) {
  // Min 8 chars, at least one letter, one number
  return typeof password === 'string' &&
    password.length >= 8 &&
    /[a-zA-Z]/.test(password) &&
    /[0-9]/.test(password);
}

function checkRateLimit(identifier) {
  const now = Date.now();
  const record = loginAttempts.get(identifier) || { count: 0, lastAttempt: 0 };

  // Reset if lockout expired
  if (now - record.lastAttempt > LOCKOUT_TIME) {
    loginAttempts.set(identifier, { count: 1, lastAttempt: now });
    return { allowed: true };
  }

  if (record.count >= MAX_ATTEMPTS) {
    return { 
      allowed: false, 
      message: `Too many attempts. Try again in ${Math.ceil((LOCKOUT_TIME - (now - record.lastAttempt)) / 60000)} minutes.` 
    };
  }

  record.count += 1;
  record.lastAttempt = now;
  loginAttempts.set(identifier, record);
  return { allowed: true };
}

function safeCb(cb, response = {}) {
  if (typeof cb === 'function') {
    // Always ensure success flag exists
    const res = { success: false, ...response };
    try {
      cb(res);
    } catch (err) {
      console.error('Callback error:', err);
    }
  }
}

// ✅ Main socket setup
function setupSockets(io) {
  io.on("connection", (socket) => {
    const clientIp = socket.handshake.address || socket.handshake.headers['x-forwarded-for'] || 'unknown';
    let currentUser = null; // Track user for this socket connection

    console.log(`🔌 User connected | IP: ${clientIp}`);

    // ==================== LAST ONLINE & PRESENCE ====================
    socket.on("join", (username) => {
      try {
        const cleanName = sanitizeUsername(username);
        if (!cleanName) return;

        // Remove old entry if exists
        for (const [user, id] of onlineUsers.entries()) {
          if (id === socket.id) onlineUsers.delete(user);
        }

        onlineUsers.set(cleanName, socket.id);
        currentUser = cleanName;

        const account = data.accounts[cleanName];

        if (account && data.userProfiles[account.id]) {
          data.userProfiles[account.id].lastOnline = new Date().toISOString();
          data.userProfiles[account.id].isOnline = true;
          saveData();
        }

        console.log(`👤 ${cleanName} is online | Total: ${onlineUsers.size}`);
      } catch (err) {
        console.error('Join error:', err);
      }
    });

    socket.on("disconnect", () => {
      try {
        if (currentUser) {
          onlineUsers.delete(currentUser);

          if (currentUser) {
            const account = data.accounts[currentUser];
            if (account && data.userProfiles[account.id]) {
              data.userProfiles[account.id].lastOnline = new Date().toISOString();
              data.userProfiles[account.id].isOnline = false;
              saveData();
            }
          }

          console.log(`👤 ${currentUser} went offline | Total: ${onlineUsers.size}`);
        }
      } catch (err) {
        console.error('Disconnect error:', err);
      }
    });

    // ==================== AUTHENTICATION ====================
    socket.on("login", async ({ username, password }, cb) => {
      try {
        const name = sanitizeUsername(username);
        if (!name || typeof password !== 'string') {
          return safeCb(cb, { message: "Invalid input" });
        }

        // Rate limit by username + IP
        const rateCheck = checkRateLimit(`${name}:${clientIp}`);
        if (!rateCheck.allowed) {
          return safeCb(cb, { message: rateCheck.message });
        }

        const lowerName = name.toLowerCase();
        const account = data.accounts[name];

        if (!account || !data.registeredNames[lowerName]) {
          return safeCb(cb, { message: "Account not found" });
        }

        // Secure password comparison
        const validPassword = await bcrypt.compare(password, account.hash);
        if (!validPassword) {
          return safeCb(cb, { message: "Incorrect username or password" });
        }

        // Clear rate limit on success
        loginAttempts.delete(`${name}:${clientIp}`);

        safeCb(cb, { 
          success: true, 
          username: name, 
          id: account.id, 
          theme: account.theme || 'light'
        });

      } catch (err) {
        console.error("Login Error:", err);
        safeCb(cb, { message: "Server error — please try again later" });
      }
    });

    socket.on("signup", async ({ username, password }, cb) => {
  try {
    const name = sanitizeUsername(username);
    if (!name) return safeCb(cb, { message: "Invalid username format" });

    const lower = name.toLowerCase();

    if (name.length < 3 || name.length > 20 || /\s/.test(name) || !/^[a-zA-Z0-9_]+$/.test(name))
      return safeCb(cb, { message: "Invalid username format" });

    if (data.registeredNames[lower])
      return safeCb(cb, { message: "Username already taken" });

    if (!isStrongPassword(password))
      return safeCb(cb, { message: "Password must be 8+ chars with letters + numbers" });

    const r = await createProfile(name);
    if (!r.success)
      return safeCb(cb, { success: false, message: r.message || "Username is not appropriate" });

    const id = r.user.id;

    data.registeredNames[lower] = true;
    data.accounts[name] = {
      id,
      hash: await bcrypt.hash(password, 12),
      joinDate: new Date().toISOString(),
      theme: "light",
      verified: false
    };

    data.userProfiles[id] = {
      username: name,
      createdAt: Date.now(),
      isOnline: false,
      lastOnline: null
    };

    saveData();
    safeCb(cb, { success: true, username: name, id });
  } catch (e) {
    console.error(e);
    safeCb(cb, { message: "Server error" });
  }
});

    // ==================== USER SETTINGS ====================
    socket.on("save-theme", ({ theme, username }, cb) => {
      try {
        const name = sanitizeUsername(username);
        if (!name || !['light', 'dark', 'classic'].includes(theme)) {
          return safeCb(cb, { message: "Invalid theme or user" });
        }

        if (data.accounts[name]) {
          data.accounts[name].theme = theme;
        }
        if (data.userProfiles[name]) {
          data.userProfiles[name].theme = theme;
        }

        saveData();
        safeCb(cb, { success: true });
      } catch (err) {
        console.error("Save Theme Error:", err);
        safeCb(cb);
      }
    });

    socket.on("change username", async ({ oldName, newName }, cb) => {
      try {
        const cleanOld = sanitizeUsername(oldName);
        const cleanNew = sanitizeUsername(newName);

        if (!cleanOld || !cleanNew || cleanOld === cleanNew) {
          return safeCb(cb, { message: "Invalid name change request" });
        }

        const oldLower = cleanOld.toLowerCase();
        const newLower = cleanNew.toLowerCase();

        // ✅ Validation
        if (cleanNew.length < 3 || cleanNew.length > 20)
          return safeCb(cb, { message: "New name must be 3–20 characters" });
        if (!/^[a-zA-Z0-9_]+$/.test(cleanNew))
          return safeCb(cb, { message: "Only letters, numbers and underscores allowed" });
        if (data.registeredNames[newLower])
          return safeCb(cb, { message: "New username already taken" });
        if (!data.accounts[cleanOld])
          return safeCb(cb, { message: "Original account not found" });

        // ✅ Atomic update — no partial changes
        delete data.registeredNames[oldLower];
        data.registeredNames[newLower] = true;

        // Move account
        const oldAccount = data.accounts[cleanOld];
        delete data.accounts[cleanOld];
        data.accounts[cleanNew] = oldAccount;

        // Move profile
        const oldProfile = data.userProfiles[cleanOld];
        if (oldProfile) {
          delete data.userProfiles[cleanOld];
          oldProfile.username = cleanNew;
          data.userProfiles[cleanNew] = oldProfile;
        }

        // Move ID mapping
        if (data.usernameToId[cleanOld]) {
          data.usernameToId[cleanNew] = data.usernameToId[cleanOld];
          delete data.usernameToId[cleanOld];
        }

        // ✅ Update online status
        if (onlineUsers.has(cleanOld)) {
          onlineUsers.set(cleanNew, onlineUsers.get(cleanOld));
          onlineUsers.delete(cleanOld);
        }

        saveData();
        
        // Broadcast change
        io.emit("username updated", { oldName: cleanOld, newName: cleanNew });

        safeCb(cb, { success: true, newName: cleanNew });
      } catch (err) {
        console.error("Change Username Error:", err);
        safeCb(cb, { message: "Failed to change username — please try again" });
      }
    });

    socket.on("change password", async ({ username, newPassword, currentPassword }, cb) => {
      try {
        const name = sanitizeUsername(username);
        if (!name || typeof newPassword !== 'string') {
          return safeCb(cb, { message: "Invalid input" });
        }

        const account = data.accounts[name];
        if (!account) return safeCb(cb, { message: "Account not found" });

        // ✅ Require current password confirmation
        if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, account.hash))) {
          return safeCb(cb, { message: "Current password is incorrect" });
        }

        // ✅ Validate new password
        if (!isStrongPassword(newPassword)) {
          return safeCb(cb, { message: "New password must be at least 8 characters with letters and numbers" });
        }
        if (await bcrypt.compare(newPassword, account.hash)) {
          return safeCb(cb, { message: "New password cannot be the same as old password" });
        }

        // ✅ Update securely
        account.hash = await bcrypt.hash(newPassword, 12);
        saveData();

        safeCb(cb, { success: true, message: "Password updated successfully" });
      } catch (err) {
        console.error("Change Password Error:", err);
        safeCb(cb, { message: "Failed to update password" });
      }
    });

  });
}

// ✅ Exports
module.exports = setupSockets;
module.exports.onlineUsers = onlineUsers;