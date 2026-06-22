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
app.use(helmet({ contentSecurityPolicy: false }));

// Remove restrictive headers for assets
app.use((req, res, next) => {
  res.removeHeader("Cross-Origin-Resource-Policy");
  res.removeHeader("Cross-Origin-Embedder-Policy");
  res.removeHeader("Cross-Origin-Opener-Policy");
  next();
});

// Rate limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

// ✅ Full CORS setup — allows DELETE and OPTIONS
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.options("*", cors());

// Extra cross-origin header
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0]);
  next();
});

// Parse JSON bodies
app.use(express.json({ limit: '10kb' }));

// Serve static files
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