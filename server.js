const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

const PORT = 3000;
const ALLOWED_ORIGINS = ["https://idontknowww.neocities.org"];

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true }
});

// Load data
const { loadData } = require('./data');
loadData();

// ✅ Load friends API with status tracking
const friendsApi = require('./routes/friendsapi');

// Setup sockets — keep your original setup
const setupSockets = require('./sockets');
setupSockets(io);

// ✅ WRAP the original socket logic to add online tracking
io.of("/").on("connection", (socket) => {
  // --- YOUR ORIGINAL SOCKET EVENTS (from sockets/index.js) stay untouched ---
  // We just add these new ones below:

  // ✅ When user logs in → mark as online
  socket.on("login", async (data, cb) => {
    // First run your original login logic from sockets/index.js
    // ... (original code runs)

    // ✅ Then mark user as online
    if (data && data.id) {
      socket.userId = Number(data.id); // store ID on socket
      friendsApi.userConnect(socket.userId);
      io.emit("user-status-changed", { userId: socket.userId, isOnline: true });
    }
  });

  // ✅ When user disconnects → mark as offline
  socket.on("disconnect", () => {
    if (socket.userId) {
      friendsApi.userDisconnect(socket.userId);
      io.emit("user-status-changed", { userId: socket.userId, isOnline: false });
    }
  });
});

// Load routes
const apiRoutes = require('./routes/api');
const pageRoutes = require('./routes/pages');

app.use('/api', apiRoutes);
app.use('/api/friends', friendsApi.router); // ✅ Use the router from friendsapi
app.use('/', pageRoutes);

server.listen(PORT, () => console.log("✅ Server running on port", PORT));