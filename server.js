require('dotenv').config();

const express = require('express');
const http = require('http');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const { Server } = require('socket.io');

const app = express();

/*
|--------------------------------------------------------------------------
| Security Config
|--------------------------------------------------------------------------
*/

const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = [
  "https://idontknowww.neocities.org"
];

/*
|--------------------------------------------------------------------------
| Trust Proxy (for reverse proxies like Cloudflare/Nginx/Render)
|--------------------------------------------------------------------------
*/
app.set('trust proxy', 1);

/*
|--------------------------------------------------------------------------
| HTTP Server
|--------------------------------------------------------------------------
*/
const server = http.createServer(app);

/*
|--------------------------------------------------------------------------
| Helmet Security Headers
|--------------------------------------------------------------------------
*/
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", ...ALLOWED_ORIGINS],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    }
  })
);

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Blocked by CORS"));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

/*
|--------------------------------------------------------------------------
| Request Limits & Parsing
|--------------------------------------------------------------------------
*/
app.use(express.json({
  limit: '10kb',
  strict: true
}));

app.use(express.urlencoded({
  extended: false,
  limit: '10kb'
}));

/*
|--------------------------------------------------------------------------
| Prevent Common Attacks
|--------------------------------------------------------------------------
*/

// Prevent MongoDB operator injection
app.use(mongoSanitize());

// Prevent HTTP Parameter Pollution
app.use(hpp());

// Hide Express signature
app.disable('x-powered-by');

/*
|--------------------------------------------------------------------------
| Compression
|--------------------------------------------------------------------------
*/
app.use(compression());

/*
|--------------------------------------------------------------------------
| Global Rate Limiter
|--------------------------------------------------------------------------
*/
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests"
  }
});

app.use(globalLimiter);

/*
|--------------------------------------------------------------------------
| API Rate Limiter
|--------------------------------------------------------------------------
*/
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api', apiLimiter);

/*
|--------------------------------------------------------------------------
| Static Files
|--------------------------------------------------------------------------
*/
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: '1d',
  etag: true,
  index: false
}));

/*
|--------------------------------------------------------------------------
| Socket.IO Security
|--------------------------------------------------------------------------
*/
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true
  },

  transports: ['websocket'],

  allowRequest: (req, callback) => {
    const origin = req.headers.origin;

    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback("Forbidden", false);
    }
  },

  connectionStateRecovery: {}
});

/*
|--------------------------------------------------------------------------
| Socket Middleware
|--------------------------------------------------------------------------
*/
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    // Example token check
    if (!token || typeof token !== 'string') {
      return next(new Error("Unauthorized"));
    }

    // Example validation
    if (token.length > 200) {
      return next(new Error("Invalid token"));
    }

    next();
  } catch {
    next(new Error("Authentication failed"));
  }
});

/*
|--------------------------------------------------------------------------
| Request Logging
|--------------------------------------------------------------------------
*/
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();

  console.log(
    `[${new Date().toISOString()}]`,
    req.ip,
    req.method,
    req.originalUrl
  );

  next();
});

/*
|--------------------------------------------------------------------------
| Load Data
|--------------------------------------------------------------------------
*/
const { loadData } = require('./data');
loadData();

/*
|--------------------------------------------------------------------------
| Setup Sockets
|--------------------------------------------------------------------------
*/
const setupSockets = require('./sockets');
setupSockets(io);

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/
const apiRoutes = require('./routes/api');
const friendsApiRoutes = require('./routes/friendsapi');
const groupsApiRoutes = require('./routes/groupsapi');
const pageRoutes = require('./routes/pages');

app.use('/api', apiRoutes);
app.use('/api/friends', friendsApiRoutes);
app.use('/api/groups', groupsApiRoutes);
app.use('/', pageRoutes);

/*
|--------------------------------------------------------------------------
| 404 Handler
|--------------------------------------------------------------------------
*/
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

/*
|--------------------------------------------------------------------------
| Global Error Handler
|--------------------------------------------------------------------------
*/
app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message
  });
});

/*
|--------------------------------------------------------------------------
| Graceful Shutdown
|--------------------------------------------------------------------------
*/
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  console.log("Shutting down server...");

  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
}

/*
|--------------------------------------------------------------------------
| Start Server
|--------------------------------------------------------------------------
*/
server.listen(PORT, () => {
  console.log(`✅ Secure server running on port ${PORT}`);
});