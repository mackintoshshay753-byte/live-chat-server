const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = ["https://idontknowww.neocities.org"];

// Trust proxy — REQUIRED for Render
app.set("trust proxy", 1);

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Global CORS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || ALLOWED_ORIGINS[0]);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.removeHeader("Cross-Origin-Embedder-Policy");
  res.removeHeader("Cross-Origin-Opener-Policy");
  next();
});

// CORS Middleware
const corsOptions = {
  origin: (origin, cb) => !origin || ALLOWED_ORIGINS.includes(origin) ? cb(null, true) : cb(new Error("Not allowed")),
  credentials: true
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// Body Parsers
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));

// Static Files
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: "1h",
  immutable: true,
  setHeaders: res => res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0])
}));

// Socket.IO — FIXED: polling FIRST for Render compatibility
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
  transports: ["polling", "websocket"],
  pingInterval: 25000,
  pingTimeout: 60000
});

// Load Data
const { loadData } = require("./data");
loadData();

// Socket Handlers
require("./sockets")(io);

// Routes
app.use("/api", require("./routes/api"));
app.use("/api/friends", require("./routes/friendsapi"));
app.use("/api/messages", require("./routes/messagesapi"));
app.use("/api/advert", require("./routes/advertapi"));
app.use("/api/admin", require("./routes/admins"));
app.use("/api/chat", require("./routes/chat"));
app.use("/api/groups", require("./routes/groupsapi"));
app.use("/api/outfits", require("./routes/outfitsapi"));
app.use("/api/catalog", require("./routes/catalogapi"));
app.use("/", require("./routes/pages"));

// Error Pages
app.use((req, res) => res.status(404).json({ success: false, error: "Route not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === "production" ? "Internal Server Error" : err.message
  });
});

// Start Server
server.listen(PORT, "0.0.0.0", () => console.log(`✅ Server running on port ${PORT}`));