const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const users = {};          // username -> socket.id
const friends = {};        // username -> Set()
const requests = {};       // username -> [from]

function sendOnline() {
  io.emit("users", Object.keys(users));
}

io.on("connection", (socket) => {

  socket.on("join", (username) => {

    if (!username) return;

    socket.username = username;
    users[username] = socket.id;

    if (!friends[username]) friends[username] = new Set();

    sendOnline();
  });

  // PUBLIC CHAT
  socket.on("chat message", (msg) => {
    if (!socket.username) return;

    io.emit("chat message", {
      user: socket.username,
      msg
    });
  });

  // FRIEND REQUEST
  socket.on("friend request", (to) => {
    const from = socket.username;
    if (!from || !users[to]) return;

    if (!requests[to]) requests[to] = [];
    requests[to].push(from);

    io.to(users[to]).emit("friend request", from);
  });

  // ACCEPT FRIEND
  socket.on("friend accept", (from) => {
    const to = socket.username;

    friends[to].add(from);
    friends[from].add(to);

    io.to(users[to]).emit("friend added", from);
    io.to(users[from]).emit("friend added", to);
  });

  // PRIVATE MESSAGE
  socket.on("dm", ({ to, msg }) => {
    const from = socket.username;
    if (!users[to]) return;

    io.to(users[to]).emit("dm", { from, msg });
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      delete users[socket.username];
      sendOnline();
    }
  });

});

server.listen(3000, () => console.log("server running"));