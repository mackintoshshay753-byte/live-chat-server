// server.js
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
// Security & Configuration
// --------------------------
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ["https://idontknowww.neocities.org"];

// Security headers
app.use(helmet());

// CORS configuration — ONLY your trusted domains
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

// Rate limiting for HTTP requests
const httpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
});
app.use(httpLimiter);

app.use(express.json({ limit: '10kb' }));

// --------------------------
// Socket.IO Setup
// --------------------------
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000
});

// Socket-level rate limiting
const socketLimits = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const MAX_MESSAGES = 5; // 5 messages/sec

// --------------------------
// State
// --------------------------
const onlineUsers = new Map(); // socket.id → username
const messageHistory = [];
const MAX_HISTORY = 100;

// --------------------------
// Helpers
// --------------------------
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return sanitizeHtml(input.trim(), {
    allowedTags: [],
    allowedAttributes: {}
  });
}

function isRateLimited(socketId) {
  const now = Date.now();
  if (!socketLimits.has(socketId)) {
    socketLimits.set(socketId, { count: 1, start: now });
    return false;
  }
  const userLimit = socketLimits.get(socketId);
  if (now - userLimit.start > RATE_LIMIT_WINDOW) {
    socketLimits.set(socketId, { count: 1, start: now });
    return false;
  }
  if (userLimit.count >= MAX_MESSAGES) return true;
  userLimit.count++;
  return false;
}

function cleanupOldLimits() {
  const now = Date.now();
  socketLimits.forEach((val, key) => {
    if (now - val.start > RATE_LIMIT_WINDOW) socketLimits.delete(key);
  });
}
setInterval(cleanupOldLimits, 30000);

// --------------------------
// Socket Logic
// --------------------------
io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  // Send history & online count on connect
  socket.emit('message history', messageHistory);
  socket.emit('online count', onlineUsers.size);

  function updateOnlineCount() {
    io.emit('online count', onlineUsers.size);
  }

  // Join
  socket.on('join', (rawUsername) => {
    if (onlineUsers.has(socket.id)) return;
    const username = sanitizeInput(rawUsername) || "Anonymous";
    if (username.length < 2 || username.length > 20) {
      return socket.emit('system', "❌ Username 2–20 characters only");
    }
    onlineUsers.set(socket.id, username);
    socket.broadcast.emit('system', `📢 ${username} joined`);
    updateOnlineCount();
  });

  // Chat message
  socket.on('chat message', (data) => {
    try {
      const username = onlineUsers.get(socket.id);
      if (!username) return;

      if (isRateLimited(socket.id)) {
        return socket.emit('system', "⚠️ Slow down — too many messages!");
      }

      if (!data?.msg) return;
      const msg = sanitizeInput(data.msg);
      if (msg.length < 1 || msg.length > 500) return;

      const messageObj = {
        username,
        msg,
        timestamp: new Date().toISOString()
      };

      messageHistory.push(messageObj);
      if (messageHistory.length > MAX_HISTORY) messageHistory.shift();

      io.emit('chat message', messageObj);
    } catch (err) {
      console.error('❌ Message error:', err.message);
      socket.emit('system', "❌ Failed to send message");
    }
  });

  // Typing indicators
  socket.on('typing', () => {
    const user = onlineUsers.get(socket.id);
    if (user) socket.broadcast.emit('typing', user);
  });
  socket.on('stop typing', () => socket.broadcast.emit('stop typing'));

  // Request online count
  socket.on('request online', () => socket.emit('online count', onlineUsers.size));

  // Disconnect
  socket.on('disconnect', (reason) => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      onlineUsers.delete(socket.id);
      socket.broadcast.emit('system', `📢 ${user} left`);
      updateOnlineCount();
    }
    console.log(`🔌 Disconnected: ${socket.id} | ${reason}`);
  });

  socket.on('error', (err) => console.error(`⚠️ Socket error:`, err.message));
});

// --------------------------
// Health Check
// --------------------------
app.get('/', (req, res) => {
  res.send('✅ Live Chat Server Running — https://idontknowww.neocities.org');
});
app.get('/health', (req, res) => {
  res.json({ status: 'ok', online: onlineUsers.size });
});

// --------------------------
// Start Server
// --------------------------
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔒 Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});