require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sanitizeHtml = require('sanitize-html');
const path = require('path');
const { MongoClient } = require('mongodb');
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
// MONGODB
// ----------------------
const client = new MongoClient(process.env.MONGO_URI);

let db;
let collection;

// ----------------------
// DATA STORE
// ----------------------
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

// ----------------------
// CONNECT DB
// ----------------------
async function connectDB() {
  await client.connect();
  db = client.db("livechat");
  collection = db.collection("appdata");

  const existing = await collection.findOne({ name: "mainData" });

  if (existing?.data) {
    data = existing.data;
    console.log("✅ MongoDB data loaded");
  } else {
    await collection.insertOne({ name: "mainData", data });
    console.log("📄 MongoDB initialized");
  }
}

async function saveData() {
  if (!collection) return;
  await collection.updateOne(
    { name: "mainData" },
    { $set: { data } },
    { upsert: true }
  );
}

// ----------------------
// HELPERS
// ----------------------
function clean(input) {
  return sanitizeHtml(String(input || '').trim(), {
    allowedTags: [],
    allowedAttributes: {}
  });
}

function getOnlineUsers() {
  const set = new Set();
  Object.values(data.onlineSockets).forEach(u => {
    if (u.isActive) set.add(u.username);
  });
  return [...set];
}

function broadcastOnline() {
  io.emit("online list", getOnlineUsers());
}

function findSocketIdByUsername(username) {
  return Object.entries(data.onlineSockets)
    .find(([_, v]) => v.username === username)?.[0] || null;
}

function sendPendingRequests(username, socketId) {
  if (!data.pendingRequests[username]) return;
  data.pendingRequests[username].forEach(from => {
    io.to(socketId).emit("friend request received", { from });
  });
}

// ----------------------
// SOCKET.IO
// ----------------------
io.on("connection", (socket) => {

  // ---------------- SIGNUP ----------------
  socket.on("signup", async ({ username, password }, cb) => {
    const name = clean(username);
    const lower = name.toLowerCase();

    if (name.length < 2 || name.length > 20)
      return cb({ success: false });

    if (data.registeredNames[lower])
      return cb({ success: false });

    const id = data.nextUserId++;

    data.registeredNames[lower] = true;

    data.accounts[name] = {
      id,
      hash: await bcrypt.hash(password, 10),
      joinDate: new Date().toISOString(),
      theme: "light",
      isOnline: false,
      lastOnline: null
    };

    data.friendData[name] = [];
    data.pendingRequests[name] = [];
    data.userTheme[name] = "light";

    data.userProfiles[name] = {
      id,
      username: name,
      joinDate: new Date().toISOString(),
      theme: "light",
      isOnline: false,
      lastOnline: null
    };

    data.usernameToId[name] = id;

    await saveData();

    cb({ success: true, username: name, id });
  });

  // ---------------- LOGIN ----------------
  socket.on("login", async ({ username, password }, cb) => {
    const name = clean(username);
    const account = data.accounts[name];

    if (!account)
      return cb({ success: false });

    const ok = await bcrypt.compare(password, account.hash);

    if (!ok)
      return cb({ success: false });

    cb({
      success: true,
      username: name,
      id: account.id,
      theme: account.theme
    });
  });

  // ---------------- JOIN ----------------
  socket.on("join", (rawName) => {
    const name = clean(rawName);
    const account = data.accounts[name];
    if (!account) return;

    data.onlineSockets[socket.id] = {
      username: name,
      isActive: true
    };

    account.isOnline = true;

    if (data.userProfiles[name]) {
      data.userProfiles[name].isOnline = true;
    }

    saveData();

    socket.emit("join result", { success: true });
    broadcastOnline();
  });

  // ---------------- CHAT ----------------
  socket.on("chat message", (msg) => {
    const user = data.onlineSockets[socket.id];
    if (!user) return;

    io.emit("chat message", {
      from: user.username,
      text: clean(msg.text),
      time: new Date().toISOString()
    });
  });

  // ---------------- DISCONNECT ----------------
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
    broadcastOnline();
  });
});

// ----------------------
// 🔥 PROFILE API (RESTORE - IMPORTANT)
// ----------------------
app.get("/api/profile/:id", (req, res) => {
  const id = Number(req.params.id);

  const profile = Object.values(data.userProfiles)
    .find(p => p.id === id);

  if (!profile)
    return res.status(404).json({ error: "User not found" });

  res.json(profile);
});

// ----------------------
// PAGES
// ----------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get("/home", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get("/settings", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get("/users/profile", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

// ----------------------
// START
// ----------------------
(async () => {
  await connectDB();

  server.listen(PORT, () =>
    console.log("✅ Server running on port", PORT)
  );
})();