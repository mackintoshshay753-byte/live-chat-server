const bcrypt = require('bcrypt');
const { data, saveData, getDefaultOutfitIdForGender } = require('../data'); // Import the mapping function
const { clean, createProfile } = require('../helpers');

const onlineUsers = new Map();
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000;

function getChatId(userIdA, userIdB) {
  const [x, y] = [Number(userIdA), Number(userIdB)].sort((a, b) => a - b);
  return `chat:${x}:${y}`;
}

function sanitizeUsername(username) {
  if (typeof username !== 'string') return '';
  return clean(username.trim());
}

function isStrongPassword(password) {
  return typeof password === 'string' &&
    password.length >= 8 &&
    /[a-zA-Z]/.test(password) &&
    /[0-9]/.test(password);
}

function checkRateLimit(identifier) {
  const now = Date.now();
  const record = loginAttempts.get(identifier) || { count: 0, lastAttempt: 0 };

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
    const res = { success: false, ...response };
    try {
      cb(res);
    } catch (err) {
      console.error('Callback error:', err);
    }
  }
}

async function assignPermanentDefaultOutfit(userId, gender) {
  userId = Number(userId);
  if (!userId) return;

  // Get random valid ID for this gender
  const chosenOutfitId = getDefaultOutfitIdForGender(gender);

  if (!data.userOutfits[userId]) {
    data.userOutfits[userId] = { equipped: null, owned: [] };
  }

  // Only assign once — never overwrite later
  if (!data.userOutfits[userId].equipped) {
    if (!data.userOutfits[userId].owned.includes(chosenOutfitId)) {
      data.userOutfits[userId].owned.push(chosenOutfitId);
      if (data.outfitCatalog[chosenOutfitId]) {
        data.outfitCatalog[chosenOutfitId].sales = (data.outfitCatalog[chosenOutfitId].sales || 0) + 1;
      }
    }
    data.userOutfits[userId].equipped = chosenOutfitId;
    await saveData();
    console.log(`✅ Assigned ${gender} variant ${chosenOutfitId} to user ${userId}`);
  }
}

