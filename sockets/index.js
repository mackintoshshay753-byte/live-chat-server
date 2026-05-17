const bcrypt = require('bcrypt');
const { data, saveData } = require('../data');
const { clean, createProfile } = require('../helpers');

function setupSockets(io) {
  io.on("connection", (socket) => {

    // SIGNUP
    socket.on("signup", async ({ username, password }, cb) => {
      try {
        const name = clean(username);
        const lowerName = name.toLowerCase();

        if (name.length < 2 || name.length > 20)
          return safeCb(cb, { success: false, message: "Username must be 2-20 characters" });
        if (/\s/.test(name))
          return safeCb(cb, { success: false, message: "No spaces allowed" });
        if (!/^[a-zA-Z0-9_]+$/.test(name))
          return safeCb(cb, { success: false, message: "Only letters, numbers and underscores" });
        if (password.length < 8)
          return safeCb(cb, { success: false, message: "Password must be at least 8 characters" });
        if (data.registeredNames[lowerName])
          return safeCb(cb, { success: false, message: "Username already taken" });

        const id = data.nextUserId;
        data.registeredNames[lowerName] = true;
        data.accounts[name] = {
          id,
          hash: await bcrypt.hash(password, 10),
          joinDate: new Date().toISOString(),
          theme: "light"
        };
        createProfile(name);
        saveData();

        safeCb(cb, { success: true, username: name, id });
      } catch (err) {
        console.error("Signup Error:", err);
        safeCb(cb, { success: false, message: "Server error — try again" });
      }
    });

    // LOGIN
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

        safeCb(cb, { success: true, username: name, id: account.id, theme: account.theme });
      } catch (err) {
        console.error("Login Error:", err);
        safeCb(cb, { success: false, message: "Server error — try again" });
      }
    });

    // SAVE THEME
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

    // CHANGE USERNAME
    socket.on("change username", ({ oldName, newName }, cb) => {
      try {
        const cleanOld = clean(oldName);
        const cleanNew = clean(newName);
        const oldLower = cleanOld.toLowerCase();
        const newLower = cleanNew.toLowerCase();

        if (cleanNew.length < 2 || cleanNew > 20)
          return safeCb(cb, { success: false, message: "Name must be 2-20 characters" });
        if (data.registeredNames[newLower])
          return safeCb(cb, { success: false, message: "Name already taken" });
        if (oldLower === newLower)
          return safeCb(cb, { success: false, message: "Same as current name" });

        delete data.registeredNames[oldLower];
        data.registeredNames[newLower] = true;

        data.accounts[cleanNew] = data.accounts[cleanOld];
        delete data.accounts[cleanOld];

        const oldProfile = data.userProfiles[cleanOld];
        if (oldProfile) {
          oldProfile.username = cleanNew;
          data.userProfiles[cleanNew] = oldProfile;
          data.usernameToId[cleanNew] = oldProfile.id;
          delete data.userProfiles[cleanOld];
          delete data.usernameToId[cleanOld];
        }

        saveData();
        safeCb(cb, { success: true, newName: cleanNew });
        io.emit("username updated", { oldName: cleanOld, newName: cleanNew });
      } catch (err) {
        console.error("Change Username Error:", err);
        safeCb(cb, { success: false, message: "Server error — try again" });
      }
    });

    // ✅ CHANGE PASSWORD — 100% FIXED, NO CRASHES
    socket.on("change password", async ({ username, newPassword }, cb) => {
      try {
        const name = clean(username);
        const account = data.accounts[name];
        if (!account)
          return safeCb(cb, { success: false, message: "Account not found" });

        const sameAsOld = await bcrypt.compare(newPassword, account.hash);
        if (sameAsOld)
          return safeCb(cb, { success: false, message: "Password cannot be the same as it already is" });

        if (newPassword.length < 8)
          return safeCb(cb, { success: false, message: "Password must be at least 8 characters" });

        account.hash = await bcrypt.hash(newPassword, 10);
        saveData();

        // ✅ Success message sent
        safeCb(cb, { success: true, message: "Password updated successfully" });

      } catch (err) {
        console.error("CHANGE PASSWORD ERROR:", err);
        safeCb(cb, { success: false, message: "Something went wrong" });
      }
    });

  });
}

// ✅ HELPER: Only call callback if it exists — THIS FIXES THE CRASH FOREVER
function safeCb(cb, data) {
  if (typeof cb === "function") {
    cb(data);
  }
}

module.exports = setupSockets;