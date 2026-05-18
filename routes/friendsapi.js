const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data');

// ✅ Track online users
const onlineUsers = new Set();

// ✅ Called from server.js when user connects/disconnects
function userConnect(userId) {
  const id = Number(userId);
  if (id) onlineUsers.add(id);
}
function userDisconnect(userId) {
  const id = Number(userId);
  if (id) onlineUsers.delete(id);
}

// --------------------------
// ✅ FRIEND SYSTEM API ROUTES
// --------------------------

// Send friend request
router.post("/request", (req, res) => {
  const { fromId, fromUsername, toId } = req.body;
  const fromIdNum = Number(fromId);
  const toIdNum = Number(toId);

  if (!fromIdNum || !toIdNum || fromIdNum === toIdNum) 
    return res.json({ success: false, error: "Invalid" });

  if (!data.friendRequests[toIdNum]) data.friendRequests[toIdNum] = [];

  const alreadyRequested = data.friendRequests[toIdNum].some(r => r.fromId === fromIdNum);
  if (alreadyRequested) return res.json({ success: false, error: "Already requested" });

  const alreadyFriends = data.friends[fromIdNum]?.includes(toIdNum);
  if (alreadyFriends) return res.json({ success: false, error: "Already friends" });

  data.friendRequests[toIdNum].push({
    fromId: fromIdNum,
    fromUsername,
    timestamp: new Date().toISOString()
  });
  saveData();
  res.json({ success: true });
});

// Get my incoming requests
router.get("/requests/:userId", (req, res) => {
  const userId = Number(req.params.userId);
  res.json({ requests: data.friendRequests[userId] || [] });
});

// Accept request
router.post("/accept", (req, res) => {
  const { fromId, toId } = req.body;
  const fromIdNum = Number(fromId);
  const toIdNum = Number(toId);

  if (!fromIdNum || !toIdNum) return res.json({ success: false });

  if (data.friendRequests[toIdNum]) {
    data.friendRequests[toIdNum] = data.friendRequests[toIdNum].filter(r => r.fromId !== fromIdNum);
  }

  if (!data.friends[fromIdNum]) data.friends[fromIdNum] = [];
  if (!data.friends[toIdNum]) data.friends[toIdNum] = [];
  if (!data.friends[fromIdNum].includes(toIdNum)) data.friends[fromIdNum].push(toIdNum);
  if (!data.friends[toIdNum].includes(fromIdNum)) data.friends[toIdNum].push(fromIdNum);

  saveData();
  res.json({ success: true });
});

// Reject request
router.post("/reject", (req, res) => {
  const { fromId, toId } = req.body;
  const fromIdNum = Number(fromId);
  const toIdNum = Number(toId);

  if (data.friendRequests[toIdNum]) {
    data.friendRequests[toIdNum] = data.friendRequests[toIdNum].filter(r => r.fromId !== fromIdNum);
    saveData();
  }
  res.json({ success: true });
});

// Unfriend
router.post("/unfriend", (req, res) => {
  const { userId, friendId } = req.body;
  const userIdNum = Number(userId);
  const friendIdNum = Number(friendId);

  if (data.friends[userIdNum]) data.friends[userIdNum] = data.friends[userIdNum].filter(id => id !== friendIdNum);
  if (data.friends[friendIdNum]) data.friends[friendIdNum] = data.friends[friendIdNum].filter(id => id !== userIdNum);
  saveData();
  res.json({ success: true });
});

// ✅ Get friends list + ONLINE STATUS — PERFECT
router.get("/list/:userId", (req, res) => {
  const userId = Number(req.params.userId);
  const friendIds = data.friends[userId] || [];

  const friends = Object.entries(data.accounts).map(([username, info]) => ({
    id: info.id,
    username,
    isOnline: onlineUsers.has(Number(info.id)) // ✅ TRUE = ONLINE, FALSE = OFFLINE
  })).filter(u => friendIds.includes(u.id));

  res.json({ friends });
});

module.exports = { router, userConnect, userDisconnect };