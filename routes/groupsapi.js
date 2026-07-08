const express = require('express');
const router = express.Router();

let groups = [];
let nextGroupId = 1;

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
      joinable: true,
      ranks: {
        owner: [creatorId],
        members: []
      },
      membersCount: 1
    };

    groups.push(newGroup);
    return res.json({ success: true, group: newGroup });
  } catch (err) {
    console.error("Create group error:", err);
    return res.json({ success: false, error: "Server error" });
  }
});

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

router.post('/join', (req, res) => {
  try {
    const { groupId, userId } = req.body;
    const group = groups.find(g => g.id === parseInt(groupId));

    if (!group) return res.json({ success: false, error: "Group not found" });
    if (!group.joinable) return res.json({ success: false, error: "This group is not open for joining" });
    if (group.ranks.owner.includes(userId)) return res.json({ success: false, error: "You are already the owner" });
    if (group.ranks.members.includes(userId)) return res.json({ success: false, error: "You are already a member" });

    group.ranks.members.push(userId);
    group.membersCount = group.ranks.owner.length + group.ranks.members.length;

    return res.json({ success: true, message: "Successfully joined the group" });
  } catch (err) {
    console.error("Join group error:", err);
    return res.json({ success: false, error: "Server error" });
  }
});

router.post('/leave', (req, res) => {
  try {
    const { groupId, userId } = req.body;
    const group = groups.find(g => g.id === parseInt(groupId));

    if (!group) return res.json({ success: false, error: "Group not found" });
    if (group.ranks.owner.includes(userId)) return res.json({ success: false, error: "Owner cannot leave — delete the group instead" });
    if (!group.ranks.members.includes(userId)) return res.json({ success: false, error: "You are not in this group" });

    group.ranks.members = group.ranks.members.filter(memberId => memberId !== userId);
    group.membersCount = group.ranks.owner.length + group.ranks.members.length;

    return res.json({ success: true, message: "Successfully left the group" });
  } catch (err) {
    console.error("Leave group error:", err);
    return res.json({ success: false, error: "Server error" });
  }
});

module.exports = router;