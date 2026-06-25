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
  contentSecurityPolicy: false, // Disable CSP so your frontend works
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" } // Allow images/assets from other origins
}));

// --------------------------
// Rate Limiting
// --------------------------
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests — please slow down" }
});
app.use(globalLimiter);

// --------------------------
// CORS Configuration
// --------------------------
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "Pragma"]
}));

// Handle preflight OPTIONS requests
app.options("*", cors());

// --------------------------
// Body Parser
// --------------------------
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// --------------------------
// Static Files
// --------------------------
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '1h',
  immutable: true,
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }
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
// Data & Sockets
// --------------------------
const { loadData } = require('./data');
loadData();

const setupSockets = require('./sockets');
setupSockets(io);

// --------------------------
// API Routes
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
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));