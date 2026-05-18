const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const { onlineUsers } = require('../sockets');
const { getProfileById, clean } = require('../helpers');
const { data, saveData } = require('../data');

const uploadDir = path.join(__dirname, '..', 'public', 'group-icons');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `group-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }
});

// ==================== PROFILE ====================
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
router.post("/groups/create", upload.single("icon"), (req, res) => {
  try {
    const { name, description, createdBy, createdById } = req.body;

    if (!name || name.trim().length < 3) {
      return res.json({ success: false, error: "Name too short" });
    }

    if (!description || description.trim().length < 5) {
      return res.json({ success: false, error: "Description too short" });
    }

    const iconUrl = req.file
      ? `/group-icons/${req.file.filename}`
      : `/images/default-group.png`;

    const newGroup = {
      id: data.nextGroupId++,
      name: name.trim(),
      iconUrl,
      createdBy: createdBy || "",
      createdById: Number(createdById || 0),
      description: description.trim(),
      createdDate: new Date().toISOString()
    };

    data.groups.push(newGroup);
    saveData();

    res.json({ success: true, groupId: newGroup.id });
  } catch (err) {
    console.error("Create Group Error:", err);
    res.json({ success: false, error: err.message || "Server error" });
  }
});

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