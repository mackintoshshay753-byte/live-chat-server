const express = require('express');
const router = express.Router();
const { onlineUsers } = require('../sockets');
const { getProfileById, clean, authenticateToken } = require('../helpers');
const { data, saveData } = require('../data');

// Profile Read-Only Endpoint — Open to authenticated community
router.get("/profile/:id", authenticateToken, (req, res) => {
  try {
    const profile = getProfileById(req.params.id);
    if (!profile) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({
      ...profile,
      bio: profile.bio ?? ""
    });
  } catch (err) {
    console.error("Profile API Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Profile Bio Mutations Endpoint
router.post("/profile/update-bio", authenticateToken, (req, res) => {
  try {
    const userId = req.user.id; // ✅ SECURE: Taken from token verification payload
    const { bio } = req.body;

    const profile = Object.values(data.userProfiles).find(p => p.id === userId);
    if (!profile) return res.status(404).json({ success: false, error: "Profile missing" });

    // Sanitize bio content to avoid script injections
    profile.bio = clean(bio).slice(0, 500);
    saveData();

    res.json({ success: true });
  } catch (err) {
    console.error("Update Bio API Error:", err);
    res.status(500).json({ success: false });
  }
});

// Search functionality
router.get("/search/users", authenticateToken, (req, res) => {
  try {
    let keyword = clean(req.query.keyword || "");
    const page = parseInt(req.query.page) || 1;
    const limit = 12;

    if (!keyword || keyword.length < 3) {
      return res.json({ results: [], total: 0, page, pages: 0 });
    }

    keyword = keyword.toLowerCase();
    const matches = [];

    Object.entries(data.accounts).forEach(([username, info]) => {
      if (username.toLowerCase().includes(keyword)) {
        const profile = data.userProfiles[username] || {};
        const isOnline = onlineUsers.has(username);

        matches.push({
          id: info.id,
          username: username,
          isOnline: isOnline,
          lastOnline: profile.lastOnline || null
        });
      }
    });

    matches.sort((a, b) => a.username.localeCompare(b.username));

    const total = matches.length;
    const pages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const results = matches.slice(start, start + limit);

    res.json({ results, total, page, pages });
  } catch (err) {
    console.error("Search API Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;