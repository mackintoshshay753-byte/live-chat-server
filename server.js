const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const users = {}; 
// username -> socket.id

const friends = {}; 
// username -> [friend usernames]

const requests = {}; 
// username -> [who sent request]

function onlineCount() {
  return Object.keys(users).length;
}

function emitOnline() {
  io.emit("online count", onlineCount());
}

// helper send notification
function notify(socketId, msg) {
  io.to(socketId).emit("notify", msg);
}

io.on("connection", (socket) => {

  socket.on("join", (username) => {
    if (!username) return;

    socket.username = username;
    users[username] = socket.id;

    if (!friends[username]) friends[username] = [];
    if (!requests[username]) requests[username] = [];

    emitOnline();

    socket.emit("friends list", friends[username]);
    socket.emit("friend requests", requests[username]);
  });

  // public chat
  socket.on("chat message", (msg) => {
    if (!socket.username) return;

    io.emit("chat message", {
      username: socket.username,
      msg
    });
  });

  // friend request
  socket.on("friend request", (toUser) => {
    const from = socket.username;
    if (!from || !users[toUser]) return;

    if (!requests[toUser]) requests[toUser] = [];

    if (!requests[toUser].includes(from)) {
      requests[toUser].push(from);
    }

    notify(users[toUser], `${from} sent you a friend request`);
    io.to(users[toUser]).emit("friend requests", requests[toUser]);
  });

  // accept friend
  socket.on("accept friend", (fromUser) => {
    const me = socket.username;
    if (!me) return;

    friends[me].push(fromUser);
    friends[fromUser].push(me);

    requests[me] = requests[me].filter(u => u !== fromUser);

    io.to(users[me]).emit("friends list", friends[me]);
    io.to(users[fromUser]).emit("friends list", friends[fromUser]);
  });

  // decline friend
  socket.on("decline friend", (fromUser) => {
    const me = socket.username;
    if (!me) return;

    requests[me] = requests[me].filter(u => u !== fromUser);

    socket.emit("friend requests", requests[me]);
  });

  // private message
  socket.on("private message", ({ to, msg }) => {
    const from = socket.username;
    if (!from || !users[to]) return;

    io.to(users[to]).emit("private message", {
      from,
      msg
    });

    socket.emit("private message", {
      from,
      msg
    });
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      delete users[socket.username];
    }
    emitOnline();
  });
});

server.listen(3000, () => console.log("Server running"));