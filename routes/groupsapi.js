const express = require('express');
const router = express.Router();
const path = require('path');

// Load correctly
const dataModule = require(path.resolve(__dirname, '../chat-data.js'));
const getData = () => dataModule.data;
const { saveData } = dataModule;

function getValidGroupId(rawId) {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.post('/create', async (req, res) => {
  try {
    const { ownerId, ownerUsername, name, description = "", emblem = null } = req.body;
    if (!ownerId || !ownerUsername || !name || typeof name !== "string" || name.trim().length < 1) {
      return res.status(400).json({ success: false, error: "Missing or invalid required fields" });
    }

    const data = getData();
    if (!data.groups) data.groups = {};
    if (!data.nextGroupId || typeof data.nextGroupId !== "number") data.nextGroupId = 1;

    const groupId = data.nextGroupId;
    const now = new Date().toISOString();

    const newGroup = {
      id: groupId,
      name: name.trim(),
      description: description.trim(),
      emblem,
      ownerId: Number(ownerId),
      ownerUsername,
      createdAt: now,
      updatedAt: now,
      members: [Number(ownerId)],
      memberCount: 1,
      settings: { isPrivate: false, allowRequests: true }
    };

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
    const group = getData().groups?.[groupId];
    if (!group) return res.status(404).json({ success: false, error: "Group not found" });
    res.json({ success: true, group });
  } catch (err) {
    console.error("❌ Get group error:", err);
    res.status(500).json({ success: false, error: "Failed to load group" });
  }
});

router.get('/', (req, res) => {
  try {
    const groups = Object.values(getData().groups || {});
    res.json({ success: true, count: groups.length, groups });
  } catch (err) {
    console.error("❌ List groups error:", err);
    res.status(500).json({ success: false, error: "Failed to list groups" });
  }
});

router.post('/:id/join', async (req, res) => {
  try {
    const groupId = getValidGroupId(req.params.id);
    const { userId, username } = req.body;
    if (!groupId || !userId || !username) return res.status(400).json({ success: false, error: "Missing details" });
    const group = getData().groups?.[groupId];
    if (!group) return res.status(404).json({ success: false, error: "Group not found" });
    const uid = Number(userId);
    if (group.members.includes(uid)) return res.json({ success: true, message: "Already member", group });
    group.members.push(uid);
    group.memberCount = group.members.length;
    group.updatedAt = new Date().toISOString();
    await saveData();
    res.json({ success: true, message: "Joined group", group });
  } catch (err) {
    console.error("❌ Join error:", err);
    res.status(500).json({ success: false, error: "Failed to join" });
  }
});

router.post('/:id/leave', async (req, res) => {
  try {
    const groupId = getValidGroupId(req.params.id);
    const { userId } = req.body;
    if (!groupId || !userId) return res.status(400).json({ success: false, error: "Missing details" });
    const group = getData().groups?.[groupId];
    if (!group) return res.status(404).json({ success: false, error: "Group not found" });
    const uid = Number(userId);
    if (!group.members.includes(uid)) return res.status(400).json({ success: false, error: "Not a member" });
    if (group.ownerId === uid) return res.status(403).json({ success: false, error: "Owner can't leave" });
    group.members = group.members.filter(id => id !== uid);
    group.memberCount = group.members.length;
    group.updatedAt = new Date().toISOString();
    await saveData();
    res.json({ success: true, message: "Left group", group });
  } catch (err) {
    console.error("❌ Leave error:", err);
    res.status(500).json({ success: false, error: "Failed to leave" });
  }
});

module.exports = router;