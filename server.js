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
const ALLOWED_ORIGINS = ['https://idontknowww.neocities.org'];

app.set('trust proxy', 1);

app.use(helmet());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '5kb' }));
app.use(express.urlencoded({ extended: false, limit: '5kb' }));

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'deny',
  index: false,
  etag: true,
  maxAge: '1h'
}));

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST']
  }
});

io.use((socket, next) => {
  const origin = socket.handshake.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return next(new Error('Not allowed by Socket.IO CORS'));
  }
  next();
});

const { loadData } = require('./data');
loadData();

const setupSockets = require('./sockets');
setupSockets(io);

const apiRoutes = require('./routes/api');
const friendsApiRoutes = require('./routes/friendsapi');
const groupsApiRoutes = require('./routes/groupsapi');
const messagesApiRoutes = require('./routes/messagesapi');
const pageRoutes = require('./routes/pages');

app.use('/api/friends', rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }));
app.use('/api/groups', rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }));
app.use('/api/messages', rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }));

app.use('/api', apiRoutes);
app.use('/api/friends', friendsApiRoutes);
app.use('/api/groups', groupsApiRoutes);
app.use('/api/messages', messagesApiRoutes);
app.use('/', pageRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: 'Internal server error' });
});

server.listen(PORT, () => console.log('✅ Server running on port', PORT));