const express = require('express');
const router = express.Router();

// Import correctly matching your file
const dataModule = require('../chat-data');
const getData = () => dataModule.data; // Getter for current data
const { saveData } = dataModule;

function getValidGroupId(rawId) {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.post('/create', async (req, res) => {
  try {
    const { ownerId, ownerUsername, name, description = "", emblem = null } = req.body;

    // Validate input
    if (!ownerId || !ownerUsername || !name || typeof name !== "string" || name.trim().length < 1) {
      return res.status(400).json({ success: false, error: "Missing or invalid required fields: ownerId, ownerUsername, name" });
    }

    const data = getData();

    // Initialize groups structure if it doesn't exist yet
    if (!data.groups) data.groups = {};
    if (!data.nextGroupId || typeof data.nextGroupId !== "number") data.nextGroupId = 1;

    const groupId = data.nextGroupId;
    const now = new Date().toISOString();

    const newGroup = {
      id: groupId,
      name: name.trim(),
      description: description.trim(),
      emblem: emblem,
      ownerId: Number(ownerId),
      ownerUsername: ownerUsername,
      createdAt: now,
      updatedAt: now,
      members: [Number(ownerId)],
      memberCount: 1,
      settings: { isPrivate: false, allowRequests: true }
    };

    // Save to data
    data.groups[groupId] = newGroup;
    data.nextGroupId += 1;

    await saveData();

    res.status(201).json({
      success: true,
      message: "Group created successfully",
      group: newGroup,
      link: `https://idontknowww.neocities.org/groups/group?id=${groupId}`
    });

  } catch (err) {
    console.error("❌ Error creating group:", err);
    res.status(500).json({ success: false, error: "Server error while creating group" });
  }
});

router.get('/:id', (req, res) => {
  try {
    const groupId = getValidGroupId(req.params.id);
    if (!groupId) return res.status(400).json({ success: false, error: "Invalid group ID" });

    const data = getData();
    const group = data.groups?.[groupId];

    if (!group) return res.status(404).json({ success: false, error: "Group not found" });

    res.json({ success: true, group });
  } catch (err) {
    console.error("❌ Error fetching group:", err);
    res.status(500).json({ success: false, error: "Failed to load group" });
  }
});

router.get('/', (req, res) => {
  try {
    const data = getData();
    const groups = Object.values(data.groups || {});
    res.json({ success: true, count: groups.length, groups });
  } catch (err) {
    console.error("❌ Error listing groups:", err);
    res.status(500).json({ success: false, error: "Failed to list groups" });
  }
});

router.post('/:id/join', async (req, res) => {
  try {
    const groupId = getValidGroupId(req.params.id);
    const { userId, username } = req.body;

    if (!groupId || !userId || !username) {
      return res.status(400).json({ success: false, error: "Missing group or user details" });
    }

    const data = getData();
    const group = data.groups?.[groupId];
    if (!group) return res.status(404).json({ success: false, error: "Group not found" });

    const userIdNum = Number(userId);
    if (group.members.includes(userIdNum)) {
      return res.json({ success: true, message: "Already a member", group });
    }

    group.members.push(userIdNum);
    group.memberCount = group.members.length;
    group.updatedAt = new Date().toISOString();

    await saveData();
    res.json({ success: true, message: "Joined group successfully", group });

  } catch (err) {
    console.error("❌ Error joining group:", err);
    res.status(500).json({ success: false, error: "Failed to join group" });
  }
});

router.post('/:id/leave', async (req, res) => {
  try {
    const groupId = getValidGroupId(req.params.id);
    const { userId } = req.body;

    if (!groupId || !userId) {
      return res.status(400).json({ success: false, error: "Missing group or user ID" });
    }

    const data = getData();
    const group = data.groups?.[groupId];
    if (!group) return res.status(404).json({ success: false, error: "Group not found" });

    const userIdNum = Number(userId);
    if (!group.members.includes(userIdNum)) {
      return res.status(400).json({ success: false, error: "Not a member of this group" });
    }

    if (group.ownerId === userIdNum) {
      return res.status(403).json({ success: false, error: "Group owner cannot leave — transfer ownership first" });
    }

    group.members = group.members.filter(id => id !== userIdNum);
    group.memberCount = group.members.length;
    group.updatedAt = new Date().toISOString();

    await saveData();
    res.json({ success: true, message: "Left group successfully", group });

  } catch (err) {
    console.error("❌ Error leaving group:", err);
    res.status(500).json({ success: false, error: "Failed to leave group" });
  }
});

module.exports = router;