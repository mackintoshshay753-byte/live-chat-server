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
const onlineUsers = new Map();
const messageHistory = [];
const MAX_HISTORY = 100;

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return sanitizeHtml(input.trim(), {
    allowedTags: [],
    allowedAttributes: {}
  });
}

// --------------------------
io.on('connection', (socket) => {

  console.log("Connected:", socket.id);

  socket.emit('message history', messageHistory);
  socket.emit('online count', onlineUsers.size);

  const updateOnline = () => {
    io.emit('online count', onlineUsers.size);
  };

  // JOIN
  socket.on('join', (rawUsername) => {
    if (onlineUsers.has(socket.id)) return;

    const username = sanitizeInput(rawUsername) || "Anonymous";

    if (username.length < 2 || username.length > 20) {
      return socket.emit('system', "Invalid username");
    }

    onlineUsers.set(socket.id, username);

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

    messageHistory.push(messageObj);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();

    // ✅ ONLY send to others
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
    socket.emit('online count', onlineUsers.size);
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);

    if (user) {
      onlineUsers.delete(socket.id);
      socket.broadcast.emit('system', `${user} left`);
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