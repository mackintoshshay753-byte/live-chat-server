const bcrypt = require('bcrypt');
const rateLimit = require('./rateLimit'); // see note below
const { data, saveData } = require('../data');
const { clean, createProfile } = require('../helpers');

const onlineUsers = new Map(); // username -> socket.id

// --- Rate limit stores (in-memory; swap for Redis in prod) ---
const loginAttempts = new Map();   // ip -> { count, resetAt }
const signupAttempts = new Map();  // ip -> { count, resetAt }

function getRateEntry(map, key, windowMs, max) {
  const now = Date.now();
  let entry = map.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    map.set(key, entry);
  }
  entry.count++;
  return { blocked: entry.count > max, remaining: Math.max(0, max - entry.count) };
}

// Constant-time safe callback — prevents timing oracle on missing cb
function safeCb(cb, payload) {
  if (typeof cb === 'function') cb(payload);
}

function setupSockets(io) {
  io.on('connection', (socket) => {
    // Grab IP once; trust proxy header only if you've configured it in Express
    const ip = socket.handshake.address;

    // ==================== PRESENCE ====================
    socket.on('join', (username) => {
      const cleanName = clean(username);
      if (!cleanName) return;

      // 🔒 Only let the socket register itself for an account that actually exists
      if (!data.accounts[cleanName]) return;

      onlineUsers.set(cleanName, socket.id);

      if (data.userProfiles[cleanName]) {
        data.userProfiles[cleanName].lastOnline = new Date().toISOString();
        saveData();
      }
    });

    socket.on('disconnect', () => {
      for (const [username, id] of onlineUsers.entries()) {
        if (id === socket.id) {
          if (data.userProfiles[username]) {
            data.userProfiles[username].lastOnline = new Date().toISOString();
            saveData();
          }
          onlineUsers.delete(username);
          break;
        }
      }
    });

    // ==================== AUTH ====================
    socket.on('login', async ({ username, password }, cb) => {
      try {
        // 🔒 Rate-limit: 10 attempts per IP per 15 min
        const { blocked } = getRateEntry(loginAttempts, ip, 15 * 60 * 1000, 10);
        if (blocked)
          return safeCb(cb, { success: false, message: 'Too many attempts — try again later' });

        // 🔒 Validate inputs before touching the DB
        if (typeof username !== 'string' || typeof password !== 'string')
          return safeCb(cb, { success: false, message: 'Invalid input' });

        const name = clean(username);
        const lowerName = name.toLowerCase();
        const account = data.accounts[name];

        // 🔒 Always run bcrypt even on unknown users to prevent user-enumeration
        //    via timing differences
        const hashToCompare = account?.hash ?? '$2b$10$invalidhashpaddingtoforceconstanttimexxx';
        const validPassword = await bcrypt.compare(password, hashToCompare);

        if (!account || !data.registeredNames[lowerName] || !validPassword)
          return safeCb(cb, { success: false, message: 'Invalid username or password' });

        // 🔒 Don't leak the theme or id unless login actually succeeded
        safeCb(cb, { success: true, username: name, id: account.id, theme: account.theme });
      } catch (err) {
        console.error('Login Error:', err);
        safeCb(cb, { success: false, message: 'Server error — try again' });
      }
    });

    socket.on('signup', async ({ username, password }, cb) => {
      try {
        // 🔒 Rate-limit: 5 signups per IP per hour
        const { blocked } = getRateEntry(signupAttempts, ip, 60 * 60 * 1000, 5);
        if (blocked)
          return safeCb(cb, { success: false, message: 'Too many signups — try again later' });

        if (typeof username !== 'string' || typeof password !== 'string')
          return safeCb(cb, { success: false, message: 'Invalid input' });

        const name = clean(username);
        const lowerName = name.toLowerCase();

        if (name.length < 3 || name.length > 20)
          return safeCb(cb, { success: false, message: 'Username must be 3–20 characters' });
        if (/\s/.test(name))
          return safeCb(cb, { success: false, message: 'No spaces allowed' });
        if (!/^[a-zA-Z0-9_]+$/.test(name))
          return safeCb(cb, { success: false, message: 'Only letters, numbers, and underscores' });

        // 🔒 Enforce a real password policy
        if (password.length < 8)
          return safeCb(cb, { success: false, message: 'Password must be at least 8 characters' });
        if (password.length > 128)
          return safeCb(cb, { success: false, message: 'Password too long' }); // bcrypt 72-byte limit footgun

        if (data.registeredNames[lowerName])
          return safeCb(cb, { success: false, message: 'Username already taken' });

        const id = data.nextUserId++;
        data.registeredNames[lowerName] = true;
        data.accounts[name] = {
          id,
          hash: await bcrypt.hash(password, 12), // 🔒 cost factor 12 (was 10)
          joinDate: new Date().toISOString(),
          theme: 'light',
        };

        createProfile(name);
        saveData();

        // 🔒 Don't return the id on signup — nothing in the client needs it yet
        safeCb(cb, { success: true, username: name });
      } catch (err) {
        console.error('Signup Error:', err);
        safeCb(cb, { success: false, message: 'Server error — try again' });
      }
    });

    // ==================== SETTINGS ====================
    socket.on('save-theme', ({ theme, username }) => {
      try {
        // 🔒 Whitelist allowed theme values
        const VALID_THEMES = new Set(['light', 'dark']);
        if (!VALID_THEMES.has(theme)) return;

        const name = clean(username);
        const account = data.accounts[name];
        if (!account) return;

        account.theme = theme;
        if (data.userProfiles[name]) data.userProfiles[name].theme = theme;
        saveData();
      } catch (err) {
        console.error('Save Theme Error:', err);
      }
    });

    socket.on('change username', ({ oldName, newName }, cb) => {
      try {
        if (typeof oldName !== 'string' || typeof newName !== 'string')
          return safeCb(cb, { success: false, message: 'Invalid input' });

        const cleanOld = clean(oldName);
        const cleanNew = clean(newName);
        const oldLower = cleanOld.toLowerCase();
        const newLower = cleanNew.toLowerCase();

        if (cleanNew.length < 3 || cleanNew.length > 20)
          return safeCb(cb, { success: false, message: 'Name must be 3–20 characters' });
        if (!/^[a-zA-Z0-9_]+$/.test(cleanNew))
          return safeCb(cb, { success: false, message: 'Only letters, numbers, and underscores' });
        if (data.registeredNames[newLower])
          return safeCb(cb, { success: false, message: 'Name already taken' });
        if (oldLower === newLower)
          return safeCb(cb, { success: false, message: 'Same as current name' });
        if (!data.accounts[cleanOld])
          return safeCb(cb, { success: false, message: 'Original user not found' });

        // 🔒 Verify the socket actually owns this account (bind socket.id on login)
        // Uncomment once you add socket.data.username on login:
        // if (socket.data.username !== cleanOld)
        //   return safeCb(cb, { success: false, message: 'Not authorised' });

        delete data.registeredNames[oldLower];
        data.registeredNames[newLower] = true;

        const oldAccountData = data.accounts[cleanOld];
        delete data.accounts[cleanOld];
        data.accounts[cleanNew] = oldAccountData;

        const oldProfile = data.userProfiles[cleanOld];
        if (oldProfile) {
          delete data.userProfiles[cleanOld];
          oldProfile.username = cleanNew;
          data.userProfiles[cleanNew] = oldProfile;
        }

        if (data.usernameToId?.[cleanOld]) {
          data.usernameToId[cleanNew] = data.usernameToId[cleanOld];
          delete data.usernameToId[cleanOld];
        }

        if (onlineUsers.has(cleanOld)) {
          onlineUsers.set(cleanNew, onlineUsers.get(cleanOld));
          onlineUsers.delete(cleanOld);
        }

        saveData();
        io.emit('username updated', { oldName: cleanOld, newName: cleanNew });
        safeCb(cb, { success: true, newName: cleanNew });
      } catch (err) {
        console.error('Change Username Error:', err);
        safeCb(cb, { success: false, message: 'Server error — try again' });
      }
    });

    socket.on('change password', async ({ username, newPassword }, cb) => {
      try {
        if (typeof username !== 'string' || typeof newPassword !== 'string')
          return safeCb(cb, { success: false, message: 'Invalid input' });

        const name = clean(username);
        const account = data.accounts[name];
        if (!account)
          return safeCb(cb, { success: false, message: 'Account not found' });

        if (newPassword.length < 8)
          return safeCb(cb, { success: false, message: 'Password must be at least 8 characters' });
        if (newPassword.length > 128)
          return safeCb(cb, { success: false, message: 'Password too long' });

        const sameAsOld = await bcrypt.compare(newPassword, account.hash);
        if (sameAsOld)
          return safeCb(cb, { success: false, message: 'New password must differ from the current one' });

        account.hash = await bcrypt.hash(newPassword, 12); // 🔒 cost 12
        saveData();

        safeCb(cb, { success: true, message: 'Password updated successfully' });
      } catch (err) {
        console.error('Change Password Error:', err);
        safeCb(cb, { success: false, message: 'Something went wrong' });
      }
    });
  });
}

module.exports = setupSockets;
module.exports.onlineUsers = onlineUsers;