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

/* ---------------- TRUST PROXY (important for deploys) ---------------- */
app.set('trust proxy', 1);

/* ---------------- SECURITY HEADERS ---------------- */
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", ...ALLOWED_ORIGINS],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"]
      }
    }
  })
);

/* ---------------- RATE LIMITING (API ONLY) ---------------- */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api', apiLimiter);

/* ---------------- CORS (more robust) ---------------- */
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS blocked'));
      }
    },
    credentials: true,
    methods: ["GET", "POST"]
  })
);

/* ---------------- BODY LIMIT ---------------- */
app.use(express.json({ limit: '10kb' }));

/* ---------------- STATIC FILES ---------------- */
app.use(
  express.static(path.join(__dirname, 'public'), {
    etag: true,
    maxAge: '1h'
    // removed immutable:true (safe unless you use hashed filenames)
  })
);

/* ---------------- SOCKET.IO ---------------- */
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true
  }
});

/* ---------------- DATA LOAD (safe async wrapper) ---------------- */
const { loadData } = require('./data');

(async () => {
  try {
    await loadData();

    /* ---------------- SOCKET SETUP ---------------- */
    const setupSockets = require('./sockets');
    setupSockets(io);

    /* ---------------- ROUTES ---------------- */
    app.use('/api', require('./routes/api'));
    app.use('/api/friends', require('./routes/friendsapi'));
    app.use('/api/groups', require('./routes/groupsapi'));
    app.use('/', require('./routes/pages'));

    /* ---------------- START SERVER ---------------- */
    server.listen(PORT, () =>
      console.log(`✅ Server running on port ${PORT}`)
    );
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
})();