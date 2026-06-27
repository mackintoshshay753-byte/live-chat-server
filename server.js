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
// 1. Security — Lightweight, no blocking
// --------------------------
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  hsts: false
}));

// --------------------------
// 2. CORS — Simple & Fast
// --------------------------
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.options("*", cors());

// --------------------------
// 3. Rate Limiting — ONLY apply to non-group routes
// --------------------------
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests — please wait" },
  // ✅ Completely skip rate limit for groups/ads/wall
  skip: (req) =>
    req.path.startsWith("/api/groups") ||
    req.path.startsWith("/api/ads") ||
    req.path.startsWith("/api/static")
});
app.use("/api", apiLimiter);

// --------------------------
// 4. Body Parser — Higher limit to avoid errors
// --------------------------
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// --------------------------
// 5. Static Files — Faster serving
// --------------------------
app.use("/uploads", express.static(path.join(__dirname, "public/uploads"), {
  maxAge: "24h",
  setHeaders: (res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400");
  }
}));

app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "1h",
  index: false
}));

// --------------------------
// 6. Socket.io — Optimized for Render
// --------------------------
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true
  },
  transports: ["websocket"], // Faster than polling
  pingTimeout: 60000,
  pingInterval: 25000
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

// --------------------------
// 8. Health check & error handling
// --------------------------
app.get("/", (req, res) => res.sendStatus(200));
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ success: false, error: "Server error" });
});

// Start server
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.listen(PORT, () => console.log(`✅ Server running fast on port ${PORT}`));