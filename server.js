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
  username = String(username || "").trim();

  if (!username) {
    socket.emit("system", "Invalid username");
    return;
  }

  socket.username = username.slice(0, 20);
  socket.emit("system", `Welcome ${socket.username}`);
});

  // FIXED CHAT
  socket.on("chat message", (data) => {
  if (!socket.username) return; // must join first

  const msg = typeof data?.msg === "string"
    ? data.msg
    : JSON.stringify(data?.msg);

  io.emit("chat message", {
    username: socket.username, // ALWAYS trusted server value
    msg
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