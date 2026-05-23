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

if (!fs.existsSync(UPLOAD_FOLDER)) {
  fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_FOLDER),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'group-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  cb(null, allowed.includes(file.mimetype));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ----------------------
// CREATE GROUP (FIXED)
// ----------------------
router.post("/create", upload.single('groupIcon'), (req, res) => {
  try {
    let { name, description, createdBy, createdById } = req.body;

    name = (name || "").trim();
    createdBy = (createdBy || "Unknown").trim();
    createdById = Number(createdById) || 0;

    if (name.length < 3) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.json({ success: false, error: "Name too short" });
    }

    const iconUrl = req.file
      ? "/uploads/groups/" + req.file.filename
      : "/uploads/groups/default-group.png";

    const newGroup = {
      id: data.nextGroupId++,
      name,
      iconUrl,
      createdBy,
      createdById,
      description: (description || "").trim(),
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

    data.groups.push(newGroup);
    saveData();

    res.json({ success: true, groupId: newGroup.id });

  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.json({ success: false, error: err.message });
  }
});

// ----------------------
// SEARCH
// ----------------------
router.get("/search", (req, res) => {
  try {
    const keyword = (req.query.keyword || "").toLowerCase().trim();
    const page = Number(req.query.page) || 1;
    const limit = 12;

    if (keyword.length < 3) {
      return res.json({ results: [], total: 0, page, pages: 0 });
    }

    const matches = data.groups
      .filter(g => (g.name || "").toLowerCase().includes(keyword))
      .sort((a, b) => a.name.localeCompare(b.name));

    const total = matches.length;

    res.json({
      results: matches.slice((page - 1) * limit, page * limit).map(g => ({
        id: g.id,
        name: g.name,
        iconUrl: g.iconUrl,
        memberCount: g.members?.length || 0,
        createdBy: g.createdBy || "Unknown"
      })),
      total,
      page,
      pages: Math.ceil(total / limit)
    });

  } catch (err) {
    res.json({ results: [], total: 0, page: 1, pages: 0 });
  }
});

// ----------------------
// GET GROUP
// ----------------------
router.get("/:id", (req, res) => {
  const groupId = Number(req.params.id);
  const group = data.groups.find(g => g.id === groupId);

  if (!group) return res.status(404).json({ error: "Group not found" });

  res.json(group);
});

// ----------------------
// JOIN GROUP
// ----------------------
router.post("/:id/join", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const userId = Number(req.body.userId);
    const username = req.body.username;

    if (!userId || !username) {
      return res.json({ success: false, error: "Missing user data" });
    }

    const group = data.groups.find(g => g.id === groupId);
    if (!group) return res.json({ success: false, error: "Group not found" });

    if (group.members.some(m => m.userId === userId)) {
      return res.json({ success: false, error: "Already a member" });
    }

    group.members.push({ userId, username, role: "member" });
    saveData();

    res.json({ success: true });

  } catch {
    res.json({ success: false, error: "Server error" });
  }
});

