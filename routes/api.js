const express = require('express');
const router = express.Router();
const { getProfileById, clean } = require('../helpers');
const { data } = require('../data');

// --------------------------
// YOUR ORIGINAL PROFILE ROUTE — 100% UNCHANGED
// --------------------------
router.get("/profile/:id", (req, res) => {
  const profile = getProfileById(req.params.id);
  if (!profile) return res.status(404).json({ error: "User not found" });
  res.json(profile);
});

// --------------------------
// ✅ FINAL FIX: SEARCH ROUTE — READS REAL ONLINE STATUS FROM SOCKET TRACKING
// --------------------------
router.get("/search/users", (req, res) => {
  let keyword = clean(req.query.keyword || "");

  // Same rule: require at least 3 characters
  if (!keyword || keyword.length < 3) {
    return res.json([]);
  }

  keyword = keyword.toLowerCase();
  const matches = [];

  // Search through accounts
  Object.entries(data.accounts).forEach(([username, info]) => {
    if (username.toLowerCase().includes(keyword)) {
      // ✅ CORRECT CHECK: online status is stored in data.onlineUsers from your sockets.js
      const isOnline = !!(data.onlineUsers && data.onlineUsers.includes(Number(info.id)));

      matches.push({
        id: info.id,
        username: username,
        online: isOnline
      });
    }
  });

  // Sort A–Z
  matches.sort((a, b) => a.username.localeCompare(b.username));

  res.json(matches);
});

module.exports = router;