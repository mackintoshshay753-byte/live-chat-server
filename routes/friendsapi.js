const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data');
const { authenticateToken } = require('../helpers');

// Apply session verification across all friend connections
router.use(authenticateToken);

// Send friend request
router.post("/request", (req, res) => {
  const fromIdNum = req.user.id; // ✅ SECURE: Extracted from token
  const fromUsername = req.user.username; // ✅ SECURE: Extracted from token
  const toIdNum = Number(req.body.toId);

  if (!toIdNum || fromIdNum === toIdNum) 
    return res.status(400).json({ success: false, error: "Invalid ID parameters" });

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
router.get("/requests/me", (req, res) => {
  const userId = req.user.id; // ✅ SECURE: Pulled directly from token
  res.json({ requests: data.friendRequests[userId] || [] });
});

// Accept request
router.post("/accept", (req, res) => {
  const toIdNum = req.user.id; // ✅ SECURE: The receiver is the logged-in user
  const fromIdNum = Number(req.body.fromId);

  if (!fromIdNum) return res.status(400).json({ success: false, error: "Missing sender parameter" });

  // Verify the request exists before adding connection
  const hasRequest = data.friendRequests[toIdNum]?.some(r => r.fromId === fromIdNum);
  if (!hasRequest) return res.json({ success: false, error: "No pending request found" });

  data.friendRequests[toIdNum] = data.friendRequests[toIdNum].filter(r => r.fromId !== fromIdNum);

  if (!data.friends[fromIdNum]) data.friends[fromIdNum] = [];
  if (!data.friends[toIdNum]) data.friends[toIdNum] = [];
  if (!data.friends[fromIdNum].includes(toIdNum)) data.friends[fromIdNum].push(toIdNum);
  if (!data.friends[toIdNum].includes(fromIdNum)) data.friends[toIdNum].push(fromIdNum);

  saveData();
  res.json({ success: true });
});

// Reject request
router.post("/reject", (req, res) => {
  const toIdNum = req.user.id; // ✅ SECURE
  const fromIdNum = Number(req.body.fromId);

  if (data.friendRequests[toIdNum]) {
    data.friendRequests[toIdNum] = data.friendRequests[toIdNum].filter(r => r.fromId !== fromIdNum);
    saveData();
  }
  res.json({ success: true });
});

// Unfriend
router.post("/unfriend", (req, res) => {
  const userIdNum = req.user.id; // ✅ SECURE
  const friendIdNum = Number(req.body.friendId);

  if (data.friends[userIdNum]) data.friends[userIdNum] = data.friends[userIdNum].filter(id => id !== friendIdNum);
  if (data.friends[friendIdNum]) data.friends[friendIdNum] = data.friends[friendIdNum].filter(id => id !== userIdNum);
  saveData();
  res.json({ success: true });
});

// Get my friends list
router.get("/list", (req, res) => {
  const userId = req.user.id; // ✅ SECURE
  const friendIds = data.friends[userId] || [];

  const friends = Object.entries(data.accounts).map(([username, info]) => ({
    id: info.id,
    username
  })).filter(u => friendIds.includes(u.id));

  res.json({ friends });
});

module.exports = router;