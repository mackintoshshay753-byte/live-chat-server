const express = require('express');
const router  = express.Router();
const { data, saveData } = require('../data');

// ─── Auth middleware ──────────────────────────────────────────
// Same pattern as groupsapi — verifies requestingUserId exists.
// Replace with signed session/JWT verification for production.
function requireUser(req, res, next) {
  const id = Number(req.body.requestingUserId ?? req.params.userId);
  if (!id) return res.status(401).json({ error: 'Not authenticated' });

  const exists = Object.values(data.accounts).some(a => a.id === id);
  if (!exists) return res.status(401).json({ error: 'Not authenticated' });

  req.authedUserId = id;
  next();
}

// ─── Helper: resolve username from ID ────────────────────────
function usernameById(id) {
  return Object.keys(data.accounts).find(k => data.accounts[k].id === id) ?? null;
}

// ─── POST /api/friends/request ────────────────────────────────
router.post('/request', requireUser, (req, res) => {
  const toId = Number(req.body.toId);
  const fromId = req.authedUserId; // never trust fromId from body

  if (!toId || toId === fromId)
    return res.status(400).json({ success: false, error: 'Invalid target' });

  // Verify target user exists
  if (!usernameById(toId))
    return res.status(404).json({ success: false, error: 'User not found' });

  const alreadyFriends = data.friends[fromId]?.includes(toId);
  if (alreadyFriends)
    return res.status(409).json({ success: false, error: 'Already friends' });

  if (!data.friendRequests[toId]) data.friendRequests[toId] = [];

  const alreadyRequested = data.friendRequests[toId].some(r => r.fromId === fromId);
  if (alreadyRequested)
    return res.status(409).json({ success: false, error: 'Request already sent' });

  // Resolve username server-side — never from body
  const fromUsername = usernameById(fromId);

  data.friendRequests[toId].push({
    fromId,
    fromUsername,
    timestamp: new Date().toISOString(),
  });
  saveData();
  res.json({ success: true });
});

// ─── GET /api/friends/requests/:userId ───────────────────────
// Only the authenticated user can read their own requests.
router.get('/requests/:userId', requireUser, (req, res) => {
  const userId = Number(req.params.userId);

  if (userId !== req.authedUserId)
    return res.status(403).json({ error: 'Forbidden' });

  res.json({ requests: data.friendRequests[userId] ?? [] });
});

// ─── POST /api/friends/accept ─────────────────────────────────
router.post('/accept', requireUser, (req, res) => {
  const fromId = Number(req.body.fromId);
  const toId   = req.authedUserId; // the accepter must be the authenticated user

  if (!fromId)
    return res.status(400).json({ success: false, error: 'Missing fromId' });

  // Verify there is actually a pending request
  const pending = data.friendRequests[toId]?.some(r => r.fromId === fromId);
  if (!pending)
    return res.status(404).json({ success: false, error: 'No pending request from that user' });

  // Remove the request
  data.friendRequests[toId] = data.friendRequests[toId].filter(r => r.fromId !== fromId);

  // Add friendship both ways (guard against duplicates)
  if (!data.friends[fromId]) data.friends[fromId] = [];
  if (!data.friends[toId])   data.friends[toId]   = [];
  if (!data.friends[fromId].includes(toId))   data.friends[fromId].push(toId);
  if (!data.friends[toId].includes(fromId))   data.friends[toId].push(fromId);

  saveData();
  res.json({ success: true });
});

// ─── POST /api/friends/reject ─────────────────────────────────
router.post('/reject', requireUser, (req, res) => {
  const fromId = Number(req.body.fromId);
  const toId   = req.authedUserId;

  if (!fromId)
    return res.status(400).json({ success: false, error: 'Missing fromId' });

  const before = data.friendRequests[toId]?.length ?? 0;
  if (data.friendRequests[toId]) {
    data.friendRequests[toId] = data.friendRequests[toId].filter(r => r.fromId !== fromId);
  }
  const removed = before !== (data.friendRequests[toId]?.length ?? 0);

  if (removed) saveData();
  // Return success regardless — idempotent reject is fine,
  // but now we only write to disk if something actually changed.
  res.json({ success: true });
});

// ─── POST /api/friends/unfriend ───────────────────────────────
router.post('/unfriend', requireUser, (req, res) => {
  const friendId = Number(req.body.friendId);
  const userId   = req.authedUserId;

  if (!friendId || friendId === userId)
    return res.status(400).json({ success: false, error: 'Invalid target' });

  if (data.friends[userId])
    data.friends[userId]   = data.friends[userId].filter(id => id !== friendId);
  if (data.friends[friendId])
    data.friends[friendId] = data.friends[friendId].filter(id => id !== userId);

  saveData();
  res.json({ success: true });
});

// ─── GET /api/friends/list/:userId ────────────────────────────
// Only the authenticated user can read their own friends list.
router.get('/list/:userId', requireUser, (req, res) => {
  const userId = Number(req.params.userId);

  if (userId !== req.authedUserId)
    return res.status(403).json({ error: 'Forbidden' });

  const friendIds = data.friends[userId] ?? [];

  const friends = Object.entries(data.accounts)
    .filter(([, info]) => friendIds.includes(info.id))
    .map(([username, info]) => ({ id: info.id, username }));

  res.json({ friends });
});

module.exports = router;