const express = require('express');
const router = express.Router();
const { getProfileById, clean } = require('../helpers');
const { data } = require('../data');

// Your original profile route — 100% untouched
router.get("/profile/:id", (req, res) => {
  const profile = getProfileById(req.params.id);
  if (!profile) return res.status(404).json({ error: "User not found" });
  res.json(profile);
});

// ✅ FIXED SEARCH ROUTE — detects online status correctly with YOUR data structure
router.get("/search/users", (req, res) => {
  let keyword = clean(req.query.keyword || "");

  if (!keyword || keyword.length < 3) {
    return res.json([]);
  }

  keyword = keyword.toLowerCase();
  const matches = [];

  // Search through accounts
  Object.entries(data.accounts).forEach(([username, info]) => {
    if (username.toLowerCase().includes(keyword)) {
      // ✅ CORRECT CHECK: if user has an active session → online
      const isOnline = !!(data.sessions && data.sessions[info.id]);

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