const express = require('express');
const router = express.Router();
const { getProfileById, clean } = require('../helpers');
const { data, isUserOnline } = require('../data');

// Profile route
router.get("/profile/:id", (req, res) => {
  const profile = getProfileById(req.params.id);
  if (!profile) return res.status(404).json({ error: "User not found" });
  res.json(profile);
});

// Search Users with Online Status
router.get("/search/users", (req, res) => {
  let keyword = clean(req.query.keyword || "");

  if (!keyword || keyword.length < 3) {
    return res.json({ 
      results: [], 
      total: 0, 
      pages: 0 
    });
  }

  keyword = keyword.toLowerCase();
  const matches = [];

  Object.entries(data.accounts).forEach(([username, info]) => {
    if (username.toLowerCase().includes(keyword)) {
      matches.push({
        id: info.id,
        username: username,
        online: isUserOnline(username)
      });
    }
  });

  matches.sort((a, b) => a.username.localeCompare(b.username));

  // Pagination
  const page = parseInt(req.query.page) || 1;
  const RESULTS_PER_PAGE = 12;
  const start = (page - 1) * RESULTS_PER_PAGE;
  const paginatedResults = matches.slice(start, start + RESULTS_PER_PAGE);

  res.json({
    results: paginatedResults,
    total: matches.length,
    pages: Math.ceil(matches.length / RESULTS_PER_PAGE)
  });
});

module.exports = router;