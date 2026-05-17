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
// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, {
cors: { origin: ALLOWED_ORIGINS, credentials: true }
});

// ----------------------
// PERSISTENT STORAGE FILE
// ----------------------
const DATA_PATH = path.join(__dirname, 'chat-data.json');

// Default data structure
let data = {
nextUserId: 1,
onlineSockets: {}, // socketId → { username, isActive }
registeredNames: {}, // lowercase → true
accounts: {}, // ✅ NEW: username → { id, hash, joinDate, theme, lastOnline, isOnline }
friendData: {}, // username → [friendNames]
pendingRequests: {}, // username → [requesterNames]
userTheme: {}, // username → themeName
userProfiles: {}, // username → profile
usernameToId: {} // username → id
};

// Load data from file if exists
function loadData() {
if (fs.existsSync(DATA_PATH)) {
try {
const fileData = fs.readFileSync(DATA_PATH, 'utf8');
const parsed = JSON.parse(fileData);
// Merge with default to ensure all keys exist
data = { ...data, ...parsed };
console.log("✅ Data loaded from file");
} catch (err) {
console.error("⚠️ Failed to load data, starting fresh:", err.message);
saveData(); // create new file
}
} else {
saveData(); // create initial file
console.log("📄 New data file created");
}
}

// Save data to file
function saveData() {
try {
fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
} catch (err) {
console.error("❌ Failed to save data:", err.message);
}
}

// Load on start
loadData();

// ----------------------
// Security Helpers
// ----------------------

// ----------------------
// Helpers
// ----------------------
function clean(input) {
return sanitizeHtml(String(input || '').trim(), { allowedTags: [], allowedAttributes: {} });
}

function getOnlineUsers() {
const activeUsers = new Set();
Object.values(data.onlineSockets).forEach(d => {
if (d.isActive) activeUsers.add(d.username);
});
return [...activeUsers];
}

function broadcastOnline() {
io.emit("online list", getOnlineUsers());
}

function createProfile(username) {
if (data.userProfiles[username]) return data.userProfiles[username];

const id = data.nextUserId++; // ✅ INCREASES BY 1, PERMANENT
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
saveData(); // Save immediately

return profile;
}

function getProfileById(id) {
id = Number(id);
for (const prof of Object.values(data.userProfiles)) {
if (prof.id === id) return prof;
}
return null;
}

function findSocketIdByUsername(username) {
for (const [sid, d] of Object.entries(data.onlineSockets)) {
if (d.username === username) return sid;
}
return null;
}

function sendPendingRequests(username, socketId) {
if (!data.pendingRequests[username]) return;
data.pendingRequests[username].forEach(fromUser => {
io.to(socketId).emit("friend request received", { from: fromUser });
});
}

