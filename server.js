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
// STORAGE — PRESERVES ALL OLD USERS
// ----------------------
const DATA_PATH = path.join(__dirname, 'chat-data.json');

const DEFAULT_DATA = {
  nextUserId: 1,
  registeredNames: {},
  accounts: {},
  userProfiles: {},
  usernameToId: {},
  activeConnections: {} // Track every open tab/connection
};

let data = { ...DEFAULT_DATA };

// ----------------------
// SAFE LOAD / SAVE — NO MORE USER WIPES
// ----------------------
function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    console.log("📄 No file — creating new");
    saveData();
    return;
  }
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const loaded = JSON.parse(raw);
    data = { ...DEFAULT_DATA, ...loaded };
    console.log("✅ Data loaded — ID 1 & all users preserved");
  } catch (err) {
    console.error("⚠️ Data read error — backup saved, starting fresh");
    if (fs.existsSync(DATA_PATH)) fs.renameSync(DATA_PATH, DATA_PATH + `.bak-${Date.now()}.json`);
    saveData();
  }
}

function saveData() {
  try {
    // Remove temp connection data before saving
    const saveCopy = JSON.parse(JSON.stringify(data));
    saveCopy.activeConnections = {};
    fs.writeFileSync(DATA_PATH, JSON.stringify(saveCopy, null, 2), 'utf8');
  } catch (err) {
    console.error("❌ Save failed:", err.message);
  }
}

loadData();

// ----------------------
// HELPERS
// ----------------------
function clean(input) {
  return sanitizeHtml(String(input || '').trim(), { allowedTags: [], allowedAttributes: {} });
}

function createProfile(username) {
  if (data.userProfiles[username]) return data.userProfiles[username];

  const id = data.nextUserId++;
  const profile = {
    id,
    username,
    joinDate: new Date().toISOString(),
    theme: "light",
    lastOnline: null,
    isOnline: false
  };

  data.userProfiles[username] = profile;
  data.usernameToId[username] = id;
  saveData();
  return profile;
}

function getProfileById(id) {
  id = Number(id);
  return Object.values(data.userProfiles).find(p => Number(p.id) === id) || null;
}

// ✅ Update online status: ONLINE = ANY connection open; OFFLINE = NO connections
function updateOnlineStatus(username) {
  const count = Object.values(data.activeConnections).filter(u => u === username).length;
  const profile = data.userProfiles[username];
  if (!profile) return;

  if (count > 0) {
    profile.isOnline = true;
    // Keep lastOnline as-is while online
  } else {
    if (profile.isOnline) { // Only set time when actually going offline
      profile.isOnline = false;
      profile.lastOnline = new Date().toISOString();
      saveData();
    }
  }
}

// ----------------------
// SOCKET EVENTS — FIXED PRESENCE DETECTION
// ----------------------
io.on("connection", (socket) => {

  // ✅ Runs on EVERY page load (home, settings, profile)
  socket.on("iamhere", (username) => {
    if (!username) return;
    data.activeConnections[socket.id] = username;
    updateOnlineStatus(username);
  });

  // SIGNUP
  socket.on("signup", async ({ username, password }, cb) => {
    const name = clean(username);
    const lowerName = name.toLowerCase();

    if (name.length < 2 || name.length > 20)
      return cb({ success: false, message: "Username must be 2-20 characters" });
    if (/\s/.test(name))
      return cb({ success: false, message: "No spaces allowed" });
    if (!/^[a-zA-Z0-9_]+$/.test(name))
      return cb({ success: false, message: "Only letters, numbers and underscores" });
    if (password.length < 8)
      return cb({ success: false, message: "Password must be at least 8 characters" });
    if (data.registeredNames[lowerName])
      return cb({ success: false, message: "Username already taken" });

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

    cb({ success: true, username: name, id });
  });

  // LOGIN
  socket.on("login", async ({ username, password }, cb) => {
    const name = clean(username);
    const lowerName = name.toLowerCase();
    const account = data.accounts[name];

    if (!account || !data.registeredNames[lowerName])
      return cb({ success: false, message: "Account not found" });

    const validPassword = await bcrypt.compare(password, account.hash);
    if (!validPassword)
      return cb({ success: false, message: "Incorrect password" });

    cb({ success: true, username: name, id: account.id, theme: account.theme });
  });

  // SAVE THEME
  socket.on("save-theme", ({ theme, username }) => {
    const account = data.accounts[username];
    if (!account) return;
    account.theme = theme;
    if (data.userProfiles[username]) data.userProfiles[username].theme = theme;
    saveData();
  });

  // CHANGE USERNAME
  socket.on("change username", ({ oldName, newName }, cb) => {
    const cleanOld = clean(oldName);
    const cleanNew = clean(newName);
    const oldLower = cleanOld.toLowerCase();
    const newLower = cleanNew.toLowerCase();

    if (cleanNew.length < 2 || cleanNew > 20)
      return cb({ success: false, message: "Name must be 2-20 characters" });
    if (data.registeredNames[newLower])
      return cb({ success: false, message: "Name already taken" });
    if (oldLower === newLower)
      return cb({ success: false, message: "Same as current name" });

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
    cb({ success: true, newName: cleanNew });
    io.emit("username updated", { oldName: cleanOld, newName: cleanNew });
  });

  // CHANGE PASSWORD
  socket.on("change password", async ({ username, newPassword }, cb) => {
    const name = clean(username);
    const account = data.accounts[name];
    if (!account) return cb({ success: false, message: "Account not found" });
    if (newPassword.length < 8) return cb({ success: false, message: "Password must be at least 8 characters" });

    account.hash = await bcrypt.hash(newPassword, 10);
    saveData();
    cb({ success: true });
  });

  // ✅ DISCONNECT — only mark offline when NO tabs are open
  socket.on("disconnect", () => {
    const username = data.activeConnections[socket.id];
    delete data.activeConnections[socket.id];
    if (username) updateOnlineStatus(username);
  });
});

// ----------------------
// API — ID 1 WORKS 100%
// ----------------------
app.get("/api/profile/:id", (req, res) => {
  const profile = getProfileById(req.params.id);
  if (!profile) return res.status(404).json({ error: "User not found" });
  res.json(profile);
});

// ----------------------
// PAGES
// ----------------------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get("/home", (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
app.get("/settings", (req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));
app.get("/users/profile", (req, res) => res.sendFile(path.join(__dirname, 'public', 'profile.html')));

server.listen(PORT, () => console.log("✅ Server running on port", PORT));