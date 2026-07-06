const express = require('express');
const router = express.Router();
const { data, saveData } = require('../chat-data');

function getValidGroupId(rawId) {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.post('/create', async (req, res) => {
  try {
    const { ownerId, ownerUsername, name, description = "", emblem = null } = req.body;
    if (!ownerId || !ownerUsername || !name || typeof name !== "string" || name.trim().length < 1) {
      return res.status(400).json({ success: false, error: "Missing or invalid required fields: ownerId, ownerUsername, name" });
    }
    const groupId = data.nextGroupId || 1;
    const now = new Date().toISOString();
    const newGroup = { id: groupId, name: name.trim(), description: description.trim(), emblem: emblem, ownerId: Number(ownerId), ownerUsername: ownerUsername, createdAt: now, updatedAt: now, members: [Number(ownerId)], memberCount: 1, settings: { isPrivate: false, allowRequests: true } };
    data.groups = data.groups || {};
    data.groups[groupId] = newGroup;
    data.nextGroupId = groupId + 1;
    await saveData();
    res.status(201).json({ success: true, message: "Group created successfully", group: newGroup, link: `https://idontknowww.neocities.org/groups/group?id=${groupId}` });
  } catch (err) {
    console.error("❌ Error creating group:", err);
    res.status(500).json({ success: false, error: "Server error while creating group" });
  }
});

router.get('/:id', (req, res) => {
  const groupId = getValidGroupId(req.params.id);
  if (!groupId) return res.status(400).json({ success: false, error: "Invalid group ID" });
  const group = data.groups?.[groupId];
  if (!group) return res.status(404).json({ success: false, error: "Group not found" });
  res.json({ success: true, group });
});

router.get('/', (req, res) => {
  const groups = Object.values(data.groups || {});
  res.json({ success: true, count: groups.length, groups });
});

router.post('/:id/join', async (req, res) => {
  try {
    const groupId = getValidGroupId(req.params.id);
    const { userId, username } = req.body;
    if (!groupId || !userId || !username) return res.status(400).json({ success: false, error: "Missing group or user details" });
    const group = data.groups?.[groupId];
    if (!group) return res.status(404).json({ success: false, error: "Group not found" });
    const userIdNum = Number(userId);
    if (group.members.includes(userIdNum)) return res.json({ success: true, message: "Already a member", group });
    group.members.push(userIdNum); group.memberCount = group.members.length; group.updatedAt = new Date().toISOString();
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
    if (!groupId || !userId) return res.status(400).json({ success: false, error: "Missing group or user ID" });
    const group = data.groups?.[groupId];
    if (!group) return res.status(404).json({ success: false, error: "Group not found" });
    const userIdNum = Number(userId);
    if (!group.members.includes(userIdNum)) return res.status(400).json({ success: false, error: "Not a member of this group" });
    if (group.ownerId === userIdNum) return res.status(403).json({ success: false, error: "Group owner cannot leave — transfer ownership first" });
    group.members = group.members.filter(id => id !== userIdNum); group.memberCount = group.members.length; group.updatedAt = new Date().toISOString();
    await saveData();
    res.json({ success: true, message: "Left group successfully", group });
  } catch (err) {
    console.error("❌ Error leaving group:", err);
    res.status(500).json({ success: false, error: "Failed to leave group" });
  }
});

module.exports = router;