const express = require('express');
const router = express.Router();

const { onlineUsers } = require('../sockets');
const { getProfileById, clean, updateStatus } = require('../helpers');
const { data, saveData } = require('../data');

// ----------------------
// PROFILE
// ----------------------
router.get("/profile/:id", (req, res) => {
  try {
    const profile = getProfileById(req.params.id);

    console.log("PROFILE RETURNED:", profile);

    if (!profile) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get matching account to check online status
    const accountEntry = Object.entries(data.accounts).find(([_, acc]) => acc.id === Number(req.params.id));
    const username = accountEntry ? accountEntry[0] : null;
    const isOnline = username ? onlineUsers.has(username) : false;

    res.json({
      ...profile,
      bio: profile.bio ?? "",
      birthday: profile.birthday ?? null,
      gender: profile.gender ?? null,
      status: profile.status ?? "",
      isOnline // ✅ Add this line — matches the same logic as your search route
    });

  } catch (err) {
    console.error("Profile API Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------------
// UPDATE BIO
// ----------------------
router.post("/profile/update-bio", (req, res) => {
  try {
    const { userId, bio } = req.body;
    if (!userId) return res.json({ success: false });

    const profile = Object.values(data.userProfiles)
      .find(p => p.id === Number(userId));

    if (!profile) return res.json({ success: false });

    profile.bio = (bio || "").trim().slice(0, 500);
    saveData();

    res.json({ success: true });

  } catch (err) {
    console.error("Update Bio API Error:", err);
    res.json({ success: false });
  }
});

// ----------------------
// UPDATE STATUS (✅ FIX YOU NEEDED)
// ----------------------
router.post("/profile/update-status", async (req, res) => {
  try {
    const { userId, status } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: "Missing userId" });
    }

    const result = await updateStatus(userId, status);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);

  } catch (err) {
    console.error("Update Status API Error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

router.get("/feed", (req, res) => {
  try {
    // Initialize posts array if it doesn't exist
    if (!data.feedPosts) data.feedPosts = [];

    // Return newest first
    const sorted = [...data.feedPosts].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json(sorted);
  } catch (err) {
    console.error("Get Feed Error:", err);
    res.status(500).json({ error: "Could not load feed" });
  }
});

router.post("/feed/post", (req, res) => {
  try {
    const { authorId, username, content } = req.body;

    if (!authorId || !username || !content.trim()) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get user's gender for avatar
    const profile = getProfileById(authorId) || {};

    const newPost = {
      id: Date.now().toString(),
      authorId: Number(authorId),
      username,
      content: content.trim().slice(0, 254),
      gender: profile.gender || "Male",
      createdAt: new Date().toISOString()
    };

    // Save to data store
    if (!data.feedPosts) data.feedPosts = [];
    data.feedPosts.push(newPost);
    saveData();

    // Emit to all connected users in real‑time
    const io = req.app.get("io");
    if (io) io.emit("new-post", newPost);

    res.status(201).json(newPost);
  } catch (err) {
    console.error("Create Post Error:", err);
    res.status(500).json({ error: "Could not create post" });
  }
});

// ----------------------
// SEARCH USERS
// ----------------------
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
          username,
          gender: profile.gender || "Male",
          isOnline,
          lastOnline: profile.lastOnline || null
        });
      }
    });

    matches.sort((a, b) => a.username.localeCompare(b.username));

    const total = matches.length;
    const pages = Math.ceil(total / limit);
    const start = (page - 1) * limit;

    res.json({
      results: matches.slice(start, start + limit),
      total,
      page,
      pages
    });

  } catch (err) {
    console.error("Search API Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/profile/username-history/:userId", (req, res) => {
  try {
    const targetId = Number(req.params.userId);
    if (!targetId) return res.status(400).json({ success: false });

    // Filter history for this user, newest first
    const userHistory = (data.usernameHistory || [])
      .filter(entry => entry.userId === targetId);

    res.json({ success: true, history: userHistory });
  } catch (err) {
    console.error("Load username history error:", err);
    res.status(500).json({ success: false, message: "Failed to load history" });
  }
});

module.exports = router;