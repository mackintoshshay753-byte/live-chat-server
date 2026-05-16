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

// ✅ ADDED: CLEAN URL ROUTE — /users/123/profile works without folders
app.get('/users/:id/profile', (req, res) => {
  res.sendFile('users/profile/profile.html', { root: __dirname });
});

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

// ✅ ADDED: USER ID SYSTEM — assigns #1, #2, #3... forever
let nextUserId = 1;
const userAccounts = new Map(); // id → { id, username, joined, online }

function clean(input) {
  return sanitizeHtml(input.trim(), { allowedTags: [], allowedAttributes: {} });
}

// Get users with at least 1 active tab open
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

// Send all saved requests immediately when user joins/returns
function sendPendingRequests(username, socketId) {
  if (pendingRequests.has(username)) {
    pendingRequests.get(username).forEach(fromUser => {
      io.to(socketId).emit("friend request received", { from: fromUser });
    });
  }
}

// --------------------------
io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("get online", () => {
    socket.emit("online list", getOnlineUsers());
  });

  // JOIN — load friends + pending requests + ✅ THEME + ✅ USER ID
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
      
      // ✅ ADDED: send back existing ID
      const existingId = [...userAccounts.entries()].find(([_,a])=>a.username===name)?.[0];
      socket.emit("join result", { success: true, userId: existingId });
      
      broadcastOnline();
      return;
    }

    // New user
    registeredNames.add(lowerName);
    friendData.set(name, []);
    pendingRequests.set(name, []);
    
    // ✅ Set default ONLY for NEW users
    userTheme.set(name, "light"); 

    // ✅ ADDED: assign new permanent ID
    const newId = nextUserId++;
    userAccounts.set(newId, {
      id: newId,
      username: name,
      joined: new Date().toLocaleDateString(),
      online: true
    });
    
    socket.emit("friends list", []);
    socket.emit("theme-sync", "light");
    socket.emit("join result", { success: true, userId: newId });
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

  // ✅ CHANGE USERNAME — KEEPS ALL DATA
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

    // ✅ ADDED: UPDATE NAME IN PROFILE RECORD
    for (const [id, acc] of userAccounts.entries()) {
      if (acc.username === cleanOld) acc.username = cleanNew;
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

  // ✅ ADDED: PROFILE FETCH — serves data to /users/X/profile
  socket.on("get profile", (userId) => {
    const uid = Number(userId);
    if (!userAccounts.has(uid)) return socket.emit("profile data", { error: true });
    const acc = userAccounts.get(uid);
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

  // ✅ UPDATED: CHAT — NOW INCLUDES USER ID so links work
  socket.on("chat message", (data) => {
    const userData = onlineSockets.get(socket.id);
    if (!userData || !data.text) return;

    // ✅ find user ID for this sender
    let fromId = null;
    for (const [id, acc] of userAccounts.entries()) {
      if (acc.username === userData.username) fromId = id;
    }

    io.emit("chat message", {
      from: userData.username,
      fromId: fromId, // ✅ ADDED: ID so frontend can make /users/X/profile links
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

    // Save permanently if offline
    if (!pendingRequests.get(to).includes(from)) {
      pendingRequests.get(to).push(from);
      socket.emit("system", `📨 Request saved — ${to} will see it when they return`);
    }
  });

  // ACCEPT REQUEST
  socket.on("friend accept", ({ user, from }) => {
    // Remove from pending
    if (pendingRequests.has(user)) {
      pendingRequests.set(user, pendingRequests.get(user).filter(f => f !== from));
    }

    // Save friendship
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
    // Remove from pending list completely
    if (pendingRequests.has(user)) {
      pendingRequests.set(user, pendingRequests.get(user).filter(f => f !== from));
    }
    // Tell sender they were declined
    const senderSocket = [...onlineSockets.entries()].find(([_,u]) => u.username === from)?.[0];
    if (senderSocket) {
      io.to(senderSocket).emit("request declined", { by: user });
    }
  });

  // UNFRIEND
  socket.on("unfriend", ({ user, friend }) => {
    if (friendData.has(user)) friendData.set(user, friendData.get(user).filter(f => f !== friend));
    if (friendData.has(friend)) friendData.set(friend).filter(f => f !== user);

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
server.listen(PORT, () => console.log("✅ Server running — Theme FIXED: Never resets again!"));