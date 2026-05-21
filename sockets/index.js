const bcrypt = require("bcrypt");

const rateLimitMap = new Map();

const { data, saveData } = require("../data");
const { clean, createProfile } = require("../helpers");

const onlineUsers = new Map();

const BCRYPT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_TIMEOUT = 1000 * 60 * 10;

function safeCb(cb, payload) {
  try {
    if (typeof cb === "function") {
      cb(payload);
    }
  } catch (err) {
    console.error("Callback Error:", err);
  }
}

function isRateLimited(ip) {
  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, {
      attempts: 0,
      timeoutUntil: 0
    });
  }

  const entry = rateLimitMap.get(ip);

  return entry.timeoutUntil > now;
}

function addFailedAttempt(ip) {
  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, {
      attempts: 0,
      timeoutUntil: 0
    });
  }

  const entry = rateLimitMap.get(ip);

  entry.attempts++;

  if (entry.attempts >= MAX_LOGIN_ATTEMPTS) {
    entry.timeoutUntil = now + LOGIN_TIMEOUT;
    entry.attempts = 0;
  }
}

function clearAttempts(ip) {
  rateLimitMap.delete(ip);
}

function validateUsername(name) {
  if (!name) return "Username required";

  if (name.length < 3 || name.length > 20) {
    return "Username must be 3-20 characters";
  }

  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    return "Only letters, numbers and underscores";
  }

  return null;
}

function validatePassword(password) {
  if (!password) return "Password required";

  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }

  if (password.length > 100) {
    return "Password too long";
  }

  return null;
}

