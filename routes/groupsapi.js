// ======================
// groupsapi.js
// ======================
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { data, saveData } = require('../data');

// ======================
// MULTER CONFIG - Group Icon Upload
// ======================
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
    cb(null, 'group-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, GIF and WEBP images are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// ======================
// CREATE GROUP
// ======================
router.post("/create", upload.single('groupIcon'), (req, res) => {
  try {
    const { name, description, createdBy, createdById } = req.body;

    if (!name || name.trim().length < 3) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.json({ success: false, error: "Group name must be at least 3 characters long." });
    }

    if (!createdBy || !createdById) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.json({ success: false, error: "Creator information is missing." });
    }

    const iconUrl = req.file 
      ? `/uploads/groups/${req.file.filename}` 
      : "/uploads/groups/default-group.png";

    const newGroup = {
      id: data.nextGroupId++,
      name: name.trim(),
      iconUrl: iconUrl,
      createdBy: createdBy,
      createdById: Number(createdById),
      description: description ? description.trim() : "",
      createdDate: new Date().toISOString(),
      members: [
        {
          userId: Number(createdById),
          username: createdBy,
          role: "owner"
        }
      ]
    };

    data.groups.push(newGroup);
    saveData();

    res.json({ 
      success: true, 
      message: "Group created successfully!",
      groupId: newGroup.id 
    });

  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error("Create Group Error:", err);
    res.status(500).json({ success: false, error: "Server error while creating group." });
  }
});

// ======================
// GET SINGLE GROUP
// ======================
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

// ======================
// JOIN GROUP
// ======================
router.post("/:id/join", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const { userId, username } = req.body;

    if (!userId || !username) {
      return res.json({ success: false, error: "User ID and username are required" });
    }

    const group = data.groups.find(g => g.id === groupId);
    if (!group) {
      return res.json({ success: false, error: "Group not found" });
    }

    const alreadyMember = group.members.some(m => m.userId === Number(userId));
    if (alreadyMember) {
      return res.json({ success: false, error: "You are already a member of this group" });
    }

    group.members.push({
      userId: Number(userId),
      username: username,
      role: "member"
    });

    saveData();
    res.json({ success: true, message: "Successfully joined the group!" });

  } catch (err) {
    console.error("Join Group Error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ======================
// USER ADS ROUTES
// ======================

// Get all ads
router.get("/userads", (req, res) => {
  try {
    if (!data.userAds) data.userAds = [];
    res.json(data.userAds.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (err) {
    console.error("Get User Ads Error:", err);
    res.status(500).json({ error: "Failed to load ads" });
  }
});

// Create new ad (Base64 image)
router.post("/userads", (req, res) => {
  try {
    if (!data.userAds) data.userAds = [];

    const { groupId, groupName, adName, image, size, createdBy, createdByName } = req.body;

    if (!groupId || !adName || !image || !size || !createdBy) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newAd = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      groupId: Number(groupId),
      groupName: groupName || "Unknown Group",
      adName: adName.trim(),
      image: image,           // Base64 data URL
      size: size,             // "160x600" or "728x90"
      createdBy: Number(createdBy),
      createdByName: createdByName || "Anonymous"
    };

    data.userAds.unshift(newAd); // newest first
    saveData();

    res.status(201).json({ 
      success: true, 
      message: "Ad created successfully!",
      ad: newAd 
    });

  } catch (err) {
    console.error("Create User Ad Error:", err);
    res.status(500).json({ error: "Failed to create advertisement" });
  }
});

// Get ads by size (for sidebar)
router.get("/userads/size/:size", (req, res) => {
  try {
    if (!data.userAds) return res.json([]);
    
    const size = req.params.size;
    const filteredAds = data.userAds.filter(ad => ad.size === size);
    
    res.json(filteredAds);
  } catch (err) {
    console.error("Filter Ads Error:", err);
    res.status(500).json({ error: "Failed to filter ads" });
  }
});

module.exports = router;