const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

function updateOnline() {
  io.emit("online count", io.of("/").sockets.size);
}

io.on("connection", (socket) => {

  updateOnline();

  socket.on("join", (username) => {
    socket.username = username;
    socket.emit("system", `Welcome ${username}`);
  });

  // FIXED CHAT
  socket.on("chat message", (data) => {

    if (!data?.username || !data?.msg) return;

    io.emit("chat message", {
      username: data.username,
      msg: data.msg
    });

  });

  socket.on("request online", updateOnline);

  socket.on("disconnect", () => {
    setTimeout(updateOnline, 50);
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});