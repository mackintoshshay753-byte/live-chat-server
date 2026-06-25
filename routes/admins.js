const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data');
const { hasRole } = require('./permissions');

// Initialize deleted accounts storage if not exists
if (!data.deletedAccounts) data.deletedAccounts = {};

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

// Helper: resolve from deleted accounts
function resolveDeletedTarget(input) {
  if (!input) return null;
  const byId = Object.values(data.deletedAccounts).find(a => a.id === Number(input));
  if (byId) return byId;
  const byName = data.deletedAccounts[input];
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

    if (!hasRole(actorId, 'admin', data)) {
      return res.status(403).json({ success: false, error: 'No permission' });
    }

    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);
    if (!actor || !targetAcc) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (actor.role === 'owner' && isSelf(actorId, targetAcc)) {
      return res.status(403).json({ success: false, error: 'Owner cannot change their own role' });
    }

    const ownerCount = Object.values(data.accounts).filter(a => a.role === 'owner').length;
    if (targetAcc.role === 'owner' && role !== 'owner' && ownerCount <= 1) {
      return res.status(403).json({ success: false, error: 'Cannot remove the only owner' });
    }

    const rank = { user: 0, moderator: 1, admin: 2, owner: 3 };
    if (rank[actor.role] <= rank[targetAcc.role]) {
      return res.status(403).json({ success: false, error: 'Cannot modify equal or higher rank' });
    }

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

    if (isSelf(actorId, targetAcc)) {
      return res.status(403).json({ success: false, error: 'You cannot ban yourself' });
    }

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

// Delete account ✅ MOVES TO ARCHIVE INSTEAD OF PERMANENT DELETE
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
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    if (isSelf(actorId, targetAcc)) {
      return res.status(403).json({ success: false, error: 'You cannot delete your own account' });
    }

    const ownerCount = Object.values(data.accounts).filter(a => a.role === 'owner').length;
    if (targetAcc.role === 'owner' && ownerCount <= 1) {
      return res.status(403).json({ success: false, error: 'Cannot delete the only owner account' });
    }

    const username = Object.keys(data.accounts).find(k => data.accounts[k] === targetAcc);
    if (!username) return res.status(404).json({ success: false, error: 'Account not found' });

    // Save full data to deleted archive
    data.deletedAccounts[username] = {
      account: { ...targetAcc },
      profile: { ...data.userProfiles[username] || {} },
      registeredName: data.registeredNames[username.toLowerCase()] || null,
      idMap: data.usernameToId[username] || null,
      deletedAt: new Date().toISOString()
    };

    // Remove from active data
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
    res.json({ success: true, message: 'Account deleted and archived' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ✅ NEW: Recover Deleted Account
router.post('/recover-account', (req, res) => {
  try {
    const { actorId, target } = req.body;
    if (!actorId || !target) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    if (!hasRole(actorId, 'owner', data)) {
      return res.status(403).json({ success: false, error: 'Only owner can recover accounts' });
    }

    const deletedEntry = resolveDeletedTarget(target);
    if (!deletedEntry) {
      return res.status(404).json({ success: false, error: 'Deleted account not found' });
    }

    const username = Object.keys(data.deletedAccounts).find(k => data.deletedAccounts[k] === deletedEntry);
    if (!username) return res.status(404).json({ success: false, error: 'Account not found in archive' });

    // Restore back to active data
    data.accounts[username] = deletedEntry.account;
    if (deletedEntry.profile) data.userProfiles[username] = deletedEntry.profile;
    if (deletedEntry.registeredName) data.registeredNames[username.toLowerCase()] = deletedEntry.registeredName;
    if (deletedEntry.idMap) data.usernameToId[username] = deletedEntry.idMap;

    // Remove from archive
    delete data.deletedAccounts[username];

    data.moderationLogs.push({
      type: 'RECOVER_ACCOUNT',
      actorId,
      targetId: deletedEntry.account.id,
      timestamp: new Date().toISOString()
    });

    saveData();
    res.json({ success: true, message: 'Account restored successfully' });
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