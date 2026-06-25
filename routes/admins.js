const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data');
const { hasRole } = require('./permissions');

// Initialize deleted accounts storage if not exists
if (!data.deletedAccounts) data.deletedAccounts = {};

const ACTUAL_OWNER_USERNAME = "sadieandshay87";
const RANKS = { user: 0, moderator: 1, admin: 2, owner: 3 };

// ----------------------
// Helpers
// ----------------------
function resolveTarget(input) {
  if (!input) return null;
  const numId = Number(input);
  if (!isNaN(numId)) {
    return Object.values(data.accounts).find(a => a.id === numId) || null;
  }
  return data.accounts[String(input)] || null;
}

function resolveDeletedTarget(input) {
  if (!input) return null;
  const numId = Number(input);
  if (!isNaN(numId)) {
    return Object.values(data.deletedAccounts).find(e => e.account.id === numId) || null;
  }
  return data.deletedAccounts[String(input).trim()] || null;
}

function getUsername(account) {
  return Object.keys(data.accounts).find(k => data.accounts[k] === account) || null;
}

function isSelf(actorId, targetAcc) {
  return Number(actorId) === Number(targetAcc.id);
}

function isMainOwner(user) {
  const un = typeof user === "string" ? user : getUsername(user);
  return un?.toLowerCase() === ACTUAL_OWNER_USERNAME.toLowerCase();
}

function canInteract(actor, targetAcc) {
  if (!actor || !targetAcc) return false;
  if (isSelf(actor.id, targetAcc)) return false;
  if (isMainOwner(targetAcc)) return false; // No one can touch main owner
  if (isMainOwner(actor)) return true; // Main owner can touch anyone else
  return RANKS[actor.role] > RANKS[targetAcc.role]; // Only higher rank can act
}

// ----------------------
// Routes
// ----------------------