function setupSockets(io) {
  io.on("connection", (socket) => {

    console.log("🔌 User connected");

    const ip =
      socket.handshake.headers["x-forwarded-for"] ||
      socket.handshake.address;

    socket.on("restore session", ({ username }, cb) => {
      try {

        const cleanName = clean(username);

        if (!cleanName) {
          return safeCb(cb, {
            success: false,
            message: "Invalid username"
          });
        }

        const account = data.accounts[cleanName];

        if (!account) {
          return safeCb(cb, {
            success: false,
            message: "Account not found"
          });
        }

        const existingSocketId = onlineUsers.get(cleanName);

        if (existingSocketId && existingSocketId !== socket.id) {

          const oldSocket =
            io.sockets.sockets.get(existingSocketId);

          if (oldSocket) {
            oldSocket.disconnect(true);
          }
        }

        socket.authenticated = true;
        socket.username = cleanName;

        onlineUsers.set(cleanName, socket.id);

        if (data.userProfiles[cleanName]) {

          data.userProfiles[cleanName].lastOnline =
            new Date().toISOString();

          saveData();
        }

        safeCb(cb, {
          success: true,
          username: cleanName,
          id: account.id,
          theme: account.theme || "light"
        });

      } catch (err) {

        console.error("Restore Session Error:", err);

        safeCb(cb, {
          success: false,
          message: "Server error"
        });
      }
    });

    socket.on("join", (username) => {
      try {

        const cleanName = clean(username);

        if (!cleanName) return;

        onlineUsers.set(cleanName, socket.id);

        socket.username = cleanName;

        if (data.userProfiles[cleanName]) {

          data.userProfiles[cleanName].lastOnline =
            new Date().toISOString();

          saveData();
        }

        console.log(
          `👤 ${cleanName} online | Total: ${onlineUsers.size}`
        );

      } catch (err) {

        console.error("Join Error:", err);
      }
    });

    socket.on("disconnect", () => {
      try {

        const username = socket.username;

        if (!username) return;

        if (data.userProfiles[username]) {

          data.userProfiles[username].lastOnline =
            new Date().toISOString();

          saveData();
        }

        onlineUsers.delete(username);

        console.log(
          `👤 ${username} offline | Total: ${onlineUsers.size}`
        );

      } catch (err) {

        console.error("Disconnect Error:", err);
      }
    });

    socket.on("login", async ({ username, password }, cb) => {
      try {

        if (isRateLimited(ip)) {
          return safeCb(cb, {
            success: false,
            message: "Too many attempts. Try again later."
          });
        }

        const name = clean(username);

        if (!name || typeof password !== "string") {
          return safeCb(cb, {
            success: false,
            message: "Invalid credentials"
          });
        }

        const lowerName = name.toLowerCase();

        if (!data.registeredNames[lowerName]) {

          addFailedAttempt(ip);

          return safeCb(cb, {
            success: false,
            message: "Invalid credentials"
          });
        }

        const account = data.accounts[name];

        if (!account) {

          addFailedAttempt(ip);

          return safeCb(cb, {
            success: false,
            message: "Invalid credentials"
          });
        }

        const validPassword = await bcrypt.compare(
          password,
          account.hash
        );

        if (!validPassword) {

          addFailedAttempt(ip);

          return safeCb(cb, {
            success: false,
            message: "Invalid credentials"
          });
        }

        clearAttempts(ip);

        socket.authenticated = true;
        socket.username = name;

        onlineUsers.set(name, socket.id);

        safeCb(cb, {
          success: true,
          username: name,
          id: account.id,
          theme: account.theme || "light"
        });

      } catch (err) {

        console.error("Login Error:", err);

        safeCb(cb, {
          success: false,
          message: "Server error"
        });
      }
    });

    socket.on("signup", async ({ username, password }, cb) => {
      try {

        if (isRateLimited(ip)) {
          return safeCb(cb, {
            success: false,
            message: "Too many attempts. Try again later."
          });
        }

        const name = clean(username);

        const usernameError = validateUsername(name);

        if (usernameError) {
          return safeCb(cb, {
            success: false,
            message: usernameError
          });
        }

        const passwordError =
          validatePassword(password);

        if (passwordError) {
          return safeCb(cb, {
            success: false,
            message: passwordError
          });
        }

        const lowerName = name.toLowerCase();

        if (data.registeredNames[lowerName]) {
          return safeCb(cb, {
            success: false,
            message: "Username already taken"
          });
        }

        const id = data.nextUserId++;

        data.registeredNames[lowerName] = true;

        data.accounts[name] = {
          id,
          hash: await bcrypt.hash(
            password,
            BCRYPT_ROUNDS
          ),
          joinDate: new Date().toISOString(),
          theme: "light"
        };

        createProfile(name);

        saveData();

        safeCb(cb, {
          success: true,
          username: name,
          id
        });

      } catch (err) {

        console.error("Signup Error:", err);

        safeCb(cb, {
          success: false,
          message: "Server error"
        });
      }
    });

    socket.on("save-theme", ({ theme }, cb) => {
      try {

        if (!socket.authenticated) {
          return safeCb(cb, {
            success: false,
            message: "Unauthorized"
          });
        }

        if (!["light", "dark"].includes(theme)) {
          return safeCb(cb, {
            success: false,
            message: "Invalid theme"
          });
        }

        const username = socket.username;

        const account = data.accounts[username];

        if (!account) {
          return safeCb(cb, {
            success: false,
            message: "Account not found"
          });
        }

        account.theme = theme;

        if (data.userProfiles[username]) {
          data.userProfiles[username].theme = theme;
        }

        saveData();

        safeCb(cb, {
          success: true
        });

      } catch (err) {

        console.error("Save Theme Error:", err);

        safeCb(cb, {
          success: false,
          message: "Server error"
        });
      }
    });

    socket.on("change username", ({ newName }, cb) => {
      try {

        if (!socket.authenticated) {
          return safeCb(cb, {
            success: false,
            message: "Unauthorized"
          });
        }

        const oldName = socket.username;

        const cleanNew = clean(newName);

        const validation =
          validateUsername(cleanNew);

        if (validation) {
          return safeCb(cb, {
            success: false,
            message: validation
          });
        }

        const oldLower = oldName.toLowerCase();
        const newLower = cleanNew.toLowerCase();

        if (oldLower === newLower) {
          return safeCb(cb, {
            success: false,
            message: "Same username"
          });
        }

        if (data.registeredNames[newLower]) {
          return safeCb(cb, {
            success: false,
            message: "Username taken"
          });
        }

        const accountData =
          data.accounts[oldName];

        delete data.accounts[oldName];

        data.accounts[cleanNew] = accountData;

        delete data.registeredNames[oldLower];

        data.registeredNames[newLower] = true;

        if (data.userProfiles[oldName]) {

          data.userProfiles[cleanNew] =
            data.userProfiles[oldName];

          delete data.userProfiles[oldName];
        }

        onlineUsers.delete(oldName);

        onlineUsers.set(cleanNew, socket.id);

        socket.username = cleanNew;

        saveData();

        io.emit("username updated", {
          oldName,
          newName: cleanNew
        });

        safeCb(cb, {
          success: true,
          newName: cleanNew
        });

      } catch (err) {

        console.error(
          "Change Username Error:",
          err
        );

        safeCb(cb, {
          success: false,
          message: "Server error"
        });
      }
    });

    socket.on(
      "change password",
      async ({ oldPassword, newPassword }, cb) => {
        try {

          if (!socket.authenticated) {
            return safeCb(cb, {
              success: false,
              message: "Unauthorized"
            });
          }

          const username = socket.username;

          const account = data.accounts[username];

          if (!account) {
            return safeCb(cb, {
              success: false,
              message: "Account not found"
            });
          }

          if (typeof oldPassword !== "string") {
            return safeCb(cb, {
              success: false,
              message: "Current password required"
            });
          }

          const validOld = await bcrypt.compare(
            oldPassword,
            account.hash
          );

          if (!validOld) {
            return safeCb(cb, {
              success: false,
              message: "Incorrect current password"
            });
          }

          const passwordError =
            validatePassword(newPassword);

          if (passwordError) {
            return safeCb(cb, {
              success: false,
              message: passwordError
            });
          }

          const sameAsOld =
            await bcrypt.compare(
              newPassword,
              account.hash
            );

          if (sameAsOld) {
            return safeCb(cb, {
              success: false,
              message: "Cannot reuse password"
            });
          }

          account.hash = await bcrypt.hash(
            newPassword,
            BCRYPT_ROUNDS
          );

          saveData();

          safeCb(cb, {
            success: true,
            message: "Password updated"
          });

        } catch (err) {

          console.error(
            "Password Change Error:",
            err
          );

          safeCb(cb, {
            success: false,
            message: "Server error"
          });
        }
      }
    );
  });
}

module.exports = setupSockets;
module.exports.onlineUsers = onlineUsers;