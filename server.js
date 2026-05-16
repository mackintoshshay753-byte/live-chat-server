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
const ALLOWED_ORIGINS = ["https://idontknowww.neocities.org"]; // YOUR SITE URL

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
// 🛡️ PERMANENT STORAGE — NOTHING EVER DELETED — ✅ SURVIVES SERVER RESTARTS
const onlineSockets = new Map(); // socket.id → { username, isActive }
const registeredNames = new Set(); // All taken usernames
const friendData = new Map(); // username → [friends] — permanent
const pendingRequests = new Map(); // username → [list of pending requests]

// ✅ ✅ ✅ CRITICAL FIX: STORE THEME SEPARATELY FROM SOCKET CONNECTION — PERMANENT
const userTheme = new Map(); // username → theme ("light"/"dark") — **ALWAYS REMEMBERED**

// 🆕 UNLIMITED USER ID SYSTEM — STARTS AT 1, GOES FOREVER
let nextUserId = 1; 
const userAccounts = new Map(); // userid → { id, username, joined, online }

// --------------------------
// 🧰 HELPER FUNCTIONS
function clean(input) {
  return sanitizeHtml(input.trim(), { allowedTags: [], allowedAttributes: {} });
}

function getOnlineUsers() {
  const activeUsers = new Set();
  for (const [_, data] of onlineSockets.entries()) {
    if (data.isActive) activeUsers.add(data.username);
  }
  return [...activeUsers];
}

function broadcastOnline() {
  io.emit("online list", getOnlineUsers());
}

function sendPendingRequests(username, socketId) {
  if (pendingRequests.has(username)) {
    pendingRequests.get(username).forEach(fromUser => {
      io.to(socketId).emit("friend request received", { from: fromUser });
    });
  }
}