router.get('/role/:userId', (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const acc = Object.values(data.accounts).find(a => a.id === userId);
    const role = acc?.role || "user";
    res.json({ success: true, id: userId, role });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.get('/staff', (req, res) => {
  try {
    const staff = Object.values(data.accounts)
      .filter(a => ["owner", "admin", "moderator"].includes(a.role))
      .map(a => ({ id: a.id, username: getUsername(a), role: a.role }));
    res.json({ success: true, staff });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post('/set-role', (req, res) => {
  try {
    const { actorId, target, role } = req.body;
    if (!actorId || !target || !role)
      return res.status(400).json({ success: false, error: "Missing fields" });

    if (!hasRole(actorId, "admin", data))
      return res.status(403).json({ success: false, error: "No permission" });

    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);
    if (!actor || !targetAcc)
      return res.status(404).json({ success: false, error: "User not found" });

    if (!canInteract(actor, targetAcc))
      return res.status(403).json({ success: false, error: "You cannot modify this account" });

    // Prevent removing last owner
    if (targetAcc.role === "owner" && role !== "owner") {
      const ownerCount = Object.values(data.accounts).filter(a => a.role === "owner").length;
      if (ownerCount <= 1)
        return res.status(403).json({ success: false, error: "Cannot remove the only owner" });
    }

    const oldRole = targetAcc.role;
    targetAcc.role = role;
    const profile = Object.values(data.userProfiles).find(p => p.id === targetAcc.id);
    if (profile) profile.role = role;

    data.moderationLogs.push({
      type: "SET_ROLE",
      actorId,
      actorName: getUsername(actor),
      targetId: targetAcc.id,
      targetName: getUsername(targetAcc),
      oldRole,
      newRole: role,
      timestamp: new Date().toISOString()
    });

    saveData();
    res.json({ success: true, message: "Role updated" });
  } catch (err) {
    console.error("Set role:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post('/ban', (req, res) => {
  try {
    const { actorId, target, reason = "No reason", days = null } = req.body;
    if (!actorId || !target)
      return res.status(400).json({ success: false, error: "Missing fields" });

    if (!hasRole(actorId, "moderator", data))
      return res.status(403).json({ success: false, error: "No permission" });

    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);
    if (!actor || !targetAcc)
      return res.status(404).json({ success: false, error: "User not found" });

    if (!canInteract(actor, targetAcc))
      return res.status(403).json({ success: false, error: "You cannot ban this account" });

    const banUntil = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
    targetAcc.banned = true;
    targetAcc.banReason = reason;
    targetAcc.banUntil = banUntil;

    data.moderationLogs.push({
      type: "BAN",
      actorId,
      actorName: getUsername(actor),
      targetId: targetAcc.id,
      targetName: getUsername(targetAcc),
      reason,
      banUntil,
      timestamp: new Date().toISOString()
    });

    saveData();
    res.json({ success: true, message: "User banned" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post('/unban', (req, res) => {
  try {
    const { actorId, target } = req.body;
    if (!actorId || !target)
      return res.status(400).json({ success: false, error: "Missing fields" });

    if (!hasRole(actorId, "moderator", data))
      return res.status(403).json({ success: false, error: "No permission" });

    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);
    if (!actor || !targetAcc)
      return res.status(404).json({ success: false, error: "User not found" });

    if (!canInteract(actor, targetAcc))
      return res.status(403).json({ success: false, error: "You cannot unban this account" });

    targetAcc.banned = false;
    targetAcc.banReason = "";
    targetAcc.banUntil = null;

    data.moderationLogs.push({
      type: "UNBAN",
      actorId,
      actorName: getUsername(actor),
      targetId: targetAcc.id,
      targetName: getUsername(targetAcc),
      timestamp: new Date().toISOString()
    });

    saveData();
    res.json({ success: true, message: "User unbanned" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post('/delete-account', (req, res) => {
  try {
    const { actorId, target } = req.body;
    if (!actorId || !target)
      return res.status(400).json({ success: false, error: "Missing fields" });

    if (!hasRole(actorId, "owner", data))
      return res.status(403).json({ success: false, error: "Only owners can delete accounts" });

    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);
    if (!actor || !targetAcc)
      return res.status(404).json({ success: false, error: "Account not found" });

    if (!canInteract(actor, targetAcc))
      return res.status(403).json({ success: false, error: "You cannot delete this account" });

    const username = getUsername(targetAcc);
    data.deletedAccounts[username] = {
      account: { ...targetAcc },
      profile: { ...data.userProfiles[username] || {} },
      registeredName: data.registeredNames[username.toLowerCase()] || null,
      idMap: data.usernameToId[username] || null,
      deletedAt: new Date().toISOString(),
      deletedBy: getUsername(actor)
    };

    delete data.accounts[username];
    delete data.userProfiles[username];
    delete data.registeredNames[username.toLowerCase()];
    delete data.usernameToId[username];

    data.moderationLogs.push({
      type: "DELETE_ACCOUNT",
      actorId,
      actorName: getUsername(actor),
      targetId: targetAcc.id,
      targetName: username,
      timestamp: new Date().toISOString()
    });

    saveData();
    res.json({ success: true, message: "Account deleted and archived" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post('/recover-account', (req, res) => {
  try {
    const { actorId, target } = req.body;
    if (!actorId || !target)
      return res.status(400).json({ success: false, error: "Missing fields" });

    if (!hasRole(actorId, "owner", data))
      return res.status(403).json({ success: false, error: "Only owners can recover accounts" });

    const deletedEntry = resolveDeletedTarget(target);
    if (!deletedEntry)
      return res.status(404).json({ success: false, error: "Deleted account not found" });

    const username = Object.keys(data.deletedAccounts).find(k => data.deletedAccounts[k] === deletedEntry);
    if (!username)
      return res.status(404).json({ success: false, error: "Archive entry not found" });

    // Restore
    data.accounts[username] = deletedEntry.account;
    if (deletedEntry.profile) data.userProfiles[username] = deletedEntry.profile;
    if (deletedEntry.registeredName) data.registeredNames[username.toLowerCase()] = deletedEntry.registeredName;
    if (deletedEntry.idMap) data.usernameToId[username] = deletedEntry.idMap;

    delete data.deletedAccounts[username];

    data.moderationLogs.push({
      type: "RECOVER_ACCOUNT",
      actorId,
      actorName: getUsername(resolveTarget(actorId)),
      targetId: deletedEntry.account.id,
      timestamp: new Date().toISOString()
    });

    saveData();
    res.json({ success: true, message: "Account restored" });
  } catch (err) {
    console.error("Recover error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.get('/logs', (req, res) => {
  try {
    if (!hasRole(req.query.actorId, "admin", data))
      return res.status(403).json({ success: false, error: "No permission" });
    res.json({ success: true, logs: data.moderationLogs || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;