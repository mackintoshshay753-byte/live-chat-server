require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = ["https://orven.neocities.org"];

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true }
});

// ----------------------
// SIMPLE MEMORY STORAGE (TEMP)
// ----------------------
let accounts = {}; // username -> { id, hash }
let nextId = 1;

// ----------------------
// SOCKET AUTH
// ----------------------
io.on("connection", (socket) => {

  // SIGNUP
  socket.on("signup", async ({ username, password }, cb) => {
    if (!username || !password) {
      return cb({ success: false, message: "Missing fields" });
    }

    const cleanName = username.trim();
    const lower = cleanName.toLowerCase();

    if (accounts[lower]) {
      return cb({ success: false, message: "Username already taken" });
    }

    if (password.length < 8) {
      return cb({ success: false, message: "Password too short" });
    }

    const hash = await bcrypt.hash(password, 10);

    accounts[lower] = {
      id: nextId++,
      username: cleanName,
      hash
    };

    cb({
      success: true,
      username: cleanName,
      id: accounts[lower].id
    });
  });

  // LOGIN
  socket.on("login", async ({ username, password }, cb) => {
    const cleanName = username.trim();
    const lower = cleanName.toLowerCase();

    const account = accounts[lower];

    if (!account) {
      return cb({ success: false, message: "Account not found" });
    }

    const valid = await bcrypt.compare(password, account.hash);

    if (!valid) {
      return cb({ success: false, message: "Incorrect password" });
    }

    cb({
      success: true,
      username: account.username,
      id: account.id
    });
  });

});

server.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
});