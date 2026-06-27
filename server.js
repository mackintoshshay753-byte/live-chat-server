const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = [
  "https://idontknowww.neocities.org",
  "http://idontknowww.neocities.org",
  "null", // For local testing
  "http://localhost:8080", // if you test locally
  "http://127.0.0.1"
];

// ======================
// 1. Security
// ======================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// ======================
// 2. CORS (Clean & Strong)
// ======================
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`❌ Blocked origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

// Handle preflight
app.options("*", cors());

// ======================
// 3. Rate Limiting (Relaxed for dev)
// ======================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 800,                    // Increased
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/groups' && req.method === 'GET' // Less strict on group reads
});

app.use('/api', apiLimiter);

// ======================
// 4. Body Parser
// ======================
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ======================
// 5. Static Files
// ======================
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: true
}));

// ======================
// 6. Socket.io
// ======================
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true
  },
  transports: ["websocket", "polling"]
});

// ======================
// 7. Routes & Data
// ======================
const { loadData } = require('./data');
loadData();

const setupSockets = require('./sockets');
setupSockets(io);

app.use('/api', require('./routes/api'));
app.use('/api/friends', require('./routes/friendsapi'));
app.use('/api/groups', require('./routes/groupsapi'));
app.use('/api/messages', require('./routes/messagesapi'));
app.use('/api/admin', require('./routes/admins'));
app.use('/', require('./routes/pages'));

// ======================
// Start Server
// ======================
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Allowed origins:`, ALLOWED_ORIGINS);
});