// ----------------------
// UPDATE ICON
// ----------------------
router.post("/:id/update-icon", upload.single('groupIcon'), (req, res) => {
  try {
    const group = data.groups.find(g => g.id === Number(req.params.id));
    if (!group) return res.json({ success: false, error: "Group not found" });
    if (!req.file) return res.json({ success: false, error: "No image uploaded" });

    if (group.iconUrl && !group.iconUrl.includes("default-group.png")) {
      const oldPath = path.join(__dirname, "../public", group.iconUrl);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    group.iconUrl = "/uploads/groups/" + req.file.filename;
    saveData();

    res.json({ success: true, newIconUrl: group.iconUrl });

  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.json({ success: false, error: err.message });
  }
});

// ----------------------
// UPDATE DESCRIPTION
// ----------------------
router.post("/:id/update-description", (req, res) => {
  const group = data.groups.find(g => g.id === Number(req.params.id));
  if (!group) return res.json({ success: false });

  group.description = (req.body.description || "").trim().slice(0, 500);
  saveData();

  res.json({ success: true });
});

// ----------------------
// CHANGE OWNER (FIXED)
// ----------------------
router.post("/:id/change-owner", (req, res) => {
  const group = data.groups.find(g => g.id === Number(req.params.id));
  if (!group) return res.json({ success: false });

  const newOwnerId = Number(req.body.newOwnerId);

  const newOwner = group.members.find(m => m.userId === newOwnerId);
  if (!newOwner) {
    return res.json({ success: false, error: "User not in group" });
  }

  const oldOwnerId = group.createdById;

  group.createdById = newOwnerId;
  group.createdBy = newOwner.username;

  group.members.forEach(m => {
    if (m.userId === newOwnerId) m.role = "owner";
    else if (m.userId === oldOwnerId) m.role = "member";
  });

  saveData();
  res.json({ success: true });
});

// ----------------------
// WALL
// ----------------------
router.get("/:id/wall", (req, res) => {
  const group = data.groups.find(g => g.id === Number(req.params.id));

  if (!group) return res.json({ posts: [] });

  res.json({ posts: group.wallPosts || [] });
});

router.post("/:id/wall/create", (req, res) => {
  try {
    const group = data.groups.find(g => g.id === Number(req.params.id));
    if (!group) return res.json({ success: false });

    const userId = Number(req.body.userId);

    if (!group.members.some(m => m.userId === userId)) {
      return res.json({ success: false, error: "Not a member" });
    }

    const message = (req.body.message || "").trim();
    if (!message) return res.json({ success: false });

    if (!group.wallPosts) group.wallPosts = [];

    group.wallPosts.push({
      id: Date.now(),
      userId,
      username: req.body.username,
      avatar: req.body.avatar || "",
      message: message.slice(0, 450),
      createdAt: new Date().toISOString()
    });

    saveData();
    res.json({ success: true });

  } catch {
    res.json({ success: false });
  }
});

// ----------------------
// DELETE WALL POST
// ----------------------
router.delete("/:groupId/wall/:postId", (req, res) => {
  try {
    const group = data.groups.find(g => g.id === Number(req.params.groupId));
    if (!group) return res.json({ success: false, error: "Group not found" });

    const userId = Number(req.body.userId || req.query.userId);
    const postId = Number(req.params.postId);

    const post = group.wallPosts?.find(p => p.id === postId);
    if (!post) return res.json({ success: false, error: "Post not found" });

    const isOwner = group.createdById === userId;
    const isAuthor = post.userId === userId;

    if (!isOwner && !isAuthor) {
      return res.json({ success: false, error: "No permission" });
    }

    group.wallPosts = group.wallPosts.filter(p => p.id !== postId);
    saveData();

    res.json({ success: true });
  } catch {
    res.json({ success: false, error: "Server error" });
  }
});

// ----------------------
// ADS
// ----------------------
router.post("/:id/ads/create", upload.single('adImage'), (req, res) => {
  try {
    const group = data.groups.find(g => g.id === Number(req.params.id));
    if (!group) return res.json({ success: false });

    const { name, adType } = req.body;
    const createdById = Number(req.body.createdById);

    if (!req.file || !name || name.length < 3) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.json({ success: false });
    }

    if (!["728x90", "160x600"].includes(adType)) {
      fs.unlinkSync(req.file.path);
      return res.json({ success: false });
    }

    if (!data.ads) data.ads = [];

    data.ads.push({
      id: Date.now(),
      groupId: group.id,
      groupName: group.name,
      groupIconUrl: group.iconUrl,
      createdById,
      name,
      adType,
      imageUrl: "/uploads/groups/" + req.file.filename,
      createdDate: new Date().toISOString(),
      active: true
    });

    saveData();
    res.json({ success: true });

  } catch (err) {
    res.json({ success: false });
  }
});

router.get("/ads/random", (req, res) => {
  const type = req.query.type;
  const ads = (data.ads || []).filter(a => a.active && a.adType === type);

  if (!ads.length) return res.json({ ad: null });

  res.json({ ad: ads[Math.floor(Math.random() * ads.length)] });
});

module.exports = router;