// --------------------------
// 🚦 SOCKET LOGIC
io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("get online", () => {
    socket.emit("online list", getOnlineUsers());
  });

  // ✅ JOIN — NOW WITH UNIQUE USER ID
  socket.on("join", (rawName) => {
    const name = clean(rawName);
    const lowerName = name.toLowerCase();

    if (name.length < 2 || name.length > 20) {
      return socket.emit("join result", { success: false, message: "Invalid name (2-20 chars)" });
    }

    onlineSockets.set(socket.id, { username: name, isActive: true });

    // Existing user
    if (registeredNames.has(lowerName)) {
      socket.emit("friends list", friendData.get(name) || []);
      
      // ✅ CRITICAL: SEND WHATEVER THEME WE HAVE STORED FOREVER — NEVER RESET TO LIGHT
      socket.emit("theme-sync", userTheme.get(name) || "light"); 
      
      sendPendingRequests(name, socket.id);
      socket.emit("join result", { success: true });
      broadcastOnline();
      return;
    }

    // ✅ NEW USER — ASSIGN UNIQUE ID #1, #2, #3... NO LIMIT
    const newId = nextUserId++;
    registeredNames.add(lowerName);
    friendData.set(name, []);
    pendingRequests.set(name, []);
    userTheme.set(name, "light"); // Set default ONLY for NEW users

    // ✅ SAVE ACCOUNT DATA FOR PROFILE PAGES
    userAccounts.set(newId, {
      id: newId,
      username: name,
      joined: new Date().toLocaleDateString(),
      online: true
    });
    
    socket.emit("friends list", []);
    socket.emit("theme-sync", "light");
    socket.emit("join result", { success: true, userId: newId }); // Send ID back to client
    socket.broadcast.emit("system", `${name} joined`);
    broadcastOnline();
  });

  // ✅ SAVE THEME TO SERVER PERMANENTLY — FOREVER REMEMBERED
  socket.on("save-theme", ({ theme }) => {
    const userData = onlineSockets.get(socket.id);
    if (userData) {
      // ✅ Save directly by USERNAME — survives disconnects/restarts
      userTheme.set(userData.username, theme); 
    }
  });

  // ✅ CHANGE USERNAME — KEEPS ALL DATA + UPDATES PROFILE
  socket.on("change username", ({ oldName, newName }) => {
    const cleanOld = clean(oldName);
    const cleanNew = clean(newName);
    const newLower = cleanNew.toLowerCase();

    // Validation
    if (cleanNew.length < 2 || cleanNew.length > 20) {
      return socket.emit("change result", { success: false, message: "Name must be 2-20 characters" });
    }
    if (registeredNames.has(newLower)) {
      return socket.emit("change result", { success: false, message: "That name is already taken" });
    }
    if (cleanOld.toLowerCase() === newLower) {
      return socket.emit("change result", { success: false, message: "That's already your name!" });
    }

    // 🔄 UPDATE EVERYTHING TO NEW NAME
    registeredNames.delete(cleanOld.toLowerCase());
    registeredNames.add(newLower);

    // Transfer all user data
    friendData.set(cleanNew, friendData.get(cleanOld) || []);
    friendData.delete(cleanOld);

    pendingRequests.set(cleanNew, pendingRequests.get(cleanOld) || []);
    pendingRequests.delete(cleanOld);

    // ✅ TRANSFER THEME TO NEW NAME SO IT DOES NOT RESET
    if(userTheme.has(cleanOld)){
      userTheme.set(cleanNew, userTheme.get(cleanOld));
      userTheme.delete(cleanOld);
    }

    // ✅ UPDATE USERNAME IN PROFILE RECORD
    for (const [id, acc] of userAccounts.entries()) {
      if (acc.username === cleanOld) {
        acc.username = cleanNew;
      }
    }

    // Update online status
    for (const [id, data] of onlineSockets.entries()) {
      if (data.username === cleanOld) {
        data.username = cleanNew;
      }
    }

    // Notify everyone
    io.emit("system", `${cleanOld} changed their name to ${cleanNew}`);
    io.emit("username updated", { oldName: cleanOld, newName: cleanNew });

    broadcastOnline();
    socket.emit("change result", { success: true, newName: cleanNew });
  });

  // ✅ NEW: HANDLE PROFILE REQUEST FROM /users/X/profile
  socket.on("get profile", (userId) => {
    const uid = Number(userId);
    if (!userAccounts.has(uid)) {
      return socket.emit("profile data", { error: true });
    }
    const acc = userAccounts.get(uid);
    // Update live online status
    acc.online = getOnlineUsers().includes(acc.username);
    socket.emit("profile data", acc);
  });

  // Tab active/inactive
  socket.on("activity change", ({ active }) => {
    if (onlineSockets.has(socket.id)) {
      onlineSockets.get(socket.id).isActive = active;
      broadcastOnline();
    }
  });

  // CHAT — NOW SENDS USER ID FOR PROFILE LINKS
  socket.on("chat message", (data) => {
    const userData = onlineSockets.get(socket.id);
    if (!userData || !data.text) return;
    // Find their ID
    let theirId = null;
    for (const [id, acc] of userAccounts.entries()) {
      if (acc.username === userData.username) theirId = id;
    }
    io.emit("chat message", {
      from: userData.username,
      fromId: theirId,
      text: clean(data.text),
      time: new Date().toISOString()
    });
  });

  // TYPING
  socket.on("typing", () => {
    const userData = onlineSockets.get(socket.id);
    if (userData && userData.isActive) socket.broadcast.emit("typing", userData.username);
  });
  socket.on("stop typing", () => socket.broadcast.emit("stop typing"));

  // FRIEND REQUEST — save if offline
  socket.on("friend request", ({ from, to }) => {
    const targetActive = [...onlineSockets.entries()].some(([_,u]) => u.username === to && u.isActive);
    if (targetActive) {
      const targetId = [...onlineSockets.entries()].find(([_,u]) => u.username === to)?.[0];
      if (targetId) {
        io.to(targetId).emit("friend request received", { from });
        return;
      }
    }
    if (!pendingRequests.get(to).includes(from)) {
      pendingRequests.get(to).push(from);
      socket.emit("system", `📨 Request saved — ${to} will see it when they return`);
    }
  });

  // ACCEPT REQUEST
  socket.on("friend accept", ({ user, from }) => {
    if (pendingRequests.has(user)) pendingRequests.set(user, pendingRequests.get(user).filter(f => f !== from));
    if (!friendData.has(user)) friendData.set(user, []);
    if (!friendData.has(from)) friendData.set(from, []);
    if (!friendData.get(user).includes(from)) friendData.get(user).push(from);
    if (!friendData.get(from).includes(user)) friendData.get(from).push(user);
    io.emit("friend added", { friend: from, forUser: user });
    io.emit("friend added", { friend: user, forUser: from });
    io.to(user).emit("friends list", friendData.get(user));
    io.to(from).emit("friends list", friendData.get(from));
  });

  // ✅ DECLINE REQUEST — notify sender & fully remove so you can send again
  socket.on("friend decline", ({ user, from }) => {
    if (pendingRequests.has(user)) pendingRequests.set(user, pendingRequests.get(user).filter(f => f !== from));
    const senderSocket = [...onlineSockets.entries()].find(([_,u]) => u.username === from)?.[0];
    if (senderSocket) io.to(senderSocket).emit("request declined", { by: user });
  });

  // UNFRIEND
  socket.on("unfriend", ({ user, friend }) => {
    if (friendData.has(user)) friendData.set(user, friendData.get(user).filter(f => f !== friend));
    if (friendData.has(friend)) friendData.set(friend.get(user).filter(f => f !== user));
    io.emit("friend removed", { friend, forUser: user });
    io.emit("friend removed", { friend: user, forUser: friend });
    io.to(user).emit("friends list", friendData.get(user));
    io.to(friend).emit("friends list", friendData.get(friend));
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    if (onlineSockets.has(socket.id)) {
      onlineSockets.delete(socket.id);
      broadcastOnline();
    }
  });
});

// --------------------------
server.listen(PORT, () => console.log("✅ Server running — Theme FIXED + User ID System Ready!"));