function setupSockets(io) {
  io.on("connection", (socket) => {
    const clientIp = socket.handshake.address || socket.handshake.headers['x-forwarded-for'] || 'unknown';
    let currentUser = null;
    let currentUserId = null;
    let heartbeatInterval = null;

    console.log(`🔌 User connected | IP: ${clientIp}`);

    const markOnline = (username) => {
      try {
        const cleanName = sanitizeUsername(username);
        if (!cleanName) return;

        const profile = data.userProfiles[cleanName];
        if (profile) currentUserId = profile.id;

        for (const [user, sid] of onlineUsers.entries()) {
          if (sid === socket.id || user === cleanName) onlineUsers.delete(user);
        }

        onlineUsers.set(cleanName, socket.id);
        currentUser = cleanName;

        if (profile) {
          profile.lastOnline = new Date().toISOString();
          profile.isOnline = true;
          saveData();
          io.emit("user-status", { userId: currentUserId, isOnline: true });
        }

        console.log(`👤 ${cleanName} (ID: ${currentUserId}) is online | Total: ${onlineUsers.size}`);
      } catch (err) {
        console.error('markOnline error:', err);
      }
    };

    socket.on("join", (username) => markOnline(username));

    socket.on("heartbeat", (username) => {
      if (!username || username !== currentUser) return;
      const profile = data.userProfiles[username];
      if (profile) {
        profile.lastOnline = new Date().toISOString();
        profile.isOnline = true;
        onlineUsers.set(username, socket.id);
      }
    });

    socket.on("disconnect", (reason) => {
      try {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        const isTemporary = reason === "ping timeout";

        if (isTemporary && currentUser) {
          console.log(`⏱️ ${currentUser} ping timeout — waiting up to 15s for reconnect`);
          setTimeout(() => {
            if (socket.connected || !currentUser) return;
            if (onlineUsers.get(currentUser) !== socket.id) return;

            onlineUsers.delete(currentUser);
            const profile = data.userProfiles[currentUser];
            if (profile) {
              profile.isOnline = false;
              profile.lastOnline = new Date().toISOString();
              saveData();
              io.emit("user-status", { userId: currentUserId, isOnline: false });
            }
            console.log(`👤 ${currentUser} went offline (timeout)`);
          }, 15000);
          return;
        }

        if (currentUser && currentUserId) {
          onlineUsers.delete(currentUser);
          const profile = data.userProfiles[currentUser];
          if (profile) {
            profile.lastOnline = new Date().toISOString();
            profile.isOnline = false;
            saveData();
            io.emit("user-status", { userId: currentUserId, isOnline: false });
          }
          console.log(`👤 ${currentUser} went offline | Reason: ${reason} | Total: ${onlineUsers.size}`);
        }
      } catch (err) {
        console.error('Disconnect error:', err);
      }
    });

    socket.on("reconnect", () => {
      if (currentUser) {
        console.log(`🔁 Reconnected — re‑marking ${currentUser} online`);
        markOnline(currentUser);
      }
    });

    socket.on("login", async ({ username, password }, cb) => {
      try {
        const name = sanitizeUsername(username);
        if (!name || typeof password !== 'string') {
          return safeCb(cb, { success: false, message: "Invalid input" });
        }

        const rateCheck = checkRateLimit(`${name}:${clientIp}`);
        if (!rateCheck.allowed) {
          return safeCb(cb, { message: rateCheck.message });
        }

        const lowerName = name.toLowerCase();
        const account = data.accounts[name];

        if (!account || !account.hash || !data.registeredNames[lowerName]) {
          return safeCb(cb, { message: "Account not found" });
        }

        if (account.banned === true) {
          const now = new Date();
          const banUntil = account.banUntil ? new Date(account.banUntil) : null;
          let durationText = "Permanent";

          if (banUntil && banUntil > now) {
            const diffMs = banUntil - now;
            const days = Math.floor(diffMs / 86400000);
            const hours = Math.floor((diffMs % 86400000) / 3600000);
            durationText = `${days}d ${hours}h`;
          } else if (banUntil && banUntil <= now) {
            account.banned = false;
            account.banReason = "";
            account.banUntil = null;
            saveData();
          }

          return safeCb(cb, {
            success: false,
            banned: true,
            message: "Your account is banned",
            duration: durationText,
            reason: account.banReason || "No reason given"
          });
        }

        const validPassword = await bcrypt.compare(password, account.hash);
        if (!validPassword) {
          return safeCb(cb, { message: "Incorrect username or password" });
        }

        loginAttempts.delete(`${name}:${clientIp}`);
        currentUserId = account.id;

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

    socket.on("signup", async ({ username, password, birthday, gender }, cb) => {
      try {
        const name = sanitizeUsername(username);
        if (!name) return safeCb(cb, { message: "Invalid username format" });

        const lower = name.toLowerCase();

        if (name.length < 3 || name.length > 20 || /\s/.test(name) || !/^[a-zA-Z0-9_]+$/.test(name)) {
          return safeCb(cb, { message: "Invalid username format" });
        }

        if (data.registeredNames[lower]) {
          return safeCb(cb, { message: "Username already taken" });
        }

        const pastOwners = (data.usernameHistory || [])
          .filter(entry => entry.oldUsername.toLowerCase() === lower);

        if (pastOwners.length > 0) {
          return safeCb(cb, {
            message: "This username was previously used by another account — you cannot register it."
          });
        }

        if (!isStrongPassword(password)) {
          return safeCb(cb, { message: "Password must be 8+ chars with letters + numbers" });
        }

        if (!["Male", "Female"].includes(gender)) {
          return safeCb(cb, { message: "Gender is required" });
        }

        if (!birthday || typeof birthday.month !== "string" || !birthday.month || !birthday.day || !birthday.year) {
          return safeCb(cb, { message: "Birthday is required" });
        }

        const monthNames = [
          "January","February","March","April","May","June",
          "July","August","September","October","November","December"
        ];

        if (!monthNames.includes(birthday.month)) {
          return safeCb(cb, { message: "Invalid birthday month" });
        }

        const monthIndex = monthNames.indexOf(birthday.month);
        const testDate = new Date(Number(birthday.year), monthIndex, Number(birthday.day));
        if (
          testDate.getFullYear() !== Number(birthday.year) ||
          testDate.getMonth() !== monthIndex ||
          testDate.getDate() !== Number(birthday.day)
        ) {
          return safeCb(cb, { message: "Invalid birthday date" });
        }

        const r = await createProfile(name, password);
        if (!r.success) {
          return safeCb(cb, { success: false, message: r.message || "Username is not appropriate" });
        }

        const id = r.user.id;
        data.registeredNames[lower] = true;
        
        // ✅ Now uses fixed mapping: Male → ID1, Female → ID2
        await assignPermanentDefaultOutfit(id, gender);
        
        if (data.accounts[name]) {
          data.accounts[name].joinDate = new Date().toISOString();
          data.accounts[name].theme = "light";
          data.accounts[name].verified = false;
          data.accounts[name].birthday = {
            month: birthday.month,
            day: Number(birthday.day),
            year: Number(birthday.year)
          };
          data.accounts[name].gender = gender;
        }

        if (data.userProfiles[name]) {
          data.userProfiles[name].birthday = {
            month: birthday.month,
            day: Number(birthday.day),
            year: Number(birthday.year)
          };
          data.userProfiles[name].gender = gender;
          data.userProfiles[name].isOnline = false;
          data.userProfiles[name].lastOnline = null;
        }

        saveData();
        safeCb(cb, { success: true, username: name, id, gender });
      } catch (e) {
        console.error("Signup Error:", e);
        safeCb(cb, { message: "Server error" });
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

        if (cleanNew.length < 3 || cleanNew.length > 20)
          return safeCb(cb, { message: "New name must be 3–20 characters" });
        if (!/^[a-zA-Z0-9_]+$/.test(cleanNew))
          return safeCb(cb, { message: "Only letters, numbers and underscores allowed" });
        if (data.registeredNames[newLower])
          return safeCb(cb, { message: "New username already in use" });

        const pastOwners = (data.usernameHistory || [])
          .filter(entry => entry.oldUsername.toLowerCase() === newLower)
          .map(entry => entry.userId);

        if (pastOwners.length > 0) {
          const currentUserId = data.accounts[cleanOld]?.id;
          const isOriginalOwner = pastOwners.every(id => id === currentUserId);

          if (!isOriginalOwner) {
            return safeCb(cb, { 
              message: "This username was previously used by another account — you cannot claim it." 
            });
          }
        }

        if (!data.accounts[cleanOld])
          return safeCb(cb, { message: "Original account not found" });

        delete data.registeredNames[oldLower];
        data.registeredNames[newLower] = true;

        const oldAccount = data.accounts[cleanOld];
        delete data.accounts[cleanOld];
        data.accounts[cleanNew] = oldAccount;

        const oldProfile = data.userProfiles[cleanOld];
        if (oldProfile) {
          delete data.userProfiles[cleanOld];
          oldProfile.username = cleanNew;
          data.userProfiles[cleanNew] = oldProfile;
        }

        if (data.usernameToId[cleanOld]) {
          data.usernameToId[cleanNew] = data.usernameToId[cleanOld];
          delete data.usernameToId[cleanOld];
        }

        if (onlineUsers.has(cleanOld)) {
          onlineUsers.set(cleanNew, onlineUsers.get(cleanOld));
          onlineUsers.delete(cleanOld);
        }

        data.usernameHistory.unshift({
          userId: oldAccount.id,
          oldUsername: cleanOld,
          newUsername: cleanNew,
          changedAt: new Date().toISOString()
        });

        saveData();
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
        if (!account || !account.hash) return safeCb(cb, { message: "Account not found" });

        if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, account.hash))) {
          return safeCb(cb, { message: "Current password is incorrect" });
        }

        if (!isStrongPassword(newPassword)) {
          return safeCb(cb, { message: "New password must be at least 8 characters with letters and numbers" });
        }
        if (await bcrypt.compare(newPassword, account.hash)) {
          return safeCb(cb, { message: "New password cannot be the same as old password" });
        }

        account.hash = await bcrypt.hash(newPassword, 12);
        saveData();

        safeCb(cb, { success: true, message: "Password updated successfully" });
      } catch (err) {
        console.error("Change Password Error:", err);
        safeCb(cb, { message: "Failed to update password" });
      }
    });

    socket.on("load-messages", async ({ friendId }) => {
      if (!currentUserId || !friendId) return;
      const convId = getChatId(currentUserId, friendId);
      const history = data.messages[convId] || [];

      const messagesWithData = history.map(msg => {
        const sender = Object.values(data.userProfiles).find(p => p.id === msg.from);
        return {
          ...msg,
          username: sender?.username || "Unknown",
          gender: sender?.gender || "Other"
        };
      });

      socket.emit("chat-history", { messages: messagesWithData });
    });

    socket.on("send-message", async ({ toId, text }) => {
      if (!currentUserId || !toId || !text.trim()) return;
      const convId = getChatId(currentUserId, toId);
      const senderProfile = Object.values(data.userProfiles).find(p => p.id === currentUserId);

      const message = {
        from: currentUserId,
        to: Number(toId),
        username: currentUser,
        text: text.trim(),
        timestamp: new Date().toISOString(),
        read: false,
        gender: senderProfile?.gender || null
      };

      if (!data.messages[convId]) data.messages[convId] = [];
      data.messages[convId].push(message);
      await saveData();

      socket.emit("new-message", message);

      const receiverProfile = Object.values(data.userProfiles).find(p => p.id === Number(toId));
      if (receiverProfile && onlineUsers.has(receiverProfile.username)) {
        io.to(onlineUsers.get(receiverProfile.username)).emit("new-message", message);
      }
    });

    socket.on("typing", ({ toId }) => {
      if (!currentUserId || !toId) return;
      const receiver = Object.values(data.userProfiles).find(p => p.id === Number(toId));
      if (receiver && onlineUsers.has(receiver.username)) {
        io.to(onlineUsers.get(receiver.username)).emit("user-typing", { fromId: currentUserId });
      }
    });

    socket.on("stop-typing", ({ toId }) => {
      if (!currentUserId || !toId) return;
      const receiver = Object.values(data.userProfiles).find(p => p.id === Number(toId));
      if (receiver && onlineUsers.has(receiver.username)) {
        io.to(onlineUsers.get(receiver.username)).emit("user-stopped-typing", { fromId: currentUserId });
      }
    });
  });
}

module.exports = setupSockets;
module.exports.onlineUsers = onlineUsers;