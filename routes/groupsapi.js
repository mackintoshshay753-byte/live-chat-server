const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { data, saveData } = require('../data');

// ----------------------
// IMAGE UPLOAD CONFIG
// ----------------------
const UPLOAD_FOLDER = path.join(__dirname, '../public/uploads/groups');

// Ensure upload folder exists
if (!fs.existsSync(UPLOAD_FOLDER)) {
  fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_FOLDER),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'group-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// ----------------------
// CREATE GROUP
// ----------------------
router.post("/create", upload.single('groupIcon'), (req, res) => {
  try {
    let { name, description, createdBy, createdById } = req.body;

    // Sanitize inputs
    name = (name || "").trim();
    description = (description || "").trim();
    createdBy = (createdBy || "Unknown").trim();
    createdById = Number(createdById) || 0;

    // Validation
    if (name.length < 3) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.json({ success: false, error: "Group name must be at least 3 characters long" });
    }

    // Set icon URL
    const iconUrl = req.file
      ? "/uploads/groups/" + req.file.filename
      : "/uploads/groups/default-group.png";

    // Create new group object
    const newGroup = {
      id: data.nextGroupId++,
      name,
      iconUrl,
      createdBy,
      createdById,
      description: description.slice(0, 500), // Limit description length
      createdDate: new Date().toISOString(),
      members: [
        {
          userId: createdById,
          username: createdBy,
          role: "owner"
        }
      ],
      wallPosts: []
    };

    // Save
    data.groups.push(newGroup);
    saveData();

    res.json({ success: true, groupId: newGroup.id });

  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.json({ success: false, error: err.message || "Server error while creating group" });
  }
});

// ----------------------
// SEARCH GROUPS
// ----------------------
router.get("/search", (req, res) => {
  try {
    const keyword = (req.query.keyword || "").toLowerCase().trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = 12;

    if (keyword.length < 3) {
      return res.json({ results: [], total: 0, page, pages: 0 });
    }

    // Find matching groups
    const matches = data.groups
      .filter(g => (g.name || "").toLowerCase().includes(keyword))
      .sort((a, b) => a.name.localeCompare(b.name));

    const total = matches.length;
    const totalPages = Math.ceil(total / limit);

    res.json({
      results: matches.slice((page - 1) * limit, page * limit).map(g => ({
        id: g.id,
        name: g.name,
        iconUrl: g.iconUrl,
        memberCount: Array.isArray(g.members) ? g.members.length : 0,
        createdBy: g.createdBy || "Unknown"
      })),
      total,
      page,
      pages: totalPages
    });

  } catch (err) {
    res.json({ results: [], total: 0, page: 1, pages: 0, error: err.message });
  }
});

// ----------------------
// GET SINGLE GROUP
// ----------------------
router.get("/:id", (req, res) => {
  const groupId = Number(req.params.id);
  if (isNaN(groupId)) {
    return res.status(400).json({ error: "Invalid group ID" });
  }

  const group = data.groups.find(g => g.id === groupId);
  if (!group) {
    return res.status(404).json({ error: "Group not found" });
  }

  res.json(group);
});

// ----------------------
// JOIN GROUP
// ----------------------
router.post("/:id/join", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const userId = Number(req.body.userId);
    const { username } = req.body;

    if (isNaN(groupId) || isNaN(userId) || !username?.trim()) {
      return res.json({ success: false, error: "Missing or invalid user data" });
    }

    const group = data.groups.find(g => g.id === groupId);
    if (!group) {
      return res.json({ success: false, error: "Group not found" });
    }

    if (!Array.isArray(group.members)) group.members = [];

    if (group.members.some(m => m.userId === userId)) {
      return res.json({ success: false, error: "You are already a member of this group" });
    }

    group.members.push({ userId, username: username.trim(), role: "member" });
    saveData();

    res.json({ success: true });

  } catch (err) {
    res.json({ success: false, error: "Server error while joining group" });
  }
});

// ----------------------
// UPDATE GROUP ICON
// ----------------------
router.post("/:id/update-icon", upload.single('groupIcon'), (req, res) => {
  try {
    const groupId = Number(req.params.id);
    if (isNaN(groupId)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.json({ success: false, error: "Invalid group ID" });
    }

    const group = data.groups.find(g => g.id === groupId);
    if (!group) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.json({ success: false, error: "Group not found" });
    }

    if (!req.file) {
      return res.json({ success: false, error: "No image uploaded" });
    }

    // Delete old icon if it's not default
    if (group.iconUrl && !group.iconUrl.includes("default-group.png")) {
      const oldPath = path.join(__dirname, "../public", group.iconUrl);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    // Update to new icon
    group.iconUrl = "/uploads/groups/" + req.file.filename;
    saveData();

    res.json({ success: true, newIconUrl: group.iconUrl });

  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.json({ success: false, error: err.message || "Failed to update icon" });
  }
});

// ----------------------
// UPDATE DESCRIPTION
// ----------------------
router.post("/:id/update-description", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    if (isNaN(groupId)) return res.json({ success: false, error: "Invalid group ID" });

    const group = data.groups.find(g => g.id === groupId);
    if (!group) return res.json({ success: false, error: "Group not found" });

    group.description = (req.body.description || "").trim().slice(0, 500);
    saveData();

    res.json({ success: true });

  } catch (err) {
    res.json({ success: false, error: "Failed to update description" });
  }
});

