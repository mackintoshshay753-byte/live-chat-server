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
// 1. Security — Helmet (relaxed for assets)
// --------------------------
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// --------------------------
// 2. CORS — FIRST, before everything else
// --------------------------
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.options("*", cors()); // Handle preflight

// --------------------------
// 3. Rate Limiting — FIXED: exempt groups + ads
// --------------------------
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests — please wait a moment" },
  // ✅ SKIP rate limit for ALL group routes
  skip: (req) => req.path.startsWith("/api/groups")
});
app.use("/api", apiLimiter);

// --------------------------
// 4. Body Parser
// --------------------------
app.use(express.json({ limit: "10kb" }));

// --------------------------
// 5. Static Files
// --------------------------
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: "1h",
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
  transports: ["polling", "websocket"]
});

// --------------------------
// 7. Data & Routes
// --------------------------
const { loadData } = require("./data");
loadData();

const setupSockets = require("./sockets");
setupSockets(io);

app.use("/api", require("./routes/api"));
app.use("/api/friends", require("./routes/friendsapi"));
app.use("/api/groups", require("./routes/groupsapi"));
app.use("/api/messages", require("./routes/messagesapi"));
app.use("/api/admin", require("./routes/admins"));
app.use("/", require("./routes/pages"));

server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));