const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data');
const { hasRole } = require('../permissions');

// Helper: resolve target from ID or username
function resolveTarget(input) {
  if (!input) return null;
  // Try as number ID first
  const byId = Object.values(data.accounts).find(a => a.id === Number(input));
  if (byId) return byId;
  // Try as username
  const byName = data.accounts[input];
  return byName || null;
}

// Helper: check if target is the same as actor
function isSelf(actorId, target) {
  return Number(actorId) === Number(target.id);
}

// Get own role
router.get('/role/:userId', (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const profile = Object.values(data.userProfiles).find(p => p.id === userId);
    const account = Object.values(data.accounts).find(a => a.id === userId);
    const role = account?.role || profile?.role || 'user';
    res.json({ success: true, id: userId, role });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get staff list
router.get('/staff', (req, res) => {
  try {
    const staff = Object.values(data.accounts)
      .filter(a => ['owner', 'admin', 'moderator'].includes(a.role))
      .map(a => ({ id: a.id, username: Object.keys(data.accounts).find(k => data.accounts[k] === a), role: a.role }));
    res.json({ success: true, staff });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Set user role ✅ WITH SELF-PROTECTION
router.post('/set-role', (req, res) => {
  try {
    const { actorId, target, role } = req.body;
    if (!actorId || !target || !role) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    // Check actor permission
    if (!hasRole(actorId, 'admin', data)) {
      return res.status(403).json({ success: false, error: 'No permission' });
    }

    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);
    if (!actor || !targetAcc) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // ❌ BLOCK: Owner cannot change their own role
    if (actor.role === 'owner' && isSelf(actorId, targetAcc)) {
      return res.status(403).json({ success: false, error: 'Owner cannot change their own role' });
    }

    // ❌ BLOCK: Cannot remove the only existing owner
    const ownerCount = Object.values(data.accounts).filter(a => a.role === 'owner').length;
    if (targetAcc.role === 'owner' && role !== 'owner' && ownerCount <= 1) {
      return res.status(403).json({ success: false, error: 'Cannot remove the only owner' });
    }

    // ❌ BLOCK: Lower rank cannot promote higher rank
    const rank = { user: 0, moderator: 1, admin: 2, owner: 3 };
    if (rank[actor.role] <= rank[targetAcc.role]) {
      return res.status(403).json({ success: false, error: 'Cannot modify equal or higher rank' });
    }

    // Update in both places
    targetAcc.role = role;
    const profile = Object.values(data.userProfiles).find(p => p.id === targetAcc.id);
    if (profile) profile.role = role;

    data.moderationLogs.push({
      type: 'SET_ROLE',
      actorId,
      targetId: targetAcc.id,
      oldRole: targetAcc.role,
      newRole: role,
      timestamp: new Date().toISOString()
    });

    saveData();
    res.json({ success: true, message: 'Role updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Ban user ✅ WITH SELF-PROTECTION
router.post('/ban', (req, res) => {
  try {
    const { actorId, target, reason = 'No reason provided', days = null } = req.body;
    if (!actorId || !target) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    if (!hasRole(actorId, 'moderator', data)) {
      return res.status(403).json({ success: false, error: 'No permission' });
    }

    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);
    if (!actor || !targetAcc) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // ❌ BLOCK: Cannot ban yourself
    if (isSelf(actorId, targetAcc)) {
      return res.status(403).json({ success: false, error: 'You cannot ban yourself' });
    }

    // ❌ BLOCK: Cannot ban equal or higher rank
    const rank = { user: 0, moderator: 1, admin: 2, owner: 3 };
    if (rank[actor.role] <= rank[targetAcc.role]) {
      return res.status(403).json({ success: false, error: 'Cannot ban equal or higher rank' });
    }

    const banUntil = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
    targetAcc.banned = true;
    targetAcc.banReason = reason;
    targetAcc.banUntil = banUntil;

    data.moderationLogs.push({
      type: 'BAN',
      actorId,
      targetId: targetAcc.id,
      reason,
      banUntil,
      timestamp: new Date().toISOString()
    });

    saveData();
    res.json({ success: true, message: 'User banned' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Unban user ✅ WITH SELF-PROTECTION
router.post('/unban', (req, res) => {
  try {
    const { actorId, target } = req.body;
    if (!actorId || !target) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    if (!hasRole(actorId, 'moderator', data)) {
      return res.status(403).json({ success: false, error: 'No permission' });
    }

    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);
    if (!actor || !targetAcc) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // ❌ BLOCK: Cannot unban yourself (makes no sense anyway)
    if (isSelf(actorId, targetAcc)) {
      return res.status(403).json({ success: false, error: 'You cannot unban yourself' });
    }

    targetAcc.banned = false;
    targetAcc.banReason = '';
    targetAcc.banUntil = null;

    data.moderationLogs.push({
      type: 'UNBAN',
      actorId,
      targetId: targetAcc.id,
      timestamp: new Date().toISOString()
    });

    saveData();
    res.json({ success: true, message: 'User unbanned' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Delete account ✅ WITH SELF-PROTECTION
router.post('/delete-account', (req, res) => {
  try {
    const { actorId, target } = req.body;
    if (!actorId || !target) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    if (!hasRole(actorId, 'owner', data)) {
      return res.status(403).json({ success: false, error: 'Only owner can delete accounts' });
    }

    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);
    if (!actor || !targetAcc) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // ❌ BLOCK: Cannot delete yourself
    if (isSelf(actorId, targetAcc)) {
      return res.status(403).json({ success: false, error: 'You cannot delete your own account' });
    }

    // ❌ BLOCK: Cannot delete the only existing owner
    const ownerCount = Object.values(data.accounts).filter(a => a.role === 'owner').length;
    if (targetAcc.role === 'owner' && ownerCount <= 1) {
      return res.status(403).json({ success: false, error: 'Cannot delete the only owner account' });
    }

    const username = Object.keys(data.accounts).find(k => data.accounts[k] === targetAcc);
    if (!username) return res.status(404).json({ success: false, error: 'Account not found' });

    // Remove from all data stores
    delete data.accounts[username];
    delete data.userProfiles[username];
    delete data.registeredNames[username.toLowerCase()];
    delete data.usernameToId[username];

    data.moderationLogs.push({
      type: 'DELETE_ACCOUNT',
      actorId,
      targetId: targetAcc.id,
      timestamp: new Date().toISOString()
    });

    saveData();
    res.json({ success: true, message: 'Account deleted permanently' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get moderation logs
router.get('/logs', (req, res) => {
  try {
    if (!hasRole(req.query.actorId, 'admin', data)) {
      return res.status(403).json({ success: false, error: 'No permission' });
    }
    res.json({ success: true, logs: data.moderationLogs || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;