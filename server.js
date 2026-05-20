const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors   = require('cors');
const path   = require('path');
const helmet = require('helmet');

const app    = express();
const server = http.createServer(app);

const PORT            = process.env.PORT || 3000;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ["https://idontknowww.neocities.org"];

// ─── Security headers ─────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────
const corsOptions = { origin: ALLOWED_ORIGINS, credentials: true };
app.use(cors(corsOptions));

// ─── Body parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));

// ─── Static files ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Socket.IO ────────────────────────────────────────────────
const io = new Server(server, {
  cors: corsOptions,
  maxHttpBufferSize: 64 * 1024, // 64 KB max per socket message (default is 1 MB)
});

// ─── Data & sockets ───────────────────────────────────────────
const { loadData } = require('./data');
loadData();

const setupSockets = require('./sockets');
setupSockets(io);

// ─── Routes ───────────────────────────────────────────────────
app.use('/api',          require('./routes/api'));
app.use('/api/friends',  require('./routes/friendsapi'));
app.use('/api/groups',   require('./routes/groupsapi'));
app.use('/',             require('./routes/pages'));

// ─── 404 handler (must be after all routes) ───────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ─── Unhandled error handler ──────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));