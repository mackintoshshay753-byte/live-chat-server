const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { data, saveData } = require('../data');
const { hasRole } = require('./permissions');

if (!data.deletedAccounts) data.deletedAccounts = {};

const ACTUAL_OWNER_USERNAME = "sadieandshay87";
const RANKS = { user: 0, moderator: 1, admin: 2, owner: 3 };

const resolveTarget = input => {
  if (!input) return null;
  const numId = Number(input);
  return !isNaN(numId) ? Object.values(data.accounts).find(a => a.id === numId) || null : data.accounts[String(input)] || null;
};

const resolveDeletedTarget = input => {
  if (!input) return null;
  const numId = Number(input);
  return !isNaN(numId) ? Object.values(data.deletedAccounts).find(e => e.account.id === numId) || null : data.deletedAccounts[String(input).trim()] || null;
};

const getUsername = account => Object.keys(data.accounts).find(k => data.accounts[k] === account) || null;
const isSelf = (actorId, targetAcc) => Number(actorId) === Number(targetAcc.id);
const isMainOwner = user => {
  const un = typeof user === "string" ? user : getUsername(user);
  return un?.toLowerCase() === ACTUAL_OWNER_USERNAME.toLowerCase();
};
const canInteract = (actor, targetAcc) => {
  if (!actor || !targetAcc) return false;
  if (isSelf(actor.id, targetAcc)) return false;
  if (isMainOwner(targetAcc)) return false;
  if (isMainOwner(actor)) return true;
  return RANKS[actor.role] > RANKS[targetAcc.role];
};