// ----------------------
// CHANGE OWNER
// ----------------------
router.post("/:id/change-owner", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const newOwnerId = Number(req.body.newOwnerId);

    if (isNaN(groupId) || isNaN(newOwnerId)) {
      return res.json({ success: false, error: "Invalid ID" });
    }

    const group = data.groups.find(g => g.id === groupId);
    if (!group) return res.json({ success: false, error: "Group not found" });

    if (!Array.isArray(group.members)) return res.json({ success: false, error: "Member list missing" });

    const newOwner = group.members.find(m => m.userId === newOwnerId);
    if (!newOwner) return res.json({ success: false, error: "User is not in this group" });

    const oldOwnerId = group.createdById;

    // Update owner info
    group.createdById = newOwnerId;
    group.createdBy = newOwner.username;

    // Update roles
    group.members.forEach(m => {
      if (m.userId === newOwnerId) m.role = "owner";
      else if (m.userId === oldOwnerId) m.role = "member";
    });

    saveData();
    res.json({ success: true });

  } catch (err) {
    res.json({ success: false, error: "Failed to change owner" });
  }
});

// ----------------------
// WALL - GET POSTS
// ----------------------
router.get("/:id/wall", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    if (isNaN(groupId)) return res.json({ posts: [] });

    const group = data.groups.find(g => g.id === groupId);
    if (!group) return res.json({ posts: [] });

    res.json({ posts: Array.isArray(group.wallPosts) ? group.wallPosts : [] });

  } catch (err) {
    res.json({ posts: [], error: "Failed to load wall posts" });
  }
});

// ----------------------
// WALL - CREATE POST
// ----------------------
router.post("/:id/wall/create", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const userId = Number(req.body.userId);
    const { username, avatar, message } = req.body;

    if (isNaN(groupId) || isNaN(userId) || !username?.trim() || !message?.trim()) {
      return res.json({ success: false, error: "Missing required fields" });
    }

    const group = data.groups.find(g => g.id === groupId);
    if (!group) return res.json({ success: false, error: "Group not found" });

    if (!Array.isArray(group.members)) group.members = [];
    if (!Array.isArray(group.wallPosts)) group.wallPosts = [];

    // Check membership
    const isMember = group.members.some(m => m.userId === userId);
    if (!isMember) return res.json({ success: false, error: "You must be a member to post" });

    // Create post
    group.wallPosts.push({
      id: Date.now(),
      userId,
      username: username.trim(),
      avatar: avatar || "",
      message: message.trim().slice(0, 450),
      createdAt: new Date().toISOString()
    });

    saveData();
    res.json({ success: true });

  } catch (err) {
    res.json({ success: false, error: "Failed to create post" });
  }
});

// ----------------------
// WALL - DELETE POST
// ----------------------
router.delete("/:groupId/wall/:postId", (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const postId = Number(req.params.postId);
    const userId = Number(req.body.userId || req.query.userId);

    if (isNaN(groupId) || isNaN(postId) || isNaN(userId)) {
      return res.json({ success: false, error: "Invalid ID" });
    }

    const group = data.groups.find(g => g.id === groupId);
    if (!group) return res.json({ success: false, error: "Group not found" });
    if (!Array.isArray(group.wallPosts)) return res.json({ success: false, error: "Post not found" });

    const postIndex = group.wallPosts.findIndex(p => p.id === postId);
    if (postIndex === -1) return res.json({ success: false, error: "Post not found" });

    const post = group.wallPosts[postIndex];
    const isOwner = group.createdById === userId;
    const isAuthor = post.userId === userId;

    if (!isOwner && !isAuthor) return res.json({ success: false, error: "No permission to delete" });

    // Remove post
    group.wallPosts.splice(postIndex, 1);
    saveData();

    res.json({ success: true });

  } catch (err) {
    res.json({ success: false, error: "Failed to delete post" });
  }
});

// ----------------------
// ADS - CREATE
// ----------------------
router.post("/:id/ads/create", upload.single('adImage'), (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const { name, adType } = req.body;
    const createdById = Number(req.body.createdById);

    // Validation
    if (isNaN(groupId) || !name?.trim() || name.trim().length < 3 || !adType || isNaN(createdById)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.json({ success: false, error: "Missing or invalid fields" });
    }

    if (!["728x90", "160x600"].includes(adType)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.json({ success: false, error: "Invalid ad size" });
    }

    if (!req.file) {
      return res.json({ success: false, error: "Ad image required" });
    }

    const group = data.groups.find(g => g.id === groupId);
    if (!group) {
      fs.unlinkSync(req.file.path);
      return res.json({ success: false, error: "Group not found" });
    }

    // Ensure ads array exists
    if (!Array.isArray(data.ads)) data.ads = [];

    // Create ad
    data.ads.push({
      id: Date.now(),
      groupId: group.id,
      groupName: group.name,
      groupIconUrl: group.iconUrl,
      createdById,
      name: name.trim(),
      adType,
      imageUrl: "/uploads/groups/" + req.file.filename,
      createdDate: new Date().toISOString(),
      active: true
    });

    saveData();
    res.json({ success: true });

  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.json({ success: false, error: "Failed to create ad" });
  }
});

// ----------------------
// ADS - GET RANDOM
// ----------------------
router.get("/ads/random", (req, res) => {
  try {
    const type = req.query.type;
    if (!type) return res.json({ ad: null });

    const ads = Array.isArray(data.ads)
      ? data.ads.filter(a => a.active && a.adType === type)
      : [];

    if (ads.length === 0) return res.json({ ad: null });

    const randomAd = ads[Math.floor(Math.random() * ads.length)];
    res.json({ ad: randomAd });

  } catch (err) {
    res.json({ ad: null, error: "Failed to load ad" });
  }
});

module.exports = router;