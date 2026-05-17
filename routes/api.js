const express = require('express');
const router = express.Router();
const { getProfileById, clean } = require('../helpers');
const { data } = require('../data'); // ← we need this to search users

// Your existing profile route — leave it exactly as is
router.get("/profile/:id", (req, res) => {
  const profile = getProfileById(req.params.id);
  if (!profile) return res.status(404).json({ error: "User not found" });
  res.json(profile);
});

// ✅ ADD THIS NEW SEARCH ROUTE — this is what your page calls
router.get("/search/users", (req, res) => {
  let keyword = clean(req.query.keyword || "");
  
  // Same rules as everywhere else: require at least 3 characters
  if (!keyword || keyword.length < 3) {
    return res.json([]);
  }

  keyword = keyword.toLowerCase();
  const matches = [];

  // Search through all registered accounts
  Object.entries(data.accounts).forEach(([username, info]) => {
    if (username.toLowerCase().includes(keyword)) {
      matches.push({
        id: info.id,
        username: username
      });
    }
  });

  // Sort results A–Z
  matches.sort((a, b) => a.username.localeCompare(b.username));

  res.json(matches);
});

module.exports = router;