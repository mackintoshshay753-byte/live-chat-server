const bcrypt = require('bcrypt');
const { data, saveData, setUserOnline, setUserOffline } = require('../data');

function setupSockets(io) {
  io.on("connection", (socket) => {
    console.log("🔌 User connected");
    let currentUsername = null;

    // LOGIN
    socket.on("login", async ({ username, password }, cb) => {
      try {
        const name = username.trim();
        const lowerName = name.toLowerCase();
        const account = data.accounts[name];

        if (!account || !data.registeredNames[lowerName]) {
          return safeCb(cb, { success: false, message: "Account not found" });
        }

        const validPassword = await bcrypt.compare(password, account.hash);
        if (!validPassword) {
          return safeCb(cb, { success: false, message: "Incorrect password" });
        }

        currentUsername = name;
        setUserOnline(name);
        io.emit("user status changed", { username: name, online: true });

        safeCb(cb, { 
          success: true, 
          username: name, 
          id: account.id, 
          theme: account.theme 
        });
      } catch (err) {
        console.error("Login Error:", err);
        safeCb(cb, { success: false, message: "Server error — try again" });
      }
    });

    // SIGNUP
    socket.on("signup", async ({ username, password }, cb) => {
      try {
        const name = username.trim();
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

        // Create profile
        if (!data.userProfiles[name]) {
          data.userProfiles[name] = {
            id,
            username: name,
            joinDate: new Date().toISOString(),
            theme: "light"
          };
          data.usernameToId[name] = id;
        }

        saveData();

        currentUsername = name;
        setUserOnline(name);
        io.emit("user status changed", { username: name, online: true });

        safeCb(cb, { success: true, username: name, id });
      } catch (err) {
        console.error("Signup Error:", err);
        safeCb(cb, { success: false, message: "Server error — try again" });
      }
    });

    // DISCONNECT
    socket.on("disconnect", () => {
      if (currentUsername) {
        setUserOffline(currentUsername);
        io.emit("user status changed", { username: currentUsername, online: false });
        console.log(`👤 ${currentUsername} went offline`);
      }
    });

    // Optional: Manual status change
    socket.on("set status", ({ username, online }) => {
      if (online) setUserOnline(username);
      else setUserOffline(username);
      io.emit("user status changed", { username, online });
    });
  });
}

function safeCb(cb, data) {
  if (typeof cb === "function") cb(data);
}

module.exports = setupSockets;