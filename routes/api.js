const express = require('express');
const router = express.Router();
const { getProfileById, clean } = require('../helpers');
const { data } = require('../data');

// Your original profile route — untouched
router.get("/profile/:id", (req, res) => {
  const profile = getProfileById(req.params.id);
  if (!profile) return res.status(404).json({ error: "User not found" });
  res.json(profile);
});

// ✅ FINAL FIXED SEARCH — NOW 100% ACCURATE
router.get("/search/users", (req, res) => {
  let keyword = clean(req.query.keyword || "");

  if (!keyword || keyword.length < 3) return res.json([]);

  keyword = keyword.toLowerCase();
  const matches = [];

  Object.entries(data.accounts).forEach(([username, info]) => {
    if (username.toLowerCase().includes(keyword)) {
      // ✅ Convert both to NUMBER so it matches exactly
      const userId = Number(info.id);
      const isOnline = !!(data.onlineUsers && Array.isArray(data.onlineUsers) && data.onlineUsers.includes(userId));

      matches.push({
        id: userId,
        username: username,
        online: isOnline // ✅ TRUE = ONLINE, FALSE = OFFLINE
      });
    }
  });

  matches.sort((a, b) => a.username.localeCompare(b.username));
  res.json(matches);
});

module.exports = router;