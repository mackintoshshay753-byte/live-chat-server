const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data');

const MAX_FRIENDS = 200;

function parseId(value) {
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

function ensureUserStores(userId) {
  if (!data.friends[userId]) data.friends[userId] = [];
  if (!data.friendRequests[userId]) data.friendRequests[userId] = [];
}

function isAtFriendLimit(userId) {
  ensureUserStores(userId);
  return data.friends[userId].length >= MAX_FRIENDS;
}

function removeFriendRequest(fromId, toId) {
  if (!data.friendRequests[toId]) return;
  data.friendRequests[toId] = data.friendRequests[toId].filter(r => r.fromId !== fromId);
}

function areFriends(userA, userB) {
  ensureUserStores(userA);
  ensureUserStores(userB);
  return data.friends[userA].includes(userB);
}

// Send friend request
router.post("/request", (req, res) => {
  const fromId = parseId(req.body.fromId);
  const toId = parseId(req.body.toId);
  const fromUsername = String(req.body.fromUsername || '').trim();

  if (fromId === null || toId === null || fromId === toId || !fromUsername) {
    return res.status(400).json({ success: false, error: "Invalid request" });
  }

  ensureUserStores(fromId);
  ensureUserStores(toId);

  if (areFriends(fromId, toId)) {
    return res.status(409).json({ success: false, error: "Already friends" });
  }

  if (data.friendRequests[toId].some(r => r.fromId === fromId)) {
    return res.status(409).json({ success: false, error: "Already requested" });
  }

  if (isAtFriendLimit(fromId)) {
    return res.status(400).json({ success: false, error: "You have reached the 200 friend limit" });
  }

  if (isAtFriendLimit(toId)) {
    return res.status(400).json({ success: false, error: "That user has reached the 200 friend limit" });
  }

  data.friendRequests[toId].push({
    fromId,
    fromUsername,
    timestamp: new Date().toISOString()
  });

  saveData();
  res.json({ success: true });
});

// Get incoming requests
router.get("/requests/:userId", (req, res) => {
  const userId = parseId(req.params.userId);
  if (userId === null) return res.status(400).json({ requests: [] });

  ensureUserStores(userId);
  res.json({ requests: data.friendRequests[userId] });
});

// Accept request
router.post("/accept", (req, res) => {
  const fromId = parseId(req.body.fromId);
  const toId = parseId(req.body.toId);

  if (fromId === null || toId === null || fromId === toId) {
    return res.status(400).json({ success: false, error: "Invalid request" });
  }

  ensureUserStores(fromId);
  ensureUserStores(toId);

  const requestExists = data.friendRequests[toId].some(r => r.fromId === fromId);
  if (!requestExists) {
    return res.status(404).json({ success: false, error: "Friend request not found" });
  }

  if (areFriends(fromId, toId)) {
    removeFriendRequest(fromId, toId);
    saveData();
    return res.json({ success: true });
  }

  if (isAtFriendLimit(fromId)) {
    return res.status(400).json({ success: false, error: "Sender has reached the 200 friend limit" });
  }

  if (isAtFriendLimit(toId)) {
    return res.status(400).json({ success: false, error: "Receiver has reached the 200 friend limit" });
  }

  removeFriendRequest(fromId, toId);

  if (!data.friends[fromId].includes(toId)) data.friends[fromId].push(toId);
  if (!data.friends[toId].includes(fromId)) data.friends[toId].push(fromId);

  saveData();
  res.json({ success: true });
});

// Reject request
router.post("/reject", (req, res) => {
  const fromId = parseId(req.body.fromId);
  const toId = parseId(req.body.toId);

  if (fromId === null || toId === null) {
    return res.status(400).json({ success: false, error: "Invalid request" });
  }

  ensureUserStores(toId);
  const before = data.friendRequests[toId].length;
  removeFriendRequest(fromId, toId);

  if (data.friendRequests[toId].length !== before) {
    saveData();
  }

  res.json({ success: true });
});

// Unfriend
router.post("/unfriend", (req, res) => {
  const userId = parseId(req.body.userId);
  const friendId = parseId(req.body.friendId);

  if (userId === null || friendId === null || userId === friendId) {
    return res.status(400).json({ success: false, error: "Invalid request" });
  }

  ensureUserStores(userId);
  ensureUserStores(friendId);

  data.friends[userId] = data.friends[userId].filter(id => id !== friendId);
  data.friends[friendId] = data.friends[friendId].filter(id => id !== userId);

  saveData();
  res.json({ success: true });
});

// Get friend list
router.get("/list/:userId", (req, res) => {
  const userId = parseId(req.params.userId);
  if (userId === null) return res.status(400).json({ friends: [] });

  ensureUserStores(userId);
  const friendIds = data.friends[userId];

  const friends = Object.entries(data.accounts)
    .map(([username, info]) => ({ id: info.id, username }))
    .filter(u => friendIds.includes(u.id));

  res.json({ friends });
});

module.exports = router;