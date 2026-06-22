const express = require('express');
const router = express.Router();

const { onlineUsers } = require('../sockets');
const { getProfileById, clean } = require('../helpers');
const { data, saveData } = require('../data');

// ----------------------
// PROFILE
// ----------------------
router.get("/profile/:id", (req, res) => {
  try {
    const profile = getProfileById(req.params.id);

    console.log("PROFILE RETURNED:", profile);

    if (!profile) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      ...profile,
      bio: profile.bio ?? "",
      status: profile.status ?? "", // ✅ add status field
      birthday: profile.birthday ?? null
    });
  } catch (err) {
    console.error("Profile API Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ NEW: Update User Status
router.post("/profile/update-status", (req, res) => {
  try {
    const { userId, status } = req.body;
    if (!userId) return res.json({ success: false, error: "Missing user ID" });

    const profile = Object.values(data.userProfiles).find(p => p.id === Number(userId));
    if (!profile) return res.json({ success: false, error: "Profile not found" });

    // Save, trim, and limit to 254 characters
    profile.status = status.trim().slice(0, 254);
    saveData();

    res.json({ success: true, status: profile.status });
  } catch (err) {
    console.error("Update Status API Error:", err);
    res.json({ success: false, error: "Server error" });
  }
});

router.post("/profile/update-bio", (req, res) => {
  try {
    const { userId, bio } = req.body;
    if (!userId) return res.json({ success: false });

    const profile = Object.values(data.userProfiles).find(p => p.id === Number(userId));
    if (!profile) return res.json({ success: false });

    profile.bio = bio.trim().slice(0, 500);
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