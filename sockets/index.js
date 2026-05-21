const bcrypt = require('bcrypt');
const crypto = require('crypto'); // ✅ Built-in token generator
const { data, saveData } = require('../data');
const { clean, createProfile } = require('../helpers');

const onlineUsers = new Map(); // username -> socket.id

function setupSockets(io) {
  io.on("connection", (socket) => {
    console.log("🔌 User connected");

    // ==================== SESSION JOIN ====================
    // ✅ SECURE: Users identify via their secret session token rather than arbitrary text
    socket.on("join", (token) => {
      if (!token || !data.sessions[token]) return;
      
      const username = data.sessions[token];
      onlineUsers.set(username, socket.id);

      if (data.userProfiles[username]) {
        data.userProfiles[username].lastOnline = new Date().toISOString();
        saveData();
      }
      console.log(`👤 ${username} is online | Total online: ${onlineUsers.size}`);
    });

    socket.on("disconnect", () => {
      for (const [username, id] of onlineUsers.entries()) {
        if (id === socket.id) {
          if (data.userProfiles[username]) {
            data.userProfiles[username].lastOnline = new Date().toISOString();
            saveData();
          }
          onlineUsers.delete(username);
          console.log(`👤 ${username} went offline | Total online: ${onlineUsers.size}`);
          break;
        }
      }
    });

    // ==================== AUTH ====================
    socket.on("login", async ({ username, password }, cb) => {
      try {
        const name = clean(username);
        const account = data.accounts[name];

        if (!account)
          return safeCb(cb, { success: false, message: "Account not found" });

        const validPassword = await bcrypt.compare(password, account.hash);
        if (!validPassword)
          return safeCb(cb, { success: false, message: "Incorrect password" });

        // ✅ Secure Token Generation
        const token = crypto.randomBytes(32).toString('hex');
        data.sessions[token] = name;
        saveData();

        safeCb(cb, { success: true, token, username: name, id: account.id, theme: account.theme });
      } catch (err) {
        console.error("Login Error:", err);
        safeCb(cb, { success: false, message: "Server error — try again" });
      }
    });

    socket.on("signup", async ({ username, password }, cb) => {
      try {
        const name = clean(username);
        const lowerName = name.toLowerCase();

        if (name.length < 3 || name.length > 20)
          return safeCb(cb, { success: false, message: "Username must be 3-20 characters" });
        if (/\s/.test(name))
          return safeCb(cb, { success: false, message: "No spaces allowed" });
        if (!/^[a-zA-Z0-9_]+$/.test(name))
          return safeCb(cb, { success: false, message: "Only letters, numbers and underscores" });
        if (password.length < 8)
          return safeCb(cb, { success: false, message: "Password must be at least 8 characters" });
        if (data.registeredNames[lowerName])
          return safeCb(cb, { success: false, message: "Username already taken" });

        const id = data.nextUserId++;
        data.registeredNames[lowerName] = true;
        data.accounts[name] = {
          id,
          hash: await bcrypt.hash(password, 10),
          joinDate: new Date().toISOString(),
          theme: "light"
        };

        createProfile(name, id); // ✅ Fixed profile sync
        
        // ✅ Automatically log them in by generating an active token
        const token = crypto.randomBytes(32).toString('hex');
        data.sessions[token] = name;
        saveData();

        safeCb(cb, { success: true, token, username: name, id });
      } catch (err) {
        console.error("Signup Error:", err);
        safeCb(cb, { success: false, message: "Server error — try again" });
      }
    });

    // ==================== PROFILE CONTROL & LOGOUT ====================
    socket.on("logout", (token) => {
      if (token && data.sessions[token]) {
        const username = data.sessions[token];
        onlineUsers.delete(username);
        delete data.sessions[token];
        saveData();
      }
    });

    socket.on("save-theme", ({ theme, username }) => {
      try {
        const account = data.accounts[username];
        if (!account) return;
        account.theme = theme;
        if (data.userProfiles[username]) data.userProfiles[username].theme = theme;
        saveData();
      } catch (err) {
        console.error("Save Theme Error:", err);
      }
    });

    socket.on("change username", ({ oldName, newName }, cb) => {
      try {
        const cleanOld = clean(oldName);
        const cleanNew = clean(newName);
        const oldLower = cleanOld.toLowerCase();
        const newLower = cleanNew.toLowerCase();

        if (cleanNew.length < 3 || cleanNew.length > 20)
          return safeCb(cb, { success: false, message: "Name must be 3-20 characters" });
        if (!/^[a-zA-Z0-9_]+$/.test(cleanNew))
          return safeCb(cb, { success: false, message: "Only letters, numbers and underscores" });
        if (data.registeredNames[newLower])
          return safeCb(cb, { success: false, message: "Name already taken" });
        if (oldLower === newLower)
          return safeCb(cb, { success: false, message: "Same as current name" });
        if (!data.accounts[cleanOld])
          return safeCb(cb, { success: false, message: "Original user not found" });

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

        if (data.usernameToId[cleanOld]) {
          data.usernameToId[cleanNew] = data.usernameToId[cleanOld];
          delete data.usernameToId[cleanOld];
        }

        // Keep active sessions mapped accurately to the updated name
        for (const [token, user] of Object.entries(data.sessions)) {
          if (user === cleanOld) data.sessions[token] = cleanNew;
        }

        if (onlineUsers.has(cleanOld)) {
          onlineUsers.set(cleanNew, onlineUsers.get(cleanOld));
          onlineUsers.delete(cleanOld);
        }

        saveData();
        io.emit("username updated", { oldName: cleanOld, newName: cleanNew });

        safeCb(cb, { success: true, newName: cleanNew });
      } catch (err) {
        console.error("Change Username Error:", err);
        safeCb(cb, { success: false, message: "Server error — try again" });
      }
    });

    socket.on("change password", async ({ username, newPassword }, cb) => {
      try {
        const name = clean(username);
        const account = data.accounts[name];
        if (!account)
          return safeCb(cb, { success: false, message: "Account not found" });

        const sameAsOld = await bcrypt.compare(newPassword, account.hash);
        if (sameAsOld)
          return safeCb(cb, { success: false, message: "Password cannot be identical to current password" });

        if (newPassword.length < 8)
          return safeCb(cb, { success: false, message: "Password must be at least 8 characters" });

        account.hash = await bcrypt.hash(newPassword, 10);
        saveData();

        safeCb(cb, { success: true, message: "Password updated successfully" });
      } catch (err) {
        console.error("CHANGE PASSWORD ERROR:", err);
        safeCb(cb, { success: false, message: "Something went wrong" });
      }
    });
  });
}

function safeCb(cb, data) {
  if (typeof cb === "function") cb(data);
}

module.exports = setupSockets;
module.exports.onlineUsers = onlineUsers;