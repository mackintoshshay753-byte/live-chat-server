const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet'); // 1. Secure HTTP headers
const rateLimit = require('express-rate-limit'); // 2. Prevents Brute-force/DDoS
const customParser = require('socket.io-msgpack-parser'); // 3. Optimizes/Secures Socket payload
require('dotenv').config(); // 4. Environment variable management

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ["https://idontknowww.neocities.org"];

// --- SECURITY MIDDLEWARE ---

// 1. Helmet: Sets secure HTTP headers (Clickjacking, XSS, sniffing protection)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", ...ALLOWED_ORIGINS, "wss://*.neocities.org"], // Allow socket connections
      scriptSrc: ["'self'", "'unsafe-inline'"], // Adjust based on your frontend needs
    },
  },
}));

// 2. CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl) or if it's in the allowed list
    if (!origin || ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 3. Global Rate Limiter (Max 100 requests per 15 minutes per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  standardHeaders: true, 
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter); // Apply specifically to API endpoints

// 4. Body parser with strict limits
app.use(express.json({ limit: '10kb' })); 
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// --- SOCKET.IO SECURITY ---
const io = new Server(server, {
  cors: { 
    origin: ALLOWED_ORIGINS, 
    credentials: true 
  },
  parser: customParser, // Binary packet serialization (prevents massive JSON buffer exploits)
  maxHttpBufferSize: 1e6, // 1MB maximum payload size limit per message
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // Securely recover sessions safely
    skipMiddlewares: true,
  }
});

// Load data
const { loadData } = require('./data');
loadData();

// Setup sockets (Ensure authentication middleware is added inside this file)
const setupSockets = require('./sockets');
setupSockets(io);

// Load routes
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

// 5. Centralized Error Handling Middleware (Prevents stack trace leaks)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  });
});

server.listen(PORT, () => console.log(`✅ Server securely running on port ${PORT}`));