const express = require('express');
const router = express.Router();

// Import your data and helpers
const { data, saveData, getProfileById, clean } = require('../helpers'); // adjust path if needed
const { onlineUsers } = require('../sockets'); // if you need online status

// ----------------------
// Helper: Validate group icon format
// ----------------------
function isValidIcon(icon) {
  if (!icon) return false;
  
  // Check if it's a valid URL (http/https) OR a base64 string
  const urlRegex = /^https?:\/\/.+$/i;
  const base64Regex = /^data:image\/(png|jpeg|jpg|gif);base64,/i;
  return urlRegex.test(icon) || base64Regex.test(icon);
}

// ----------------------
// Get single group by ID → matches your URL: /groups/group?id=1
// (includes icon)
// ----------------------
router.get("/group", (req, res) => {
  try {
    const groupId = parseInt(req.query.id);

    if (!groupId || isNaN(groupId)) {
      return res.status(400).json({ error: "Valid group ID is required" });
    }

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

// ----------------------
// Create new group → auto‑increments ID + includes icon
// ----------------------
router.post("/create", async (req, res) => {
  try {
    const { 
      creatorId, 
      creatorUsername, 
      name, 
      description = "", 
      icon = "" // New icon field
    } = req.body;

    // Validate required fields
    if (!creatorId || !creatorUsername || !name.trim()) {
      return res.status(400).json({ error: "Missing required fields (creatorId, creatorUsername, name)" });
    }

    // Validate and set icon (use default if invalid/missing)
    const DEFAULT_ICON = "https://cdn-icons-png.flaticon.com/512/25/25694.png"; // Example group icon URL
    const groupIcon = isValidIcon(icon.trim()) ? icon.trim() : DEFAULT_ICON;

    // Build group object (with icon)
    const newGroup = {
      id: data.nextGroupId++,
      creatorId: Number(creatorId),
      creatorUsername,
      name: name.trim().slice(0, 100),
      description: description.trim().slice(0, 1000),
      icon: groupIcon, // New icon field added here
      createdAt: new Date().toISOString(),
      members: [Number(creatorId)], // Creator joins automatically
      membersCount: 1,
      posts: [] // Optional: For group-specific posts later
    };

    // Save to data and persist
    data.groups.push(newGroup);
    await saveData();

    // Optional: Emit real-time event if using Socket.IO
    const io = req.app.get("io");
    if (io) io.emit("group-created", newGroup);

    res.status(201).json({ 
      success: true, 
      group: newGroup,
      note: "Icon was set to default because the provided one was invalid" 
        ? !isValidIcon(icon.trim()) 
        : ""
    });
  } catch (err) {
    console.error("Create Group Error:", err);
    res.status(500).json({ success: false, error: "Could not create group" });
  }
});

// ----------------------
// Optional: List all groups (includes icons)
// ----------------------
router.get("/list", (req, res) => {
  try {
    // Sort by newest first
    const sortedGroups = [...data.groups].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({ success: true, groups: sortedGroups });
  } catch (err) {
    console.error("List Groups Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;