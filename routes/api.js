const express = require('express');
const router = express.Router();
const { getProfileById, clean } = require('../helpers');
const { data } = require('../data');

// Shared online users set
let onlineUsers = new Set();
module.exports.onlineUsers = onlineUsers;

// Profile route — unchanged
router.get("/profile/:id", (req, res) => {
  const profile = getProfileById(req.params.id);
  if (!profile) return res.status(404).json({ error: "User not found" });
  res.json(profile);
});

// Search route — NOW with pagination, 12 per page
router.get("/search/users", (req, res) => {
  let keyword = clean(req.query.keyword || "");
  const page = parseInt(req.query.page) || 1;
  const limit = 12; // ✅ 12 results per page

  if (!keyword || keyword.length < 3) return res.json({ results: [], total: 0, page, pages: 0 });

  keyword = keyword.toLowerCase();
  const matches = [];

  Object.entries(data.accounts).forEach(([username, info]) => {
    if (username.toLowerCase().includes(keyword)) {
      matches.push({
        id: info.id,
        username,
        online: onlineUsers.has(username)
      });
    }
  });

  matches.sort((a, b) => a.username.localeCompare(b.username));

  // Pagination logic
  const total = matches.length;
  const pages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const end = start + limit;
  const results = matches.slice(start, end);

  res.json({ results, total, page, pages });
});

module.exports = router;