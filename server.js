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
  "https://idontknowww.neocities.org"
];

// -------------------- SECURITY MIDDLEWARE --------------------

// Basic HTTP security headers
app.use(helmet());

// Safer JSON parsing (limit already good, keep it strict)
app.use(express.json({ limit: '10kb' }));

// Rate limit (prevents spam / brute force)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 200, // limit each IP
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

// CORS locked down
app.use(cors({
  origin: function (origin, callback) {
    // allow server-to-server / Postman (no origin)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("CORS blocked"));
  },
  credentials: true
}));

// Prevent directory sniffing / safer static hosting
app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'ignore',
  extensions: ['html'],
  maxAge: '1d'
}));

// -------------------- SOCKET.IO --------------------

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true
  },
  transports: ['websocket', 'polling'], // optional stability
  pingTimeout: 20000,
  pingInterval: 25000
});

// -------------------- LOAD SYSTEMS --------------------

const { loadData } = require('./data');
loadData();

const setupSockets = require('./sockets');
setupSockets(io);

// -------------------- ROUTES --------------------

const apiRoutes = require('./routes/api');
const friendsApiRoutes = require('./routes/friendsapi');
const groupsApiRoutes = require('./routes/groupsapi');
const messagesApiRoutes = require('./routes/messagesapi');
const pageRoutes = require('./routes/pages');

app.use('/api', apiRoutes);
app.use('/api/friends', friendsApiRoutes);
app.use('/api/groups', groupsApiRoutes);
app.use('/api/messages', messagesApiRoutes);
app.use('/', pageRoutes);

// -------------------- GLOBAL ERROR HANDLER --------------------

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// -------------------- START --------------------

server.listen(PORT, () =>
  console.log(`✅ Server running on port ${PORT}`)
);