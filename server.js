require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const sanitizeHtml = require('sanitize-html');

const app = express();
const server = http.createServer(app);

// --------------------------
const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ["https://idontknowww.neocities.org"];

app.use(helmet());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10kb' }));

const httpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(httpLimiter);

// --------------------------
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// --------------------------
const onlineUsers = new Map(); // socket.id → username
const registeredUsernames = new Set(); // All usernames ever registered (lowercase)
const userFriends = new Map(); // username → [friendUsernames]

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return sanitizeHtml(input.trim(), {
    allowedTags: [],
    allowedAttributes: {}
  });
}

// Count UNIQUE usernames currently online
function getUniqueOnlineCount() {
  const unique = new Set(Array.from(onlineUsers.values()));
  return unique.size;
}

// --------------------------
io.on('connection', (socket) => {

  console.log("Connected:", socket.id);

  socket.emit('online count', getUniqueOnlineCount());

  const updateOnline = () => {
    io.emit('online count', getUniqueOnlineCount());
  };

  // JOIN — ✅ ALLOW MULTIPLE CONNECTIONS FROM SAME USERNAME
  socket.on('join', (rawUsername) => {
    const username = sanitizeInput(rawUsername) || "Anonymous";
    const lowerName = username.toLowerCase();

    if (username.length < 2 || username.length > 20) {
      return socket.emit('join result', { success: false, message: "Invalid length (2-20 chars)" });
    }

    // ❌ BLOCK ONLY IF SOMEONE ELSE TRIES TO USE IT
    if (registeredUsernames.has(lowerName)) {
      onlineUsers.set(socket.id, username);
      if (!userFriends.has(username)) userFriends.set(username, []);
      socket.emit('friends list', userFriends.get(username));
      socket.emit('join result', { success: true });
      updateOnline();
      return;
    }

    // ✅ FIRST TIME — REGISTER IT FOREVER
    registeredUsernames.add(lowerName);
    onlineUsers.set(socket.id, username);
    if (!userFriends.has(username)) userFriends.set(username, []);
    socket.emit('friends list', userFriends.get(username));

    socket.emit('join result', { success: true });
    socket.broadcast.emit('system', `${username} joined`);
    updateOnline();
  });

  // MESSAGE
  socket.on('chat message', (data) => {
  const username = onlineUsers.get(socket.id);
  if (!username) return;

  if (!data?.msg) return;

  const msg = sanitizeInput(data.msg);
  if (msg.length < 1 || msg.length > 500) return;

  const messageObj = {
    username,
    msg,
    timestamp: new Date().toISOString()
  };

  socket.broadcast.emit('chat message', messageObj);
});

  // TYPING
  socket.on('typing', () => {
    const user = onlineUsers.get(socket.id);
    if (user) socket.broadcast.emit('typing', user);
  });

  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing');
  });

  // ONLINE
  socket.on('request online', () => {
    socket.emit('online count', getUniqueOnlineCount());
  });

  // 🤝 FRIEND REQUEST SYSTEM
  socket.on('friend request', ({ from, to }) => {
    const targetSocketId = [...onlineUsers.entries()].find(([_,u]) => u === to)?.[0];
    if (!targetSocketId) return socket.emit('system', `⚠️ ${to} is not online`);

    io.to(targetSocketId).emit('friend request received', { from });
  });

  socket.on('friend accept', ({ user, from }) => {
    // Add both ways
    if (!userFriends.get(user).includes(from)) userFriends.get(user).push(from);
    if (!userFriends.get(from).includes(user)) userFriends.get(from).push(user);

    // Notify all sessions of both users
    io.emit('friend added', { friend: from, forUser: user });
    io.emit('friend added', { friend: user, forUser: from });
  });

  socket.on('friend decline', ({ user, from }) => {
    io.emit('friend request declined', { to: user, forUser: from });
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      onlineUsers.delete(socket.id);
      updateOnline();
    }
  });
});

// --------------------------
app.get('/', (req, res) => {
  res.send("Live Chat Running");
});

server.listen(PORT, () => {
  console.log("Server running on", PORT);
});