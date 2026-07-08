// backend/api/groups.js
const express = require('express');
const router = express.Router();

// In‑memory storage (replace with DB later if you want)
let groups = [];
let nextGroupId = 1;

// CREATE GROUP
router.post('/create', express.json(), (req, res) => {
  try {
    const { creatorId, creatorUsername, name, description, icon } = req.body;

    // Basic validation
    if (!creatorId || !creatorUsername || !name) {
      return res.json({ success: false, error: 'Missing required fields' });
    }

    const newGroup = {
      id: nextGroupId++,
      creatorId,
      creatorUsername,
      name,
      description: description || '',
      icon: icon || 'https://example.com/default-group-icon.png',
      createdAt: new Date().toISOString(),
      members: [creatorId], // creator joins automatically
      membersCount: 1
    };

    groups.push(newGroup);
    return res.json({ success: true, group: newGroup });
  } catch (err) {
    console.error('Create group error:', err);
    return res.json({ success: false, error: 'Server error' });
  }
});

// GET SINGLE GROUP
router.get('/group', (req, res) => {
  const id = parseInt(req.query.id);
  const group = groups.find(g => g.id === id);
  if (!group) return res.json({ success: false, error: 'Group not found' });
  return res.json({ success: true, group });
});

module.exports = router;