const express = require('express');
const router = express.Router();

const { onlineUsers } = require('../sockets');
const { clean } = require('../helpers');
const { data, saveData } = require('../data');

// ----------------------
// PROFILE
// ----------------------
router.get("/profile/:id", (req, res) => {
  try {
    const profile = data.userProfiles[req.params.id]; // ✅ FIX: no helper

    if (!profile) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      ...profile,
      bio: profile.bio ?? "",
      birthday: profile.birthday ?? null // ✅ FIX: include birthday
    });

  } catch (err) {
    console.error("Profile API Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------------
// UPDATE BIO
// ----------------------
router.post("/profile/update-bio", (req, res) => {
  try {
    const { userId, bio } = req.body;
    if (!userId) return res.json({ success: false });

    const profile = data.userProfiles[userId]; // ✅ FIX: direct lookup

    if (!profile) return res.json({ success: false });

    profile.bio = (bio || "").trim().slice(0, 500);
    saveData();

    res.json({ success: true });

  } catch (err) {
    console.error("Update Bio API Error:", err);
    res.json({ success: false });
  }
});

// ----------------------
// SEARCH USERS
// ----------------------
router.get("/search/users", (req, res) => {
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

        // ❌ FIX: profile lookup was wrong (username key)
        const profile = data.userProfiles[info.id] || {};

        const isOnline = onlineUsers.has(username);

        matches.push({
          id: info.id,
          username,
          isOnline,
          lastOnline: profile.lastOnline || null
        });
      }
    });

    matches.sort((a, b) => a.username.localeCompare(b.username));

    const total = matches.length;
    const pages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const results = matches.slice(start, start + limit);

    res.json({
      results,
      total,
      page,
      pages
    });

  } catch (err) {
    console.error("Search API Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;