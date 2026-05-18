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

// Setup sockets
const setupSockets = require('./sockets');
setupSockets(io);

// Load routes
const apiRoutes = require('./routes/api');
const friendsApiRoutes = require('./routes/friendsapi'); // ✅ ADDED — loads your new friend system routes
const pageRoutes = require('./routes/pages');

app.use('/api', apiRoutes);
app.use('/api/friends', friendsApiRoutes); // ✅ ADDED — makes all /api/friends/... URLs work
app.use('/', pageRoutes);

server.listen(PORT, () => console.log("✅ Server running on port", PORT));