router.get('/role/:userId', (req, res) => {
  try {
    const acc = Object.values(data.accounts).find(a => a.id === Number(req.params.userId));
    res.json({ success: true, id: Number(req.params.userId), role: acc?.role || "user" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.get('/staff', (req, res) => {
  try {
    const staff = Object.values(data.accounts).filter(a => ["owner", "admin", "moderator"].includes(a.role)).map(a => ({ 
      id: a.id, 
      username: getUsername(a), 
      role: a.role,
      banned: a.banned || false
    }));
    res.json({ success: true, staff });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post('/set-role', (req, res) => {
  try {
    const { actorId, target, role } = req.body;
    if (!actorId || !target || !role) return res.status(400).json({ success: false, error: "Missing fields" });
    if (!hasRole(actorId, "admin", data)) return res.status(403).json({ success: false, error: "No permission" });
    const actor = resolveTarget(actorId), targetAcc = resolveTarget(target);
    if (!actor || !targetAcc) return res.status(404).json({ success: false, error: "User not found" });
    if (!canInteract(actor, targetAcc)) return res.status(403).json({ success: false, error: "You cannot modify this account" });
    if (targetAcc.role === "owner" && role !== "owner" && Object.values(data.accounts).filter(a => a.role === "owner").length <= 1)
      return res.status(403).json({ success: false, error: "Cannot remove the only owner" });
    const oldRole = targetAcc.role; targetAcc.role = role;
    const profile = Object.values(data.userProfiles).find(p => p.id === targetAcc.id);
    if (profile) profile.role = role;
    data.moderationLogs.push({ type: "SET_ROLE", actorId, actorName: getUsername(actor), targetId: targetAcc.id, targetName: getUsername(targetAcc), oldRole, newRole: role, timestamp: new Date().toISOString() });
    saveData();
    res.json({ success: true, message: "Role updated" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post('/ban', (req, res) => {
  try {
    const { actorId, target, reason = "No reason", days = null } = req.body;
    if (!actorId || !target) return res.status(400).json({ success: false, error: "Missing fields" });
    if (!hasRole(actorId, "moderator", data)) return res.status(403).json({ success: false, error: "No permission" });
    const actor = resolveTarget(actorId), targetAcc = resolveTarget(target);
    if (!actor || !targetAcc) return res.status(404).json({ success: false, error: "User not found" });
    if (!canInteract(actor, targetAcc)) return res.status(403).json({ success: false, error: "You cannot ban this account" });
    const banUntil = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
    Object.assign(targetAcc, { banned: true, banReason: reason, banUntil });
    data.moderationLogs.push({ type: "BAN", actorId, actorName: getUsername(actor), targetId: targetAcc.id, targetName: getUsername(targetAcc), reason, banUntil, timestamp: new Date().toISOString() });
    saveData();
    res.json({ success: true, message: "User banned" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post('/unban', (req, res) => {
  try {
    const { actorId, target } = req.body;
    if (!actorId || !target) return res.status(400).json({ success: false, error: "Missing fields" });
    if (!hasRole(actorId, "moderator", data)) return res.status(403).json({ success: false, error: "No permission" });
    const actor = resolveTarget(actorId), targetAcc = resolveTarget(target);
    if (!actor || !targetAcc) return res.status(404).json({ success: false, error: "User not found" });
    if (!canInteract(actor, targetAcc)) return res.status(403).json({ success: false, error: "You cannot unban this account" });
    Object.assign(targetAcc, { banned: false, banReason: "", banUntil: null });
    data.moderationLogs.push({ type: "UNBAN", actorId, actorName: getUsername(actor), targetId: targetAcc.id, targetName: getUsername(targetAcc), timestamp: new Date().toISOString() });
    saveData();
    res.json({ success: true, message: "User unbanned" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post('/delete-account', (req, res) => {
  try {
    const { actorId, target } = req.body;
    if (!actorId || !target) return res.status(400).json({ success: false, error: "Missing fields" });
    if (!hasRole(actorId, "owner", data)) return res.status(403).json({ success: false, error: "Only owners can delete accounts" });
    const actor = resolveTarget(actorId), targetAcc = resolveTarget(target);
    if (!actor || !targetAcc) return res.status(404).json({ success: false, error: "Account not found" });
    if (!canInteract(actor, targetAcc)) return res.status(403).json({ success: false, error: "You cannot delete this account" });
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
    data.moderationLogs.push({ type: "DELETE_ACCOUNT", actorId, actorName: getUsername(actor), targetId: targetAcc.id, targetName: username, timestamp: new Date().toISOString() });
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
    if (!actorId || !target) return res.status(400).json({ success: false, error: "Missing fields" });
    if (!hasRole(actorId, "owner", data)) return res.status(403).json({ success: false, error: "Only owners can recover accounts" });
    const deletedEntry = resolveDeletedTarget(target);
    if (!deletedEntry) return res.status(404).json({ success: false, error: "Deleted account not found" });
    const username = Object.keys(data.deletedAccounts).find(k => data.deletedAccounts[k] === deletedEntry);
    if (!username) return res.status(404).json({ success: false, error: "Archive entry not found" });
    if (!deletedEntry.account.joinDate) deletedEntry.account.joinDate = new Date().toISOString();
    if (deletedEntry.profile) {
      deletedEntry.profile.joinDate = deletedEntry.profile.joinDate || new Date().toISOString();
      deletedEntry.profile.gender = deletedEntry.profile.gender || "";
      deletedEntry.profile.birthday = deletedEntry.profile.birthday || null;
    }
    data.accounts[username] = deletedEntry.account;
    if (deletedEntry.profile) data.userProfiles[username] = deletedEntry.profile;
    if (deletedEntry.registeredName) data.registeredNames[username.toLowerCase()] = deletedEntry.registeredName;
    if (deletedEntry.idMap) data.usernameToId[username] = deletedEntry.idMap;
    delete data.deletedAccounts[username];
    data.moderationLogs.push({ type: "RECOVER_ACCOUNT", actorId, actorName: getUsername(resolveTarget(actorId)), targetId: deletedEntry.account.id, timestamp: new Date().toISOString() });
    saveData();
    res.json({ success: true, message: "Account restored" });
  } catch (err) {
    console.error("Recover error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.get('/logs', (req, res) => {
  try {
    if (!hasRole(req.query.actorId, "admin", data)) return res.status(403).json({ success: false, error: "No permission" });
    res.json({ success: true, logs: data.moderationLogs || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ✅ FULLY UPDATED CREATE ACCOUNT ROUTE WITH AVATAR SUPPORT
router.post('/create-account', async (req, res) => {
  try {
    const { 
      actorId, username, password, role = "user", gender = "", birthday = "",
      headAvatar, thumbnailAvatar
    } = req.body;

    if (!actorId || !username || !password || !gender || !birthday || !headAvatar || !thumbnailAvatar) 
      return res.status(400).json({ success: false, error: "All fields including avatar images are required" });

    const actor = resolveTarget(actorId);
    if (!actor || !isMainOwner(actor)) 
      return res.status(403).json({ success: false, error: "Access denied" });

    const clean = username.trim(), lower = clean.toLowerCase();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(clean)) 
      return res.status(400).json({ success: false, error: "Invalid username" });

    if (data.accounts[clean] || data.deletedAccounts[clean] || data.registeredNames[lower]) 
      return res.status(409).json({ success: false, error: "Username taken" });

    if (!(password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password))) 
      return res.status(400).json({ success: false, error: "Weak password" });

    const finalRole = ["user", "moderator", "admin", "owner"].includes(role) ? role : "user";

    let newId = data.nextUserId;
    while (Object.values(data.accounts).some(a => a.id === newId) || Object.values(data.deletedAccounts).some(d => d.account.id === newId)) newId++;
    data.nextUserId = newId + 1;

    const joinDate = new Date().toISOString();
    const hash = await bcrypt.hash(password, 12);

    // Convert birthday from "YYYY-MM-DD" to your object format
    const birthdayParts = birthday.split("-");
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const birthdayObj = {
      month: monthNames[parseInt(birthdayParts[1]) - 1],
      day: parseInt(birthdayParts[2]),
      year: parseInt(birthdayParts[0])
    };

    const newAccount = { 
      id: newId, 
      hash, 
      role: finalRole, 
      banned: false, 
      banReason: "", 
      banUntil: null, 
      joinDate, 
      theme: "light", 
      verified: false,
      // Store custom avatars directly on the account
      customHead: headAvatar,
      customThumbnail: thumbnailAvatar
    };

    const newProfile = { 
      id: newId, 
      username: clean, 
      role: finalRole, 
      joinDate, 
      gender: gender.charAt(0).toUpperCase() + gender.slice(1),
      birthday: birthdayObj,
      isOnline: false, 
      lastOnline: null, 
      createdAt: joinDate,
      // Also add to profile for easy access
      headAvatar: headAvatar,
      thumbnailAvatar: thumbnailAvatar
    };

    data.accounts[clean] = newAccount;
    data.userProfiles[clean] = newProfile;
    data.registeredNames[lower] = clean;
    data.usernameToId[clean] = newId;

    data.moderationLogs.push({ 
      type: "CREATE_ACCOUNT", 
      actorId, 
      actorName: getUsername(actor), 
      targetId: newId, 
      targetName: clean, 
      role: finalRole, 
      timestamp: joinDate 
    });

    await saveData();
    res.json({ success: true, accountId: newId, username: clean, role: finalRole });
  } catch (err) {
    console.error("Create account error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;