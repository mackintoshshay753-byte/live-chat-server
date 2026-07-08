const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = [
    "https://idontknowww.neocities.org"
];

// ---------------- Security ----------------
app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" }
    })
);

// CORS headers
app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin || ALLOWED_ORIGINS[0]);
    }

    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    // Remove headers that sometimes cause issues
    res.removeHeader("Cross-Origin-Embedder-Policy");
    res.removeHeader("Cross-Origin-Opener-Policy");

    next();
});

// ---------------- Rate Limit ----------------
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: "Too many requests. Please try again later."
    }
});

app.use("/api", apiLimiter);

// ---------------- CORS ----------------
const corsOptions = {
    origin(origin, callback) {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true
};

app.use(cors(corsOptions));

// Express 5 compatible
app.options(/.*/, cors(corsOptions));

// ---------------- Body Parser ----------------
app.use(express.json({
    limit: "5mb" // Allow up to 5MB — more than enough for any group icon
}));
app.use(express.urlencoded({ limit: "5mb", extended: true }));

// ---------------- Static ----------------
app.use(express.static(path.join(__dirname, "public"), {
    etag: true,
    maxAge: "1h",
    immutable: true,
    setHeaders(res) {
        res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0]);
    }
}));

// ---------------- Socket.io ----------------
const io = new Server(server, {
    cors: {
        origin: ALLOWED_ORIGINS,
        credentials: true
    },
    transports: ["websocket", "polling"]
});

// ---------------- Load Data ----------------
const { loadData } = require("./data");
loadData();

// ---------------- Sockets ----------------
require("./sockets")(io);

// ---------------- Routes ----------------
app.use("/api", require("./routes/api"));
app.use("/api/friends", require("./routes/friendsapi"));
app.use("/api/messages", require("./routes/messagesapi"));
app.use("/api/advert", require("./routes/advertapi"));
app.use("/api/admin", require("./routes/admins"));
app.use("/api/chat", require("./routes/chat"));
app.use("/api/groups", require("./routes/groupsapi"));
app.use("/", require("./routes/pages"));

// ---------------- 404 ----------------
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Route not found"
    });
});

// ---------------- Error Handler ----------------
app.use((err, req, res, next) => {
    console.error(err);

    res.status(err.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === "production"
            ? "Internal Server Error"
            : err.message
    });
});

// ---------------- Start ----------------
server.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on port ${PORT}`);
});