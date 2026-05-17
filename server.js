require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sanitizeHtml = require('sanitize-html');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = ["https://idontknowww.neocities.org"];

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));
app.use(express.json({ limit: '10kb' }));

const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true }
});

// ----------------------
// Data Storage
// ----------------------
const onlineSockets = new Map();     // socketId → { username, isActive }
const registeredNames = new Set();   // lowercase usernames
const friendData = new Map();        // username → [friendNames]
const pendingRequests = new Map();   // username → [requesterNames]
const userTheme = new Map();         // username → themeName
const userProfiles = new Map();      // username → profileObject
let nextUserId = 1;

// ----------------------
// Helpers
// ----------------------
function clean(input) {
  return sanitizeHtml(String(input || '').trim(), { allowedTags: [], allowedAttributes: {} });
}

function getOnlineUsers() {
  const activeUsers = new Set();
  for (const data of onlineSockets.values()) {
    if (data.isActive) activeUsers.add(data.username);
  }
  return [...activeUsers];
}

function broadcastOnline() {
  io.emit("online list", getOnlineUsers());
}

function createProfile(username) {
  if (userProfiles.has(username)) return userProfiles.get(username);

  const profile = {
    id: nextUserId++,
    username,
    joinDate: new Date().toISOString(),
    theme: "light",
    lastOnline: null,
    isOnline: false
  };

  userProfiles.set(username, profile);
  return profile;
}

function getProfileById(id) {
  for (const profile of userProfiles.values()) {
    if (profile.id === id) return profile;
  }
  return null;
}

function findSocketIdByUsername(username) {
  for (const [id, data] of onlineSockets.entries()) {
    if (data.username === username) return id;
  }
  return null;
}

function sendPendingRequests(username, socketId) {
  if (!pendingRequests.has(username)) return;
  for (const fromUser of pendingRequests.get(username)) {
    io.to(socketId).emit("friend request received", { from: fromUser });
  }
}

