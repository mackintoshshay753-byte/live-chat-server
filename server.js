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
// ✅ BOTH WEBSITES ALLOWED HERE
const ALLOWED_ORIGINS = [
  "https://idontknowww.neocities.org",
  "https://orven.neocities.org"
];

// Security headers
app.use(helmet({
  contentSecurityPolicy: false
}));

// Remove Helmet CORP/COEP for static files (fixes images)
app.use((req, res, next) => {
  res.removeHeader("Cross-Origin-Resource-Policy");
  res.removeHeader("Cross-Origin-Embedder-Policy");
  res.removeHeader("Cross-Origin-Opener-Policy");
  next();
});

// Basic rate limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

// ✅ Updated CORS to accept both domains
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like Postman/curl) or from allowed list
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST"]
}));

// ✅ Allow images to load from either origin
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
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

// ✅ Socket.io updated for both domains
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true
  }
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