const express = require('express');
const router = express.Router();

let groups = [];
let nextGroupId = 1;

// CREATE GROUP
router.post('/create', (req, res) => {
  try {
    const { creatorId, creatorUsername, name, description, icon } = req.body;

    if (!creatorId || !creatorUsername || !name) {
      return res.json({ success: false, error: "Missing required fields" });
    }

    const newGroup = {
      id: nextGroupId++,
      creatorId,
      creatorUsername,
      name,
      description: description || "",
      icon: icon || "",
      createdAt: new Date().toISOString(),
      members: [creatorId],
      membersCount: 1
    };

    groups.push(newGroup);
    return res.json({ success: true, group: newGroup });
  } catch (err) {
    console.error("Create group error:", err);
    return res.json({ success: false, error: "Server error" });
  }
});

// GET GROUP
router.get('/group', (req, res) => {
  try {
    const id = parseInt(req.query.id);
    const group = groups.find(g => g.id === id);
    if (!group) return res.json({ success: false, error: "Group not found" });
    return res.json({ success: true, group });
  } catch (err) {
    console.error("Get group error:", err);
    return res.json({ success: false, error: "Server error" });
  }
});

module.exports = router;