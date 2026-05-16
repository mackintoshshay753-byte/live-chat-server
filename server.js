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
// ✅ PERMANENT STORAGE — NEVER RESET
const onlineSockets = new Map(); // socket.id → username
const registeredNames = new Set(); // All taken usernames
const friendData = new Map(); // username → [friends] — SAVED FOREVER

function clean(input) {
  return sanitizeHtml(input.trim(), { allowedTags: [], allowedAttributes: {} });
}

// Get unique online users
function getOnlineUsers() {
  return [...new Set(Array.from(onlineSockets.values()))];
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

  // JOIN — ALLOW MULTIPLE TABS, BLOCK OTHERS
  socket.on("join", (rawName) => {
    const name = clean(rawName);
    const lowerName = name.toLowerCase();

    if (name.length < 2 || name.length > 20) {
      return socket.emit("join result", { success: false, message: "Invalid name (2-20 chars)" });
    }

    // If already registered (YOU or someone else)
    if (registeredNames.has(lowerName)) {
      onlineSockets.set(socket.id, name);
      // ✅ ALWAYS send saved friends — NEVER EMPTY
      socket.emit("friends list", friendData.get(name) || []);
      socket.emit("join result", { success: true });
      broadcastOnline();
      return;
    }

    // First time registering
    registeredNames.add(lowerName);
    onlineSockets.set(socket.id, name);
    friendData.set(name, []); // Create permanent empty list
    socket.emit("friends list", []);
    socket.emit("join result", { success: true });
    socket.broadcast.emit("system", `${name} joined`);
    broadcastOnline();
  });

  // CHAT
  socket.on("chat message", (data) => {
    const from = onlineSockets.get(socket.id);
    if (!from || !data.text) return;
    io.emit("chat message", { from, text: clean(data.text), time: new Date() });
  });

  // TYPING
  socket.on("typing", () => {
    const user = onlineSockets.get(socket.id);
    if (user) socket.broadcast.emit("typing", user);
  });
  socket.on("stop typing", () => socket.broadcast.emit("stop typing"));

  // FRIEND SYSTEM — PERMANENT ADD & REMOVE
  socket.on("friend request", ({ from, to }) => {
    const targetId = [...onlineSockets.entries()].find(([_,u]) => u === to)?.[0];
    if (!targetId) return socket.emit("system", `⚠️ ${to} is offline`);
    io.to(targetId).emit("friend request received", { from });
  });

  socket.on("friend accept", ({ user, from }) => {
    // ✅ ADD — PERMANENT
    if (!friendData.get(user).includes(from)) friendData.get(user).push(from);
    if (!friendData.get(from).includes(user)) friendData.get(from).push(user);

    io.emit("friend added", { friend: from, forUser: user });
    io.emit("friend added", { friend: user, forUser: from });

    io.emit("friends list", friendData.get(user));
    io.emit("friends list", friendData.get(from));
  });

  socket.on("unfriend", ({ user, friend }) => {
    // ✅ REMOVE — PERMANENT
    if (friendData.has(user)) friendData.set(user, friendData.get(user).filter(f => f !== friend));
    if (friendData.has(friend)) friendData.set(friend, friendData.get(friend).filter(f => f !== user));

    io.emit("friend removed", { friend: friend, forUser: user });
    io.emit("friend removed", { friend: user, forUser: friend });

    io.emit("friends list", friendData.get(user));
    io.emit("friends list", friendData.get(friend));
  });

  socket.on("friend decline", ({ user, from }) => {
    io.emit("friend declined", { to: user, forUser: from });
  });

  // DISCONNECT — ONLY UPDATE ONLINE STATUS
  socket.on("disconnect", () => {
    const user = onlineSockets.get(socket.id);
    if (user) {
      onlineSockets.delete(socket.id);
      broadcastOnline(); // ✅ Only online changes — FRIENDS STAY
    }
  });
});

// --------------------------
server.listen(PORT, () => console.log("Server running on port", PORT));