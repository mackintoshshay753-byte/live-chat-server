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

  // ✅ Already checks self, but made it clearer + added error message
  if (fromId === null || toId === null || fromId === toId || !fromUsername) {
    return res.status(400).json({ 
      success: false, 
      error: fromId === toId ? "You cannot send a friend request to yourself" : "Invalid request" 
    });
  }

  ensureUserStores(fromId);
  ensureUserStores(toId);

  if (areFriends(fromId, toId)) {
    return res.status(409).json({ success: false, error: "Already friends" });
  }

  if (data.friendRequests[toId].some(r => r.fromId === fromId)) {
    return res.status(409).json({ success: false, error: "Request already sent" });
  }

  if (isAtFriendLimit(fromId)) {
    return res.status(400).json({ success: false, error: "You have reached the maximum number of friends" });
  }

  if (isAtFriendLimit(toId)) {
    return res.status(400).json({ success: false, error: "This user has reached the maximum number of friends" });
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

  const requests = data.friendRequests[userId].map(req => {
    const account = Object.entries(data.accounts).find(
      ([, info]) => info.id === req.fromId
    );

    return {
      ...req,
      fromGender: account ? account[1].gender || "Other" : "Other"
    };
  });

  res.json({ requests });
});

// Accept request
router.post("/accept", (req, res) => {
  const fromId = parseId(req.body.fromId);
  const toId = parseId(req.body.toId);

  // ✅ Block accepting from yourself
  if (fromId === null || toId === null || fromId === toId) {
    return res.status(400).json({ 
      success: false, 
      error: fromId === toId ? "You cannot accept a request from yourself" : "Invalid request" 
    });
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
    return res.status(400).json({ success: false, error: "Sender has reached maximum friends" });
  }

  if (isAtFriendLimit(toId)) {
    return res.status(400).json({ success: false, error: "You have reached maximum friends" });
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

  // ✅ Block rejecting self
  if (fromId === null || toId === null || fromId === toId) {
    return res.status(400).json({ 
      success: false, 
      error: fromId === toId ? "Invalid request" : "Invalid request" 
    });
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

  // ✅ Block unfriending yourself
  if (userId === null || friendId === null || userId === friendId) {
    return res.status(400).json({ 
      success: false, 
      error: userId === friendId ? "You cannot unfriend yourself" : "Invalid request" 
    });
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
    .map(([username, info]) => ({
      id: info.id,
      username,
      gender: info.gender || "Other" // ✅ ADD THIS
    }))
    .filter(u => friendIds.includes(u.id));

  res.json({ friends });
});

router.get("/outgoing/:userId", (req, res) => {
  const userId = parseId(req.params.userId);
  if (userId === null) return res.status(400).json({ outgoing: [] });

  ensureUserStores(userId);

  const outgoing = [];
  for (const receiverId in data.friendRequests) {
    const requests = data.friendRequests[receiverId];
    for (const req of requests) {
      if (req.fromId === userId) {
        outgoing.push({ toId: Number(receiverId), timestamp: req.timestamp });
      }
    }
  }

  res.json({ outgoing });
});

module.exports = router;