// ----------------------
// Socket.IO Events
// ----------------------
io.on("connection", (socket) => {
console.log("Connected:", socket.id);

// ✅ NEW: Signup
socket.on("signup", async ({ username, password }, cb) => {
const name = clean(username);
const lowerName = name.toLowerCase();

// Validation
if (name.length < 2 || name.length > 20) {
return cb({ success: false, message: "Username must be 2-20 characters" });
}
if (/\s/.test(name)) {
return cb({ success: false, message: "No spaces allowed" });
}
if (!/^[a-zA-Z0-9_]+$/.test(name)) {
return cb({ success: false, message: "Only letters, numbers and underscores" });
}
if (password.length < 8) {
return cb({ success: false, message: "Password must be at least 8 characters" });
}
if (data.registeredNames[lowerName]) {
return cb({ success: false, message: "Username already taken" });
}

// Create account
const id = data.nextUserId++;
data.registeredNames[lowerName] = true;
data.accounts[name] = {
id,
hash: await bcrypt.hash(password, 10),
joinDate: new Date().toISOString(),
theme: "light",
lastOnline: null,
isOnline: false
};
createProfile(name);
data.friendData[name] = [];
data.pendingRequests[name] = [];
data.userTheme[name] = "light";
saveData();

cb({ success: true, username: name, id });
});

// ✅ NEW: Login
socket.on("login", async ({ username, password }, cb) => {
const name = clean(username);
const lowerName = name.toLowerCase();
const account = data.accounts[name];

if (!account || !data.registeredNames[lowerName]) {
return cb({ success: false, message: "Account not found" });
}
const validPassword = await bcrypt.compare(password, account.hash);

if (!validPassword) {
return cb({ success: false, message: "Incorrect password" });
}

cb({ success: true, username: name, id: account.id, theme: account.theme });
});

socket.on("get online", () => {
socket.emit("online list", getOnlineUsers());
});

socket.on("join", (rawName) => {
const name = clean(rawName);
const account = data.accounts[name];
if (!account) return; // only registered accounts can join

const lowerName = name.toLowerCase();

data.onlineSockets[socket.id] = { username: name, isActive: true };
account.isOnline = true;
const profile = data.userProfiles[name];
if (profile) {
profile.isOnline = true;
saveData();
}

socket.emit("friends list", data.friendData[name] || []);
socket.emit("theme-sync", account.theme || "light");
socket.emit("join result", { success: true });

sendPendingRequests(name, socket.id);
socket.broadcast.emit("system", `${name} joined`);
broadcastOnline();
});

socket.on("save-theme", ({ theme, username }) => {
const account = data.accounts[username];
if (!account) return;
account.theme = theme;
if (data.userProfiles[username]) {
data.userProfiles[username].theme = theme;
}
saveData();
});

socket.on("change username", ({ oldName, newName }) => {
const cleanOld = clean(oldName);
const cleanNew = clean(newName);
const oldLower = cleanOld.toLowerCase();
const newLower = cleanNew.toLowerCase();

if (cleanNew.length < 2 || cleanNew > 20) {
return socket.emit("change result", { success: false, message: "Name must be 2-20 characters" });
}
if (data.registeredNames[newLower]) {
return socket.emit("change result", { success: false, message: "Name already taken" });
}
if (oldLower === newLower) {
return socket.emit("change result", { success: false, message: "Same as current name" });
}

// Update registered names
delete data.registeredNames[oldLower];
data.registeredNames[newLower] = true;

// Update account
data.accounts[cleanNew] = data.accounts[cleanOld];
delete data.accounts[cleanOld];

// Update friends lists
const oldFriends = data.friendData[cleanOld] || [];
data.friendData[cleanNew] = oldFriends;
delete data.friendData[cleanOld];

Object.keys(data.friendData).forEach(user => {
const idx = data.friendData[user].indexOf(cleanOld);
if (idx !== -1) data.friendData[user][idx] = cleanNew;
});

// Update requests
const oldPending = data.pendingRequests[cleanOld] || [];
data.pendingRequests[cleanNew] = oldPending;
delete data.pendingRequests[cleanOld];

Object.keys(data.pendingRequests).forEach(user => {
const idx = data.pendingRequests[user].indexOf(cleanOld);
if (idx !== -1) data.pendingRequests[user][idx] = cleanNew;
});

// Update theme
data.userTheme[cleanNew] = data.userTheme[cleanOld] || "light";
delete data.userTheme[cleanOld];

// Update profile
const oldProfile = data.userProfiles[cleanOld];
if (oldProfile) {
oldProfile.username = cleanNew;
data.userProfiles[cleanNew] = oldProfile;
data.usernameToId[cleanNew] = oldProfile.id;
delete data.userProfiles[cleanOld];
delete data.usernameToId[cleanOld];
}

// Update online sockets
Object.values(data.onlineSockets).forEach(d => {
if (d.username === cleanOld) d.username = cleanNew;
});

saveData();
io.emit("system", `${cleanOld} changed name to ${cleanNew}`);
io.emit("username updated", { oldName: cleanOld, newName: cleanNew });

broadcastOnline();
socket.emit("change result", { success: true, newName: cleanNew });
socket.emit("friends list", data.friendData[cleanNew] || []);
socket.emit("theme-sync", data.userTheme[cleanNew] || "light");
});

// ✅ NEW: Change Password Handler
socket.on("change password", async ({ username, newPassword }, cb) => {
const name = clean(username);
const account = data.accounts[name];

if (!account) {
return socket.emit("change result", { success: false, message: "Account not found" });
}
if (newPassword.length < 8) {
return socket.emit("change result", { success: false, message: "Password must be at least 8 characters" });
}

// Update with new hashed password
account.hash = await bcrypt.hash(newPassword, 10);
saveData();

socket.emit("change result", { success: true, type: "password" });
});

socket.on("activity change", ({ active }) => {
if (data.onlineSockets[socket.id]) {
data.onlineSockets[socket.id].isActive = active;
broadcastOnline();
}
});

// ✅ FIXED: Only send once, no duplicates
socket.on("chat message", (dataMsg) => {
const userData = data.onlineSockets[socket.id];
if (!userData || !dataMsg.text) return;

const profile = data.userProfiles[userData.username];
const msgData = {
from: userData.username,
id: profile ? profile.id : null,
text: clean(dataMsg.text),
time: new Date().toISOString()
};

io.emit("chat message", msgData);
});

socket.on("typing", () => {
const userData = data.onlineSockets[socket.id];
if (userData && userData.isActive) socket.broadcast.emit("typing", userData.username);
});

socket.on("stop typing", () => {
socket.broadcast.emit("stop typing");
});

socket.on("friend request", ({ from, to }) => {
const targetId = findSocketIdByUsername(to);
if (targetId) {
io.to(targetId).emit("friend request received", { from });
return;
}
if (!data.pendingRequests[to]) data.pendingRequests[to] = [];
if (!data.pendingRequests[to].includes(from)) {
data.pendingRequests[to].push(from);
saveData();
socket.emit("system", `📨 Request saved — ${to} will see it later`);
}
});

socket.on("friend accept", ({ user, from }) => {
if (data.pendingRequests[user]) {
data.pendingRequests[user] = data.pendingRequests[user].filter(f => f !== from);
}
if (!data.friendData[user]) data.friendData[user] = [];
if (!data.friendData[from]) data.friendData[from] = [];
if (!data.friendData[user].includes(from)) data.friendData[user].push(from);
if (!data.friendData[from].includes(user)) data.friendData[from].push(user);
saveData();

io.emit("friend added", { friend: from, forUser: user });
io.emit("friend added", { friend: user, forUser: from });

const userSocket = findSocketIdByUsername(user);
const fromSocket = findSocketIdByUsername(from);
if (userSocket) io.to(userSocket).emit("friends list", data.friendData[user]);
if (fromSocket) io.to(fromSocket).emit("friends list", data.friendData[from]);
});

socket.on("friend decline", ({ user, from }) => {
if (data.pendingRequests[user]) {
data.pendingRequests[user] = data.pendingRequests[user].filter(f => f !== from);
saveData();
}
const senderSocket = findSocketIdByUsername(from);
if (senderSocket) {
io.to(senderSocket).emit("request declined", { by: user });
}
});

socket.on("unfriend", ({ user, friend }) => {
if (data.friendData[user]) {
data.friendData[user] = data.friendData[user].filter(f => f !== friend);
}
if (data.friendData[friend]) {
data.friendData[friend] = data.friendData[friend].filter(f => f !== user);
}
saveData();

io.emit("friend removed", { friend, forUser: user });
io.emit("friend removed", { friend: user, forUser: friend });

const userSocket = findSocketIdByUsername(user);
const friendSocket = findSocketIdByUsername(friend);
if (userSocket) io.to(userSocket).emit("friends list", data.friendData[user]);
if (friendSocket) io.to(friendSocket).emit("friends list", data.friendData[friend]);
});

socket.on("disconnect", () => {
const d = data.onlineSockets[socket.id];
if (d) {
const account = data.accounts[d.username];
const profile = data.userProfiles[d.username];
if (account) {
account.isOnline = false;
account.lastOnline = new Date().toISOString();
}
if (profile) {
profile.isOnline = false;
profile.lastOnline = new Date().toISOString();
saveData();
}
delete data.onlineSockets[socket.id];
broadcastOnline();
}
});
});

// ----------------------
// API — ONLY BY ID
// ----------------------
app.get("/api/profile/:id", (req, res) => {
const profile = getProfileById(req.params.id);
if (!profile) return res.status(404).json({ error: "User not found" });
res.json(profile);
});

// ----------------------
// Pages
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
// Start Server
// ----------------------
server.listen(PORT, () => console.log("✅ Server running on port", PORT));