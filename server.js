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
const ALLOWED_ORIGINS = ["https://idontknowww.neocities.org"];

// --------------------------
// Security Headers
// --------------------------
app.use(helmet({
  contentSecurityPolicy: false // Disable if you use mixed content
}));

// Remove conflicting cross-origin headers
app.use((req, res, next) => {
  res.removeHeader("Cross-Origin-Resource-Policy");
  res.removeHeader("Cross-Origin-Embedder-Policy");
  res.removeHeader("Cross-Origin-Opener-Policy");
  next();
});

// --------------------------
// CORS Configuration (FIXED)
// --------------------------
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g. server-to-server, Postman)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Handle preflight requests
app.options("*", cors());

// --------------------------
// Rate Limiter (FIXED)
// --------------------------
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Higher limit to avoid 429 errors
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests — please slow down" }
});
app.use(limiter);

// --------------------------
// Parsers & Static Files
// --------------------------
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '1h'
}));

// --------------------------
// Socket.io
// --------------------------
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true
  }
});

// --------------------------
// Load Data & Sockets
// --------------------------
const { loadData } = require('./data');
loadData();

const setupSockets = require('./sockets');
setupSockets(io);

// --------------------------
// Routes
// --------------------------
app.use('/api', require('./routes/api'));
app.use('/api/friends', require('./routes/friendsapi'));
app.use('/api/groups', require('./routes/groupsapi'));
app.use('/api/messages', require('./routes/messagesapi'));
app.use('/api/admin', require('./routes/admins'));
app.use('/', require('./routes/pages'));

// --------------------------
// Start Server
// --------------------------
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Allowed origin: ${ALLOWED_ORIGINS[0]}`);
});