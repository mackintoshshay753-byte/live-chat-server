const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { data, saveData } = require('../data');
const { clean, authenticateToken } = require('../helpers');

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
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only JPG, PNG, GIF, WEBP files are allowed'), false);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Protect group routes
router.use(authenticateToken);

// Create Group
router.post("/create", upload.single('groupIcon'), (req, res) => {
  try {
    const { name, description } = req.body;
    const createdById = req.user.id;      // ✅ SECURE
    const createdBy = req.user.username;  // ✅ SECURE
    
    const cleanedName = clean(name);
    if (!cleanedName || cleanedName.length < 3) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.json({ success: false, error: "Name too short or invalid" });
    }

    let iconUrl = "/uploads/groups/default-group.png";
    if (req.file) iconUrl = "/uploads/groups/" + req.file.filename;

    const newGroup = {
      id: data.nextGroupId++,
      name: cleanedName,
      iconUrl: iconUrl,
      createdBy: createdBy,
      createdById: createdById,
      description: clean(description), // ✅ SANITIZED
      createdDate: new Date().toISOString(),
      members: [
        { userId: createdById, username: createdBy, role: "owner" }
      ]
    };

    data.groups.push(newGroup);
    saveData();
    res.json({ success: true, groupId: newGroup.id });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error("Create Group Error:", err);
    res.json({ success: false, error: "Server error" });
  }
});

// Get single group
router.get("/:id", (req, res) => {
  const group = data.groups.find(g => g.id === Number(req.params.id));
  if (!group) return res.status(404).json({ error: "Group not found" });
  res.json(group);
});

// Join group
router.post("/:id/join", (req, res) => {
  const group = data.groups.find(g => g.id === Number(req.params.id));
  if (!group) return res.json({ success: false, error: "Group not found" });

  const userId = req.user.id;
  const username = req.user.username;

  if (group.members.some(m => m.userId === userId)) {
    return res.json({ success: false, error: "Already a member" });
  }

  group.members.push({ userId, username, role: "member" });
  saveData();
  res.json({ success: true, message: "Joined group" });
});

// Update Group Icon
router.post("/:id/update-icon", upload.single('groupIcon'), (req, res) => {
  try {
    const group = data.groups.find(g => g.id === Number(req.params.id));
    if (!group) return res.json({ success: false, error: "Group not found" });
    
    // ✅ PERMISSION CHECK: Verify request caller owns the asset
    if (group.createdById !== req.user.id) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ success: false, error: "Forbidden access" });
    }

    if (!req.file) return res.json({ success: false, error: "No image uploaded" });

    if (group.iconUrl && !group.iconUrl.includes("default-group.png")) {
      const oldIconPath = path.join(__dirname, '../public', group.iconUrl);
      if (fs.existsSync(oldIconPath)) fs.unlinkSync(oldIconPath);
    }

    group.iconUrl = "/uploads/groups/" + req.file.filename;
    saveData();

    res.json({ success: true, newIconUrl: group.iconUrl });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.json({ success: false, error: "Failed to update icon" });
  }
});

// Update Group Description
router.post("/:id/update-description", (req, res) => {
  const group = data.groups.find(g => g.id === Number(req.params.id));
  if (!group) return res.json({ success: false, error: "Group not found" });

  // ✅ PERMISSION CHECK
  if (group.createdById !== req.user.id) return res.status(403).json({ error: "Forbidden access" });

  group.description = clean(req.body.description).slice(0, 500);
  saveData();
  res.json({ success: true });
});

// Change Group Ownership
router.post("/:id/change-owner", (req, res) => {
  const group = data.groups.find(g => g.id === Number(req.params.id));
  if (!group) return res.json({ success: false, error: "Group not found" });

  // ✅ PERMISSION CHECK: Only current owner can hand off control
  if (group.createdById !== req.user.id) return res.status(403).json({ error: "Forbidden access" });

  const newOwnerId = Number(req.body.newOwnerId);
  const newOwnerMember = group.members.find(m => m.userId === newOwnerId);
  if (!newOwnerMember) return res.json({ success: false, error: "User is not in this group" });

  const oldOwnerId = group.createdById;
  group.createdById = newOwnerId;
  group.createdBy = newOwnerMember.username;

  group.members.forEach(m => {
    if (m.userId === newOwnerId) m.role = "owner";
    if (m.userId === oldOwnerId) m.role = "member";
  });

  saveData();
  res.json({ success: true });
});

module.exports = router;