// ----------------------
// Socket.IO Events
// ----------------------
io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("get online", () => {
    socket.emit("online list", getOnlineUsers());
  });

  socket.on("join", (rawName) => {
    const name = clean(rawName);
    const lowerName = name.toLowerCase();

    if (name.length < 2 || name.length > 20) {
      return socket.emit("join result", {
        success: false,
        message: "Username must be 2-20 characters"
      });
    }

    if (/\s/.test(name)) {
      return socket.emit("join result", {
        success: false,
        message: "No spaces allowed"
      });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      return socket.emit("join result", {
        success: false,
        message: "Only letters, numbers and underscores"
      });
    }

    const existingSocketId = findSocketIdByUsername(name);
    if (registeredNames.has(lowerName) && !existingSocketId) {
      // Allow rejoin
    } else if (registeredNames.has(lowerName)) {
      return socket.emit("join result", {
        success: false,
        message: "Username already taken"
      });
    }

    if (!registeredNames.has(lowerName)) {
      registeredNames.add(lowerName);
      createProfile(name);
      friendData.set(name, []);
      pendingRequests.set(name, []);
      userTheme.set(name, "light");
    }

    onlineSockets.set(socket.id, {
      username: name,
      isActive: true
    });

    const profile = userProfiles.get(name);
if (profile) {
  profile.isOnline = true;
}

    if (!friendData.has(name)) friendData.set(name, []);
    if (!pendingRequests.has(name)) pendingRequests.set(name, []);
    if (!userTheme.has(name)) userTheme.set(name, "light");
    if (!userProfiles.has(name)) createProfile(name);

    socket.emit("friends list", friendData.get(name));
    socket.emit("theme-sync", userTheme.get(name));
    socket.emit("join result", { success: true });

    sendPendingRequests(name, socket.id);
    socket.broadcast.emit("system", `${name} joined`);
    broadcastOnline();
  });

  socket.on("save-theme", ({ theme }) => {
    const userData = onlineSockets.get(socket.id);
    if (!userData) return;
    userTheme.set(userData.username, theme);
    if (userProfiles.has(userData.username)) {
      userProfiles.get(userData.username).theme = theme;
    }
  });

  socket.on("change username", ({ oldName, newName }) => {
    const cleanOld = clean(oldName);
    const cleanNew = clean(newName);
    const oldLower = cleanOld.toLowerCase();
    const newLower = cleanNew.toLowerCase();

    if (cleanNew.length < 2 || cleanNew.length > 20) {
      return socket.emit("change result", { success: false, message: "Name must be 2-20 characters" });
    }
    if (registeredNames.has(newLower)) {
      return socket.emit("change result", { success: false, message: "Name already taken" });
    }
    if (oldLower === newLower) {
      return socket.emit("change result", { success: false, message: "Same as current name" });
    }

    registeredNames.delete(oldLower);
    registeredNames.add(newLower);

    const oldFriends = friendData.get(cleanOld) || [];
    friendData.set(cleanNew, oldFriends);
    friendData.delete(cleanOld);

    for (const [user, friends] of friendData.entries()) {
      const idx = friends.indexOf(cleanOld);
      if (idx !== -1) friends[idx] = cleanNew;
    }

    const oldPending = pendingRequests.get(cleanOld) || [];
    pendingRequests.set(cleanNew, oldPending);
    pendingRequests.delete(cleanOld);

    for (const [user, requests] of pendingRequests.entries()) {
      const idx = requests.indexOf(cleanOld);
      if (idx !== -1) requests[idx] = cleanNew;
    }

    const oldTheme = userTheme.get(cleanOld) || "light";
    userTheme.set(cleanNew, oldTheme);
    userTheme.delete(cleanOld);

    const oldProfile = userProfiles.get(cleanOld);
    if (oldProfile) {
      oldProfile.username = cleanNew;
      userProfiles.delete(cleanOld);
      userProfiles.set(cleanNew, oldProfile);
    }

    for (const data of onlineSockets.values()) {
      if (data.username === cleanOld) data.username = cleanNew;
    }

    io.emit("system", `${cleanOld} changed name to ${cleanNew}`);
    io.emit("username updated", { oldName: cleanOld, newName: cleanNew });

    broadcastOnline();
    socket.emit("change result", { success: true, newName: cleanNew });
    socket.emit("friends list", friendData.get(cleanNew));
    socket.emit("theme-sync", userTheme.get(cleanNew));
  });

  socket.on("activity change", ({ active }) => {
    if (onlineSockets.has(socket.id)) {
      onlineSockets.get(socket.id).isActive = active;
      broadcastOnline();
    }
  });

  socket.on("chat message", (data) => {
    const userData = onlineSockets.get(socket.id);
    if (!userData || !data.text) return;
    io.emit("chat message", {
      from: userData.username,
      text: clean(data.text),
      time: new Date().toISOString()
    });
  });

  socket.on("typing", () => {
    const userData = onlineSockets.get(socket.id);
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
    if (!pendingRequests.has(to)) pendingRequests.set(to, []);
    if (!pendingRequests.get(to).includes(from)) {
      pendingRequests.get(to).push(from);
      socket.emit("system", `📨 Request saved — ${to} will see it later`);
    }
  });

  socket.on("friend accept", ({ user, from }) => {
    if (pendingRequests.has(user)) {
      pendingRequests.set(user, pendingRequests.get(user).filter(f => f !== from));
    }
    if (!friendData.has(user)) friendData.set(user, []);
    if (!friendData.has(from)) friendData.set(from, []);
    if (!friendData.get(user).includes(from)) friendData.get(user).push(from);
    if (!friendData.get(from).includes(user)) friendData.get(from).push(user);

    io.emit("friend added", { friend: from, forUser: user });
    io.emit("friend added", { friend: user, forUser: from });

    const userSocket = findSocketIdByUsername(user);
    const fromSocket = findSocketIdByUsername(from);
    if (userSocket) io.to(userSocket).emit("friends list", friendData.get(user));
    if (fromSocket) io.to(fromSocket).emit("friends list", friendData.get(from));
  });

  socket.on("friend decline", ({ user, from }) => {
    if (pendingRequests.has(user)) {
      pendingRequests.set(user, pendingRequests.get(user).filter(f => f !== from));
    }
    const senderSocket = findSocketIdByUsername(from);
    if (senderSocket) {
      io.to(senderSocket).emit("request declined", { by: user });
    }
  });

  socket.on("unfriend", ({ user, friend }) => {
    if (friendData.has(user)) {
      friendData.set(user, friendData.get(user).filter(f => f !== friend));
    }
    if (friendData.has(friend)) {
      friendData.set(friend, friendData.get(friend).filter(f => f !== user));
    }
    io.emit("friend removed", { friend, forUser: user });
    io.emit("friend removed", { friend: user, forUser: friend });

    const userSocket = findSocketIdByUsername(user);
    const friendSocket = findSocketIdByUsername(friend);
    if (userSocket) io.to(userSocket).emit("friends list", friendData.get(user));
    if (friendSocket) io.to(friendSocket).emit("friends list", friendData.get(friend));
  });

  socket.on("disconnect", () => {
  const data = onlineSockets.get(socket.id);

  if (data) {
    const profile = userProfiles.get(data.username);

    if (profile) {
      profile.isOnline = false;
      profile.lastOnline = new Date().toISOString();
    }

    onlineSockets.delete(socket.id);
    broadcastOnline();
  }
});
});

// ----------------------
// API — ONLY BY ID
// ----------------------
app.get("/api/profile/:id", (req, res) => {
  const id = Number(req.params.id);
  const profile = getProfileById(id);
  if (!profile) return res.status(404).json({ error: "User not found" });
  res.json(profile);
});

// ❌ REMOVED: /api/user/:username — no more access by name

// ----------------------
// Start Server
// ----------------------
server.listen(PORT, () => console.log("✅ Server running on port", PORT));