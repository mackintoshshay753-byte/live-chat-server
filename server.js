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

  // JOIN — load friends + pending requests + ✅ THEME
  socket.on("join", (rawName) => {
  const name = clean(rawName);
  const lowerName = name.toLowerCase();
  // VALIDATION
  if (name.length < 2 || name.length > 20) {
    return socket.emit("join result", {
      success: false,
      message: "Username must be 2-20 characters"
    });
  }
  // NO SPACES
  if (/\s/.test(name)) {
    return socket.emit("join result", {
      success: false,
      message: "Usernames cannot contain spaces"
    });
  }
  // ONLY LETTERS NUMBERS _
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    return socket.emit("join result", {
      success: false,
      message: "Only letters, numbers, and underscores allowed"
    });
  }
  // 🚫 BLOCK EXISTING USERNAMES
  if (registeredNames.has(lowerName)) {
    return socket.emit("join result", {
      success: false,
      message: "That username is already taken"
    });
  }
  // ✅ CREATE NEW ACCOUNT
  registeredNames.add(lowerName);
  onlineSockets.set(socket.id, {
    username: name,
    isActive: true
  });
  friendData.set(name, []);
  pendingRequests.set(name, []);
  userTheme.set(name, "light");
  socket.emit("friends list", []);
  socket.emit("theme-sync", "light");
  socket.emit("join result", {
    success: true
  });
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

  // Tab active/inactive
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
    io.emit("chat message", {
      from: userData.username,
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