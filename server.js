const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {

  socket.on("join", (username) => {
    socket.username = username;
  });

  socket.on("chat message", (msg) => {

    io.emit("chat message", {
      username: socket.username || "Anonymous",
      msg
    });

  });

});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});