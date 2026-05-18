const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data');

// Send friend request
router.post("/request", (req, res) => {
  const { fromId, fromUsername, toId } = req.body;
  if (!fromId || !toId || fromId === toId) return res.json({ success: false, error: "Invalid" });

  if (!data.friendRequests[toId]) data.friendRequests[toId] = [];

  const alreadyRequested = data.friendRequests[toId].some(r => r.fromId === fromId);
  if (alreadyRequested) return res.json({ success: false, error: "Already requested" });

  const alreadyFriends = data.friends[fromId]?.includes(toId);
  if (alreadyFriends) return res.json({ success: false, error: "Already friends" });

  data.friendRequests[toId].push({
    fromId,
    fromUsername,
    timestamp: new Date().toISOString()
  });
  saveData();
  res.json({ success: true });
});

// Get my incoming requests
router.get("/requests/:userId", (req, res) => {
  const userId = req.params.userId; // ✅ NO Number() — keep as string
  res.json({ requests: data.friendRequests[userId] || [] });
});

// Accept request
router.post("/accept", (req, res) => {
  const { fromId, toId } = req.body;
  if (!fromId || !toId) return res.json({ success: false });

  if (data.friendRequests[toId]) {
    data.friendRequests[toId] = data.friendRequests[toId].filter(r => r.fromId !== fromId);
  }

  if (!data.friends[fromId]) data.friends[fromId] = [];
  if (!data.friends[toId]) data.friends[toId] = [];
  if (!data.friends[fromId].includes(toId)) data.friends[fromId].push(toId);
  if (!data.friends[toId].includes(fromId)) data.friends[toId].push(fromId);

  saveData();
  res.json({ success: true });
});

// Reject request
router.post("/reject", (req, res) => {
  const { fromId, toId } = req.body;
  if (data.friendRequests[toId]) {
    data.friendRequests[toId] = data.friendRequests[toId].filter(r => r.fromId !== fromId);
    saveData();
  }
  res.json({ success: true });
});

// Unfriend
router.post("/unfriend", (req, res) => {
  const { userId, friendId } = req.body;
  if (data.friends[userId]) data.friends[userId] = data.friends[userId].filter(id => id !== friendId);
  if (data.friends[friendId]) data.friends[friendId] = data.friends[friendId].filter(id => id !== userId);
  saveData();
  res.json({ success: true });
});

// Get my friends list
router.get("/list/:userId", (req, res) => {
  const userId = req.params.userId; // ✅ NO Number()
  const friendIds = data.friends[userId] || [];

  const friends = Object.entries(data.accounts).map(([username, info]) => ({
    id: String(info.id), // ✅ Save as string to match
    username
  })).filter(u => friendIds.includes(u.id));

  res.json({ friends });
});

module.exports = router;