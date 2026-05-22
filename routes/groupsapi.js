const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { data, saveData } = require('../data');

// ----------------------
// ✅ IMAGE UPLOAD CONFIG (FIXED PATHS + SAFETY)
// ----------------------
const UPLOAD_FOLDER = path.join(__dirname, '../public/uploads/groups');
// Create folder if missing — with full permissions
if (!fs.existsSync(UPLOAD_FOLDER)) {
  fs.mkdirSync(UPLOAD_FOLDER, { recursive: true, mode: 0o755 });
}

// Allowed file types + size limit
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_FOLDER);
  },
  filename: function (req, file, cb) {
    // Safe filename: no spaces, unique, correct extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = 'group-' + uniqueSuffix + ext;
    cb(null, safeName);
  }
});

const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('❌ Only JPG, PNG, GIF, WEBP files are allowed'), false);
  }
};

// Final upload middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});

// ----------------------
// ✅ GROUPS ENDPOINTS (FULLY FIXED)
// ----------------------

/**
 * Create group — owner added automatically, icon saved correctly
 */
router.post("/create", upload.single('groupIcon'), (req, res) => {
  try {
    const { name, description, createdBy, createdById } = req.body;

    // ✅ Validation
    if (!name || name.trim().length < 3) {
      if (req.file) fs.unlinkSync(req.file.path); // Cleanup invalid upload
      return res.json({ success: false, error: "Group name must be at least 3 characters" });
    }
    if (!createdBy || !createdById) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.json({ success: false, error: "Missing creator information" });
    }

    // ✅ Set icon path — CORRECT RELATIVE PATH FOR FRONTEND
    let iconUrl = "/uploads/groups/default-group.png";
    if (req.file) {
      iconUrl = "/uploads/groups/" + req.file.filename;
    }

    // ✅ Create group object with ALL required fields
    const newGroup = {
      id: data.nextGroupId++,
      name: name.trim(),
      iconUrl: iconUrl, // ✅ This is what your frontend uses
      createdBy: createdBy.trim(),
      createdById: Number(createdById),
      description: description ? description.trim() : "",
      createdDate: new Date().toISOString(),
      members: [
        { 
          userId: Number(createdById), 
          username: createdBy.trim(), 
          role: "owner" 
        }
      ]
    };

    // ✅ Save to data store
    data.groups.push(newGroup);
    saveData();

    // ✅ Return FULL iconUrl so frontend can display immediately
    res.json({ 
      success: true, 
      groupId: newGroup.id,
      iconUrl: iconUrl 
    });

  } catch (err) {
    // Cleanup uploaded file if something breaks
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    console.error("❌ Create Group Error:", err);
    res.json({ success: false, error: err.message || "Server error while creating group" });
  }
});

/**
 * Get single group + members
 */
