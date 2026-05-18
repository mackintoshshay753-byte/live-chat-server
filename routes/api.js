const express = require('express');
const router = express.Router();

const { onlineUsers } = require('../sockets');
const { getProfileById, clean } = require('../helpers');
const { data, saveData } = require('../data');

// ==================== PROFILE ====================
router.get("/profile/:id", (req, res) => {
  try {
    const profile = getProfileById(req.params.id);
    if (!profile) {
      return res.status(404).json({ error: "User not found" });
    }
    // ✅ THIS WAS MISSING — we explicitly send bio from data
    res.json({
      ...profile,
      bio: profile.bio ?? "" // if no bio yet, send empty string
    });
  } catch (err) {
    console.error("Profile API Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ FIXED SAVE BIO — now saves correctly to userProfiles
router.post("/profile/update-bio", (req, res) => {
  try {
    const { userId, bio } = req.body;
    if (!userId) return res.json({ success: false });

    // ✅ Find by ID and save bio properly
    const profile = Object.values(data.userProfiles).find(p => p.id === Number(userId));
    if (!profile) return res.json({ success: false });

    // Save and clean
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

// ==================== GROUPS ====================

// ✅ Create new group
router.post("/groups/create", (req, res) => {
  try {
    const { name, iconUrl, description, createdBy, createdById } = req.body;
    if (!name || name.trim().length < 3) return res.json({ success: false, error: "Name too short" });

    const newGroup = {
      id: data.nextGroupId++,
      name: name.trim(),
      iconUrl: iconUrl || "/images/default-group.png",
      createdBy: createdBy,
      createdById: createdById,
      description: description.trim(),
      createdDate: new Date().toISOString()
    };

    data.groups.push(newGroup);
    saveData();
    res.json({ success: true, groupId: newGroup.id });
  } catch (err) {
    res.json({ success: false, error: "Server error" });
  }
});

// ✅ Get single group by ID
router.get("/groups/:id", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const group = data.groups.find(g => g.id === groupId);
    
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.json(group);
  } catch (err) {
    console.error("Get Group Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;