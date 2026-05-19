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

// ==================================================
// ✅ NEW: USER ADS SYSTEM — ADDED TO EXISTING API
// ==================================================

// ✅ GET all ads
router.get("/userads", (req, res) => {
  try {
    if (!data.userAds) data.userAds = [];
    // newest first
    res.json(data.userAds.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (err) {
    console.error("Load ads error:", err);
    res.status(500).json({ error: "Failed to load ads" });
  }
});

// ✅ CREATE new ad
router.post("/userads", (req, res) => {
  try {
    if (!data.userAds) data.userAds = [];

    const { groupId, groupName, adName, image, size, createdBy, createdByName } = req.body;

    if (!groupId || !groupName || !adName || !image || !size || !createdBy) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newAd = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      groupId,
      groupName,
      adName,
      image,
      size, // "728x90" or "160x600"
      createdBy,
      createdByName
    };

    data.userAds.unshift(newAd);
    saveData();

    res.status(201).json(newAd);
  } catch (err) {
    console.error("Create ad error:", err);
    res.status(500).json({ error: "Failed to create ad" });
  }
});

// ✅ GET only ads of a specific size
router.get("/userads/size/:size", (req, res) => {
  try {
    if (!data.userAds) return res.json([]);
    const size = req.params.size;
    const filtered = data.userAds.filter(ad => ad.size === size);
    res.json(filtered);
  } catch (err) {
    console.error("Filter ads error:", err);
    res.status(500).json({ error: "Failed to filter ads" });
  }
});

module.exports = router;