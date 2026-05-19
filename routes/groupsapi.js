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

module.exports = router;