const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

const PORT = 3000;
const ALLOWED_ORIGINS = ["https://idontknowww.neocities.org"];

// Security headers
app.use(helmet({
  contentSecurityPolicy: false // Neocities blocks inline CSP
}));

// Basic rate limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

// CORS
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ["GET", "POST"]
}));

// ⭐ REQUIRED FOR IMAGES TO LOAD ON NEOCITIES
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0]);
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Body parser
app.use(express.json({ limit: '10kb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '1h',
  immutable: true
}));

// Socket.io
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true }
});

// Load data
const { loadData } = require('./data');
loadData();

// Sockets
const setupSockets = require('./sockets');
setupSockets(io);

// Routes
app.use('/api', require('./routes/api'));
app.use('/api/friends', require('./routes/friendsapi'));
app.use('/api/groups', require('./routes/groupsapi'));
app.use('/api/messages', require('./routes/messagesapi'));
app.use('/', require('./routes/pages'));

server.listen(PORT, () => console.log("✅ Server running on port", PORT));
