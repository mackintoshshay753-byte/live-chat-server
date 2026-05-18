const express = require('express');
const router = express.Router();

const { onlineUsers } = require('../sockets');
const { getProfileById, clean } = require('../helpers');
const { data, saveData } = require('../data');

// ✅ Add CORS headers
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});

// ==================== PROFILE ====================
router.get("/profile/:id", (req, res) => {
  try {
    const profile = getProfileById(req.params.id);
    if (!profile) return res.status(404).json({ error: "User not found" });
    res.json({ ...profile, bio: profile.bio ?? "" });
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

// ==================== SEARCH USERS ====================
router.get("/search/users", (req, res) => {
  try {
    let keyword = clean(req.query.keyword || "");
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    if (!keyword || keyword.length < 3) return res.json({ results: [], total: 0, page, pages: 0 });
    keyword = keyword.toLowerCase();
    const matches = [];
    Object.entries(data.accounts).forEach(([username, info]) => {
      if (username.toLowerCase().includes(keyword)) {
        const profile = data.userProfiles[username] || {};
        matches.push({
          id: info.id,
          username: username,
          isOnline: onlineUsers.has(username),
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

// ==================== GROUPS ====================

// ✅ Create group — FULLY WORKING
router.post("/groups/create", (req, res) => {
  try {
    const { name, iconUrl, description, createdBy, createdById } = req.body;

    if (!name || name.trim().length < 3) {
      return res.json({ success: false, error: "Name too short" });
    }

    const newGroup = {
      id: data.nextGroupId++,
      name: name.trim(),
      iconUrl: iconUrl || "https://www.roblox.com/asset-thumbnail/image?assetId=62422394&width=420&height=420&format=png",
      description: description.trim(),
      createdBy: createdBy,
      createdById: createdById,
      createdDate: new Date().toISOString()
    };

    data.groups.push(newGroup);
    saveData();

    res.json({ success: true, groupId: newGroup.id });
  } catch (err) {
    console.error("Create group error:", err);
    res.json({ success: false, error: err.message });
  }
});

// ✅ Get single group
router.get("/groups/:id", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const group = data.groups.find(g => g.id === groupId);
    if (!group) return res.status(404).json({ error: "Not found" });
    res.json(group);
  } catch (err) {
    console.error("Get group error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;