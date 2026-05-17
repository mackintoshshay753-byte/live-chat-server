const express = require('express');
const router = express.Router();
const { getProfileById, clean } = require('../helpers');
const { data } = require('../data');

// Profile route — unchanged
router.get("/profile/:id", (req, res) => {
  const profile = getProfileById(req.params.id);
  if (!profile) return res.status(404).json({ error: "User not found" });
  res.json(profile);
});

// Search route — simplified, no online status
router.get("/search/users", (req, res) => {
  let keyword = clean(req.query.keyword || "");

  if (!keyword || keyword.length < 3) return res.json([]);

  keyword = keyword.toLowerCase();
  const matches = [];

  Object.entries(data.accounts).forEach(([username, info]) => {
    if (username.toLowerCase().includes(keyword)) {
      matches.push({
        id: info.id,
        username: username
      });
    }
  });

  matches.sort((a, b) => a.username.localeCompare(b.username));
  res.json(matches);
});

module.exports = router;