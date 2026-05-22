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
  destination: function (req, file, cb) {
    cb(null, UPLOAD_FOLDER);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'group-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, GIF, WEBP files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// ----------------------
// GROUPS
// ----------------------

// ✅ Create group — owner is added automatically as "owner" role
router.post("/create", upload.single('groupIcon'), (req, res) => {
  try {
    const { name, description, createdBy, createdById } = req.body;
    
    if (!name || name.trim().length < 3) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.json({ success: false, error: "Name too short" });
    }

    let iconUrl = "/uploads/groups/default-group.png";
    if (req.file) {
      iconUrl = "/uploads/groups/" + req.file.filename;
    }

    const newGroup = {
      id: data.nextGroupId++,
      name: name.trim(),
      iconUrl: iconUrl,
      createdBy: createdBy,
      createdById: createdById,
      description: description ? description.trim() : "",
      createdDate: new Date().toISOString(),
      members: [
        { userId: Number(createdById), username: createdBy, role: "owner" } // creator = owner
      ]
    };

    data.groups.push(newGroup);
    saveData();
    res.json({ success: true, groupId: newGroup.id });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error("Create Group Error:", err);
    res.json({ success: false, error: err.message || "Server error" });
  }
});

/** ✅ SEARCH ENDPOINT — NOW 100% WORKING */
router.get("/search", (req, res) => {
  try {
    const keyword = (req.query.keyword || "").trim().toLowerCase();
    const page = parseInt(req.query.page) || 1;
    const limit = 12;

    // ✅ Return empty array instead of error
    if (keyword.length < 3) {
      return res.json({ results: [], total: 0, page, pages: 0 });
    }

    // ✅ Filter groups by name
    const matches = data.groups.filter(group => 
      group.name.toLowerCase().includes(keyword)
    );

    // ✅ Sort alphabetically
    matches.sort((a, b) => a.name.localeCompare(b.name));

    const total = matches.length;
    const pages = Math.ceil(total / limit);
    const start = (page - 1) * limit;

    // ✅ Format results for frontend
    const results = matches.slice(start, start + limit).map(g => ({
      id: g.id,
      name: g.name,
      iconUrl: g.iconUrl,
      memberCount: g.members.length,
      createdBy: g.createdBy
    }));

    res.json({ results, total, page, pages });

  } catch (err) {
    console.error("❌ Search Groups Error:", err);
    res.json({ results: [], total: 0, page: 1, pages: 0 });
  }
});

// ✅ Get single group + members
router.get("/:id", (req, res) => {
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

// ✅ Join group endpoint — adds user as "member" role
router.post("/:id/join", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const { userId, username } = req.body;

    if (!userId || !username) {
      return res.json({ success: false, error: "Missing user data" });
    }

    const group = data.groups.find(g => g.id === groupId);
    if (!group) return res.json({ success: false, error: "Group not found" });

    // Check if already in group
    const alreadyMember = group.members.some(m => m.userId === Number(userId));
    if (alreadyMember) {
      return res.json({ success: false, error: "Already a member" });
    }

    // Add as member
    group.members.push({
      userId: Number(userId),
      username: username,
      role: "member"
    });

    saveData();
    res.json({ success: true, message: "Joined group" });
  } catch (err) {
    console.error("Join Group Error:", err);
    res.json({ success: false, error: "Server error" });
  }
});

// ==============================================
// ✅ NEW ENDPOINTS FOR CONFIGURE GROUP PAGE
// ==============================================

// ✅ Update Group Icon
router.post("/:id/update-icon", upload.single('groupIcon'), (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const group = data.groups.find(g => g.id === groupId);
    
    if (!group) return res.json({ success: false, error: "Group not found" });
    if (!req.file) return res.json({ success: false, error: "No image uploaded" });

    // Delete old icon if it's not the default one
    if (group.iconUrl && !group.iconUrl.includes("default-group.png")) {
      const oldIconPath = path.join(__dirname, '../public', group.iconUrl);
      if (fs.existsSync(oldIconPath)) fs.unlinkSync(oldIconPath);
    }

    // Save new icon URL
    group.iconUrl = "/uploads/groups/" + req.file.filename;
    saveData();

    res.json({ success: true, newIconUrl: group.iconUrl });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.json({ success: false, error: err.message || "Failed to update icon" });
  }
});

// ✅ Update Group Description
router.post("/:id/update-description", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const { description } = req.body;
    const group = data.groups.find(g => g.id === groupId);

    if (!group) return res.json({ success: false, error: "Group not found" });

    // Update and trim to max 500 chars
    group.description = description ? description.trim().slice(0, 500) : "";
    saveData();

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message || "Failed to update description" });
  }
});

// ✅ Change Group Ownership
router.post("/:id/change-owner", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const { newOwnerId } = req.body;
    const group = data.groups.find(g => g.id === groupId);

    if (!group) return res.json({ success: false, error: "Group not found" });

    // Check if new owner is actually a member
    const newOwnerMember = group.members.find(m => m.userId === Number(newOwnerId));
    if (!newOwnerMember) return res.json({ success: false, error: "User is not in this group" });

    // Update ownership
    const oldOwnerId = group.createdById;  // ✅ save first
    group.createdById = Number(newOwnerId);
    group.createdBy = newOwnerMember.username;

    group.members.forEach(m => {
      if (m.userId === Number(newOwnerId)) m.role = "owner";
      if (m.userId === oldOwnerId && m.userId !== Number(newOwnerId)) m.role = "member";  // ✅ uses saved value
    });

    saveData();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message || "Failed to change owner" });
  }
});

module.exports = router;