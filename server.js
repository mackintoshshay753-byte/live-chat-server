require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sanitizeHtml = require('sanitize-html');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = ["https://idontknowww.neocities.org"];

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true }
});

// ----------------------
// DATA FILE
// ----------------------
const DATA_PATH = path.join(__dirname, 'chat-data.json');

let data = {
  nextUserId: 1,
  onlineSockets: {},
  registeredNames: {},
  accounts: {},
  friendData: {},
  pendingRequests: {},
  userTheme: {},
  userProfiles: {},
  usernameToId: {}
};

function loadData() {
  if (fs.existsSync(DATA_PATH)) {
    try {
      const fileData = fs.readFileSync(DATA_PATH, 'utf8');
      data = { ...data, ...JSON.parse(fileData) };
      console.log("✅ Data loaded");
    } catch (err) {
      console.error("⚠️ Failed loading data:", err.message);
      saveData();
    }
  } else {
    saveData();
  }
}

function saveData() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

loadData();

// ----------------------
// HELPERS
// ----------------------
function clean(input) {
  return sanitizeHtml(String(input || '').trim(), {
    allowedTags: [],
    allowedAttributes: {}
  });
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

// ----------------------
// SOCKET
// ----------------------
io.on("connection", (socket) => {

  // ----------------------
  // SIGNUP
  // ----------------------
  socket.on("signup", (async ({ username, password }, cb) => {
    const name = clean(username);
    const lower = name.toLowerCase();

    if (name.length < 2 || name.length > 20)
      return cb({ success: false, message: "Username must be 2-20 characters" });

    if (/\s/.test(name))
      return cb({ success: false, message: "No spaces allowed" });

    if (!/^[a-zA-Z0-9_]+$/.test(name))
      return cb({ success: false, message: "Only letters, numbers, underscores" });

    if (password.length < 8)
      return cb({ success: false, message: "Password too short" });

    if (data.registeredNames[lower])
      return cb({ success: false, message: "Username taken" });

    const id = data.nextUserId++;

    data.registeredNames[lower] = true;

    data.accounts[lower] = {
      id,
      hash: await bcrypt.hash(password, 10),
      joinDate: new Date().toISOString(),
      theme: "light",
      lastOnline: null,
      isOnline: false
    };

    data.friendData[lower] = [];
    data.pendingRequests[lower] = [];
    data.userTheme[lower] = "light";

    data.userProfiles[lower] = {
      id,
      username: name,
      joinDate: new Date().toISOString(),
      theme: "light",
      isOnline: false
    };

    data.usernameToId[lower] = id;

    saveData();

    cb({ success: true, username: name, id });
  }));

  // ----------------------
  // LOGIN
  // ----------------------
  socket.on("login", async ({ username, password }, cb) => {
    const name = clean(username);
    const lower = name.toLowerCase();

    const account = data.accounts[lower];

    if (!account)
      return cb({ success: false, message: "Account not found" });

    const ok = await bcrypt.compare(password, account.hash);

    if (!ok)
      return cb({ success: false, message: "Incorrect password" });

    cb({
      success: true,
      username: name,
      id: account.id,
      theme: account.theme
    });
  });

  // ----------------------
  // JOIN
  // ----------------------
  socket.on("join", (rawName) => {
    const name = clean(rawName);
    const lower = name.toLowerCase();

    const account = data.accounts[lower];
    if (!account) return;

    data.onlineSockets[socket.id] = {
      username: lower,
      isActive: true
    };

    account.isOnline = true;

    if (data.userProfiles[lower]) {
      data.userProfiles[lower].isOnline = true;
    }

    saveData();

    socket.emit("join result", { success: true });
  });

  // ----------------------
  // CHANGE PASSWORD
  // ----------------------
  socket.on("change password", async ({ username, newPassword }, cb) => {
    const lower = clean(username).toLowerCase();
    const account = data.accounts[lower];

    if (!account)
      return cb({ success: false, message: "Account not found" });

    if (newPassword.length < 8)
      return cb({ success: false, message: "Password too short" });

    account.hash = await bcrypt.hash(newPassword, 10);
    saveData();

    cb({ success: true });
  });

  // ----------------------
  // CHAT
  // ----------------------
  socket.on("chat message", (msg) => {
    const user = data.onlineSockets[socket.id];
    if (!user) return;

    io.emit("chat message", {
      from: user.username,
      text: clean(msg.text),
      time: new Date().toISOString()
    });
  });

  // ----------------------
  // DISCONNECT
  // ----------------------
  socket.on("disconnect", () => {
    const user = data.onlineSockets[socket.id];
    if (!user) return;

    const account = data.accounts[user.username];
    if (account) {
      account.isOnline = false;
      account.lastOnline = new Date().toISOString();
    }

    delete data.onlineSockets[socket.id];
    saveData();
  });
});

// ----------------------
server.listen(PORT, () =>
  console.log("Server running on port", PORT)
);