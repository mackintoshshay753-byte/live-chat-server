const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000; // Use Render's assigned port automatically
const ALLOWED_ORIGINS = ["https://idontknowww.neocities.org"];

// --------------------------
// 1. Security & Headers
// --------------------------
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" } // Allow images/assets to load
}));

// Extra headers to avoid blocking assets
app.use((req, res, next) => {
  res.removeHeader("Cross-Origin-Embedder-Policy");
  res.removeHeader("Cross-Origin-Opener-Policy");
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  next();
});

// --------------------------
// 2. Rate Limiting (Fixed)
// --------------------------
// Lower limit but clearer — prevents 429 errors from normal use
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Allow more requests before blocking
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests — please wait a moment" }
});
app.use('/api', apiLimiter);

// --------------------------
// 3. CORS Configuration
// --------------------------
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests from your domain OR no origin (server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "DELETE", "PUT", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors()); // Handle preflight requests

// --------------------------
// 4. Body Parser
// --------------------------
app.use(express.json({ limit: '10kb' }));

// --------------------------
// 5. Static Files
// --------------------------
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '1h',
  immutable: true,
  setHeaders: (res) => {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0]);
  }
}));

// --------------------------
// 6. Socket.io
// --------------------------
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ["GET", "POST"]
  },
  transports: ["polling", "websocket"] // Better for Render free tier
});

// --------------------------
// 7. Load Data & Routes
// --------------------------
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

// Start server
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));