require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sanitizeHtml = require('sanitize-html');

const app = express();
const server = http.createServer(app);

// --------------------------
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = ["https://idontknowww.neocities.org"];

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));
app.use(express.json({ limit: '10kb' }));

// --------------------------
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true }
});

// --------------------------
// ✅ PERMANENT STORAGE — PRESERVED, NO RESET
const onlineSockets = new Map(); // socket.id → { username, isActive }
const registeredNames = new Set(); // All taken usernames
const friendData = new Map(); // username → [friends] — KEEPS ALL EXISTING DATA

function clean(input) {
  return sanitizeHtml(input.trim(), { allowedTags: [], allowedAttributes: {} });
}

// Get users who have AT LEAST ONE active tab open
function getOnlineUsers() {
  const activeUsers = new Set();
  for (const [_, data] of onlineSockets.entries()) {
    if (data.isActive) activeUsers.add(data.username);
  }
  return [...activeUsers];
}

// Send online list to everyone
function broadcastOnline() {
  const list = getOnlineUsers();
  io.emit("online list", list);
}

// --------------------------
io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("get online", () => {
    socket.emit("online list", getOnlineUsers());
  });

  // JOIN — PRESERVES EXISTING FRIENDS LIST
  socket.on("join", (rawName) => {
    const name = clean(rawName);
    const lowerName = name.toLowerCase();

    if (name.length < 2 || name.length > 20) {
      return socket.emit("join result", { success: false, message: "Invalid name (2-20 chars)" });
    }

    // Register this socket connection for the user
    onlineSockets.set(socket.id, { username: name, isActive: true });

    // ✅ IF USER ALREADY EXISTS — SEND THEIR ORIGINAL FRIENDS LIST (DO NOT OVERWRITE)
    if (registeredNames.has(lowerName)) {
      socket.emit("friends list", friendData.get(name) || []);
      socket.emit("join result", { success: true });
      broadcastOnline();
      return;
    }

    // First time registering only
    registeredNames.add(lowerName);
    friendData.set(name, []);
    socket.emit("friends list", []);
    socket.emit("join result", { success: true });
    socket.broadcast.emit("system", `${name} joined`);
    broadcastOnline();
  });

  // ✅ TAB ACTIVITY UPDATES — NO EFFECT ON FRIEND DATA
  socket.on("activity change", ({ active }) => {
    if (onlineSockets.has(socket.id)) {
      onlineSockets.get(socket.id).isActive = active;
      broadcastOnline();
    }
  });

  // CHAT
  socket.on("chat message", (data) => {
    const userData = onlineSockets.get(socket.id);
    if (!userData || !data.text) return;
    io.emit("chat message", { from: userData.username, text: clean(data.text), time: new Date() });
  });

  // TYPING
  socket.on("typing", () => {
    const userData = onlineSockets.get(socket.id);
    if (userData && userData.isActive) socket.broadcast.emit("typing", userData.username);
  });
  socket.on("stop typing", () => socket.broadcast.emit("stop typing"));

  // FRIEND SYSTEM — ✅ PRESERVED, NO DELETION
  socket.on("friend request", ({ from, to }) => {
    const targetActive = [...onlineSockets.entries()].some(([_,u]) => u.username === to && u.isActive);
    if (!targetActive) return socket.emit("system", `⚠️ ${to} is offline`);
    
    const targetId = [...onlineSockets.entries()].find(([_,u]) => u.username === to)?.[0];
    if (targetId) io.to(targetId).emit("friend request received", { from });
  });

  socket.on("friend accept", ({ user, from }) => {
    // ✅ ADD — PERMANENT, NO OVERWRITE
    if (!friendData.get(user)) friendData.set(user, []);
    if (!friendData.get(from)) friendData.set(from, []);

    if (!friendData.get(user).includes(from)) friendData.get(user).push(from);
    if (!friendData.get(from).includes(user)) friendData.get(from).push(user);

    io.emit("friend added", { friend: from, forUser: user });
    io.emit("friend added", { friend: user, forUser: from });

    io.to(user).emit("friends list", friendData.get(user));
    io.to(from).emit("friends list", friendData.get(from));
  });

  socket.on("unfriend", ({ user, friend }) => {
    // ✅ REMOVE ONLY WHEN EXPLICITLY REQUESTED
    if (friendData.has(user)) friendData.set(user, friendData.get(user).filter(f => f !== friend));
    if (friendData.has(friend)) friendData.set(friendData.get(friend).filter(f => f !== user));

    io.emit("friend removed", { friend: friend, forUser: user });
    io.emit("friend removed", { friend: user, forUser: friend });

    io.to(user).emit("friends list", friendData.get(user));
    io.to(friend).emit("friends list", friendData.get(friend));
  });

  socket.on("friend decline", ({ user, from }) => {
    io.emit("friend declined", { to: user, forUser: from });
  });

  // DISCONNECT — ONLY UPDATE ONLINE STATUS
  socket.on("disconnect", () => {
    if (onlineSockets.has(socket.id)) {
      onlineSockets.delete(socket.id);
      broadcastOnline();
    }
  });
});

// --------------------------
server.listen(PORT, () => console.log("Server running on port", PORT));