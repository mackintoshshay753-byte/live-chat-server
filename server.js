const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"]
});

function emitOnline() {
  const count = io.of("/").sockets.size; // 🔥 REAL LIVE COUNT
  io.emit("online count", count);
  console.log("ONLINE:", count);
}

io.on("connection", (socket) => {

  console.log("user connected");

  // send updated count immediately
  emitOnline();

  socket.on("join", (username) => {
    socket.username = username;
    socket.emit("system", `Welcome ${username}`);
  });

  socket.on("chat message", (msg) => {
    io.emit("chat message", {
      username: socket.username || "Anonymous",
      msg
    });
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");

    // small delay helps Render + socket cleanup
    setTimeout(() => {
      emitOnline();
    }, 50);
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});