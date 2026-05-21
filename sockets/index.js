const bcrypt = require('bcrypt');
const { data, saveData } = require('../data');
const { clean, createProfile } = require('../helpers');

const onlineUsers = new Map();

function setupSockets(io) {
  io.on("connection", (socket) => {
    console.log("🔌 User connected");

    socket.on("join", (username) => {
      const cleanName = clean(username);
      if (!cleanName) return;

      socket.data.user = cleanName;

      onlineUsers.set(socket.id, cleanName);

      if (data.userProfiles[cleanName]) {
        data.userProfiles[cleanName].lastOnline = new Date().toISOString();
        saveData();
      }
    });

    socket.on("disconnect", () => {
      const username = onlineUsers.get(socket.id);
      if (username) {
        if (data.userProfiles[username]) {
          data.userProfiles[username].lastOnline = new Date().toISOString();
          saveData();
        }
        onlineUsers.delete(socket.id);
      }
    });

    socket.on("login", async ({ username, password }, cb) => {
      try {
        const name = clean(username);
        const lowerName = name.toLowerCase();
        const account = data.accounts[name];

        if (!account || !data.registeredNames[lowerName])
          return safeCb(cb, { success: false, message: "Account not found" });

        const validPassword = await bcrypt.compare(password, account.hash);
        if (!validPassword)
          return safeCb(cb, { success: false, message: "Incorrect password" });

        socket.data.user = name;

        safeCb(cb, { success: true, username: name, id: account.id, theme: account.theme });
      } catch (err) {
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

        createProfile(name);
        saveData();

        socket.data.user = name;

        safeCb(cb, { success: true, username: name, id });
      } catch (err) {
        safeCb(cb, { success: false, message: "Server error — try again" });
      }
    });

    socket.on("save-theme", ({ theme }) => {
      const username = socket.data.user;
      if (!username) return;

      const account = data.accounts[username];
      if (!account) return;

      account.theme = theme;
      if (data.userProfiles[username]) data.userProfiles[username].theme = theme;
      saveData();
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

        const accountData = data.accounts[cleanOld];
        delete data.accounts[cleanOld];
        data.accounts[cleanNew] = accountData;

        const profile = data.userProfiles[cleanOld];
        if (profile) {
          delete data.userProfiles[cleanOld];
          profile.username = cleanNew;
          data.userProfiles[cleanNew] = profile;
        }

        if (data.usernameToId[cleanOld]) {
          data.usernameToId[cleanNew] = data.usernameToId[cleanOld];
          delete data.usernameToId[cleanOld];
        }

        const socketId = [...onlineUsers.entries()].find(([id, u]) => u === cleanOld)?.[0];

        if (socketId) {
          onlineUsers.set(socketId, cleanNew);
        }

        saveData();
        io.emit("username updated", { oldName: cleanOld, newName: cleanNew });

        safeCb(cb, { success: true, newName: cleanNew });
      } catch (err) {
        safeCb(cb, { success: false, message: "Server error — try again" });
      }
    });

    socket.on("change password", async ({ newPassword }, cb) => {
      try {
        const username = socket.data.user;
        if (!username)
          return safeCb(cb, { success: false, message: "Not logged in" });

        const account = data.accounts[username];
        if (!account)
          return safeCb(cb, { success: false, message: "Account not found" });

        const sameAsOld = await bcrypt.compare(newPassword, account.hash);
        if (sameAsOld)
          return safeCb(cb, { success: false, message: "Password cannot be the same" });

        if (newPassword.length < 8)
          return safeCb(cb, { success: false, message: "Password must be at least 8 characters" });

        account.hash = await bcrypt.hash(newPassword, 10);
        saveData();

        safeCb(cb, { success: true, message: "Password updated successfully" });
      } catch (err) {
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