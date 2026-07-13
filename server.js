const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const fs = require("fs");

const app = express();
const server = http.createServer(app);

// ✅ Use Render's default required port
const PORT = process.env.PORT || 10000;

const ALLOWED_ORIGINS = ["https://idontknowww.neocities.org"];

// ---------------- Trust Proxy (REQUIRED for Render) ----------------
app.set("trust proxy", 1);

// ---------------- Security ----------------
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// ---------------- CORS ----------------
const corsOptions = {
    origin(origin, callback) {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) callback(null, true);
        else callback(new Error("Not allowed by CORS"));
    },
    credentials: true
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// ---------------- Body Parser ----------------
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));

// ---------------- Static Files (Safe Check) ----------------
const PUBLIC_PATH = path.join(__dirname, "public");
if (fs.existsSync(PUBLIC_PATH)) {
    app.use(express.static(PUBLIC_PATH, {
        etag: true,
        maxAge: "1h",
        immutable: true,
        setHeaders: res => res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0])
    }));
} else {
    console.log("ℹ️ Public folder not found — static serving skipped");
}

// ---------------- Socket.io ----------------
const io = new Server(server, {
    cors: { origin: ALLOWED_ORIGINS, credentials: true },
    transports: ["websocket", "polling"],
    pingInterval: 10000,
    pingTimeout: 15000
});

// ---------------- Load Data & Sockets ----------------
const { loadData } = require("./data");
loadData();
require("./sockets")(io);

// ---------------- Routes ----------------
app.use("/api", require("./routes/api"));
app.use("/api/friends", require("./routes/friendsapi"));
app.use("/api/messages", require("./routes/messagesapi"));
app.use("/api/advert", require("./routes/advertapi"));
app.use("/api/admin", require("./routes/admins"));
app.use("/api/chat", require("./routes/chat"));
app.use("/api/groups", require("./routes/groupsapi"));
app.use("/api/outfits", require("./routes/outfitsapi"));
app.use("/api/catalog", require("./routes/catalogapi"));
app.use("/", require("./routes/pages")); // ✅ Safe now with your fixed pages.js

// ---------------- Error Handling ----------------
app.use((req, res) => res.status(404).json({ success: false, error: "Route not found" }));
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === "production" ? "Internal Server Error" : err.message
    });
});

// ---------------- Start Server ----------------
server.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on port ${PORT}`);
});