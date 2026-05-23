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
      createdById: createdById, 
      createdBy: createdBy, // ✅ SAVE NAME HERE TOO FOR OLD GROUPS
      description: description ? description.trim() : "",
      createdDate: new Date().toISOString(),
      members: [
        { userId: Number(createdById), username: createdBy, role: "owner" } // ✅ OWNER ALWAYS HERE
      ],
      wallPosts: []
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

// ==============================================
// ✅ FIXED UPDATE USERNAME — NOW 100% WORKS
// ==============================================
router.post("/update-username", (req, res) => {
  try {
    const { oldName, newName, userId } = req.body;
    if (!oldName || !newName || !userId) return res.json({ success: false });

    const uid = Number(userId);

    data.groups.forEach(group => {
      // ✅ 1. Update in members list
      group.members.forEach(member => {
        if (member.userId === uid) {
          member.username = newName;
        }
      });

      // ✅ 2. Update in wall posts
      if (group.wallPosts) {
        group.wallPosts.forEach(post => {
          if (post.userId === uid) {
            post.username = newName;
          }
        });
      }
    });

    saveData();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/** ✅ SEARCH ENDPOINT */
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
      createdById: g.createdById // ✅ Return ID only
    }));

    res.json({ results, total, page, pages: 0 });

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

// ✅ Join group endpoint
router.post("/:id/join", (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const { userId, username } = req.body;

    if (!userId || !username) {
      return res.json({ success: false, error: "Missing user data" });
    }

    const group = data.groups.find(g => g.id === groupId);
    if (!group) return res.json({ success: false, error: "Group not found" });

    const alreadyMember = group.members.some(m => m.userId === Number(userId));
    if (alreadyMember) {
      return res.json({ success: false, error: "Already a member" });
    }

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

// ✅ Update Group Icon
router.post("/:id/update-icon", upload.single('groupIcon'), (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const group = data.groups.find(g => g.id === groupId);
    
    if (!group) return res.json({ success: false, error: "Group not found" });
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

    const newOwnerMember = group.members.find(m => m.userId === Number(newOwnerId));
    if (!newOwnerMember) return res.json({ success: false, error: "User is not in this group" });

    const oldOwnerId = group.createdById;
    group.createdById = Number(newOwnerId);

    group.members.forEach(m => {
      if (m.userId === Number(newOwnerId)) m.role = "owner";
      if (m.userId === oldOwnerId && m.userId !== Number(newOwnerId)) m.role = "member";
    });

    saveData();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message || "Failed to change owner" });
  }
});

/** Create ad */
router.post("/:id/ads/create", upload.single('adImage'), (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const { name, adType, createdById } = req.body;

    const group = data.groups.find(g => g.id === groupId);
    if (!group) { if (req.file) fs.unlinkSync(req.file.path); return res.json({ success: false, error: "Group not found" }); }
    if (!req.file) return res.json({ success: false, error: "No image uploaded" });
    if (!name || name.trim().length < 3) { fs.unlinkSync(req.file.path); return res.json({ success: false, error: "Ad name too short" }); }
    if (!['728x90', '160x600'].includes(adType)) { fs.unlinkSync(req.file.path); return res.json({ success: false, error: "Invalid ad type" }); }

    if (!data.ads) data.ads = [];

    const newAd = {
      id: Date.now(),
      groupId,
      groupName: group.name,
      groupIconUrl: group.iconUrl,
      createdById: Number(createdById),
      name: name.trim(),
      adType,
      imageUrl: "/uploads/groups/" + req.file.filename,
      createdDate: new Date().toISOString(),
      active: true
    };

    data.ads.push(newAd);
    saveData();
    res.json({ success: true, adId: newAd.id });
  } catch (err) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch(e){} }
    res.json({ success: false, error: err.message || "Server error" });
  }
});

/** Get random active ad by type */
router.get("/ads/random", (req, res) => {
  try {
    const { type } = req.query;
    if (!type) return res.json({ ad: null });
    const ads = (data.ads || []).filter(a => a.active && a.adType === type);
    if (ads.length === 0) return res.json({ ad: null });
    const ad = ads[Math.floor(Math.random() * ads.length)];
    res.json({ ad });
  } catch (err) {
    res.json({ ad: null });
  }
});

router.get("/:id/wall", (req, res) => {
  try {
    const g = data.groups.find(x => x.id === +req.params.id);
    if (!g) return res.json({ posts: [] });

    res.json({
      posts: g.wallPosts || []
    });

  } catch {
    res.json({ posts: [] });
  }
});

router.post("/:id/wall/create", (req, res) => {
  try {
    const g = data.groups.find(x => x.id === +req.params.id);
    if (!g) return res.json({ success: false, error: "Group not found" });

    const { userId, username, avatar, message } = req.body;

    if (!g.members.some(m => m.userId === +userId))
      return res.json({ success: false, error: "Not a member" });

    if (!message?.trim())
      return res.json({ success: false, error: "Message required" });

    if (!g.wallPosts) g.wallPosts = [];

    g.wallPosts.push({
      id: Date.now(),
      userId: +userId,
      username,
      avatar: avatar || "",
      message: message.trim().slice(0, 450),
      createdAt: new Date().toISOString()
    });

    saveData();
    res.json({ success: true });

  } catch {
    res.json({ success: false, error: "Server error" });
  }
});

router.delete("/:groupId/wall/:postId", (req, res) => {
  try {
    const g = data.groups.find(x => x.id === +req.params.groupId);
    if (!g) return res.json({ success: false, error: "Group not found" });

    const { userId } = req.body;
    const p = g.wallPosts.find(x => x.id === +req.params.postId);

    if (!p) return res.json({ success: false, error: "Post not found" });

    const ok =
      +g.createdById === +userId ||
      +p.userId === +userId;

    if (!ok) return res.json({ success: false, error: "No permission" });

    g.wallPosts = g.wallPosts.filter(x => x.id !== +req.params.postId);

    saveData();
    res.json({ success: true });

  } catch {
    res.json({ success: false, error: "Server error" });
  }
});

module.exports = router;