router.get("/:id", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    if (isNaN(groupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    const group = data.groups.find(g => g.id === groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.json(group);
  } catch (err) {
    console.error("❌ Get Group Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * Join group — adds user as "member" role
 */
router.post("/:id/join", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const { userId, username } = req.body;

    if (!userId || !username) {
      return res.json({ success: false, error: "Missing user data" });
    }
    if (isNaN(groupId)) {
      return res.json({ success: false, error: "Invalid group ID" });
    }

    const group = data.groups.find(g => g.id === groupId);
    if (!group) return res.json({ success: false, error: "Group not found" });

    // Check if already member
    const alreadyMember = group.members.some(m => m.userId === Number(userId));
    if (alreadyMember) {
      return res.json({ success: false, error: "You are already in this group" });
    }

    // Add as regular member
    group.members.push({
      userId: Number(userId),
      username: username.trim(),
      role: "member"
    });

    saveData();
    res.json({ success: true, message: "Successfully joined group" });

  } catch (err) {
    console.error("❌ Join Group Error:", err);
    res.json({ success: false, error: err.message || "Server error" });
  }
});

// ==============================================
// ✅ CONFIGURE GROUP ENDPOINTS — FULLY FIXED
// ==============================================

/**
 * Update Group Icon
 */
router.post("/:id/update-icon", upload.single('groupIcon'), (req, res) => {
  try {
    const groupId = Number(req.params.id);
    if (isNaN(groupId)) return res.json({ success: false, error: "Invalid group ID" });

    const group = data.groups.find(g => g.id === groupId);
    if (!group) return res.json({ success: false, error: "Group not found" });
    if (!req.file) return res.json({ success: false, error: "No image file provided" });

    // ✅ Delete OLD icon (only if not default)
    if (group.iconUrl && !group.iconUrl.includes("default-group.png")) {
      const oldIconFullPath = path.join(__dirname, '../public', group.iconUrl);
      if (fs.existsSync(oldIconFullPath)) {
        fs.unlinkSync(oldIconFullPath);
      }
    }

    // ✅ Save NEW icon path
    group.iconUrl = "/uploads/groups/" + req.file.filename;
    saveData();

    res.json({ 
      success: true, 
      newIconUrl: group.iconUrl,
      message: "Icon updated successfully"
    });

  } catch (err) {
    // Cleanup if error
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    console.error("❌ Update Icon Error:", err);
    res.json({ success: false, error: err.message || "Failed to update icon" });
  }
});

/**
 * Update Group Description
 */
router.post("/:id/update-description", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const { description } = req.body;

    if (isNaN(groupId)) return res.json({ success: false, error: "Invalid group ID" });

    const group = data.groups.find(g => g.id === groupId);
    if (!group) return res.json({ success: false, error: "Group not found" });

    // ✅ Trim and limit length
    group.description = description ? description.trim().slice(0, 1000) : "";
    saveData();

    res.json({ success: true, message: "Description updated" });

  } catch (err) {
    console.error("❌ Update Description Error:", err);
    res.json({ success: false, error: err.message || "Failed to update description" });
  }
});

/**
 * Change Group Ownership
 */
router.post("/:id/change-owner", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const { newOwnerId } = req.body;

    if (isNaN(groupId) || isNaN(Number(newOwnerId))) {
      return res.json({ success: false, error: "Invalid ID provided" });
    }

    const group = data.groups.find(g => g.id === groupId);
    if (!group) return res.json({ success: false, error: "Group not found" });

    // ✅ Check new owner exists in group
    const newOwnerMember = group.members.find(m => m.userId === Number(newOwnerId));
    if (!newOwnerMember) {
      return res.json({ success: false, error: "Selected user is not a member of this group" });
    }

    // ✅ Update ownership details
    const oldOwnerId = group.createdById;
    group.createdById = Number(newOwnerId);
    group.createdBy = newOwnerMember.username;

    // ✅ Update roles: old owner → member, new owner → owner
    group.members.forEach(m => {
      if (m.userId === Number(newOwnerId)) m.role = "owner";
      if (m.userId === oldOwnerId && m.userId !== Number(newOwnerId)) m.role = "member";
    });

    saveData();
    res.json({ success: true, message: "Ownership transferred successfully" });

  } catch (err) {
    console.error("❌ Change Owner Error:", err);
    res.json({ success: false, error: err.message || "Failed to change owner" });
  }
});

// ✅ SEARCH ENDPOINT (matches your earlier error — added so search works!)
router.get("/search", (req, res) => {
  try {
    const keyword = (req.query.keyword || "").trim().toLowerCase();
    const page = parseInt(req.query.page) || 1;
    const limit = 12;

    if (keyword.length < 3) {
      return res.json({ results: [], total: 0, page, pages: 0 });
    }

    const matches = data.groups.filter(group => 
      group.name.toLowerCase().includes(keyword)
    );

    matches.sort((a, b) => a.name.localeCompare(b.name));

    const total = matches.length;
    const pages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
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
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;