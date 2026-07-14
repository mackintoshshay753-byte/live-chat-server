const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { data, saveData, OWNER_USER_ID, getDefaultOutfitIdForGender } = require('../data'); // ✅ Import fixed owner ID
const { hasRole } = require('./permissions');
const { assignPermanentDefaultOutfit } = require('../sockets');

if (!data.deletedAccounts) data.deletedAccounts = {};
if (!data.outfitCatalog) data.outfitCatalog = {};
if (!data.userOutfits) data.userOutfits = {};
if (!data.nextOutfitId) data.nextOutfitId = 1;
if (!data.moderationLogs) data.moderationLogs = [];
if (!data.nextUserId) data.nextUserId = 1000;
if (!data.userProfiles) data.userProfiles = {};
if (!data.registeredNames) data.registeredNames = {};
if (!data.usernameToId) data.usernameToId = {};

const RANKS = { user: 0, moderator: 1, admin: 2, owner: 3 };

const resolveTarget = input => {
  if (!input) return null;
  const numId = Number(input);
  return !isNaN(numId) ? Object.values(data.accounts).find(a => Number(a.id) === numId) || null : data.accounts[String(input)] || null;
};

const resolveDeletedTarget = input => {
  if (!input) return null;
  const numId = Number(input);
  return !isNaN(numId) ? Object.values(data.deletedAccounts).find(e => Number(e.account.id) === numId) || null : data.deletedAccounts[String(input).trim()] || null;
};

const getUsername = account => {
  if (!account) return null;
  return Object.keys(data.accounts).find(k => data.accounts[k] === account) || null;
};

const isSelf = (actorId, targetAcc) => Number(actorId) === Number(targetAcc.id);

// ✅ Fixed: Check owner by ID instead of username
const isMainOwner = user => {
  if (!user) return false;
  const checkId = typeof user === "object" ? Number(user.id) : Number(user);
  return checkId === OWNER_USER_ID;
};

const canInteract = (actor, targetAcc) => {
  if (!actor || !targetAcc) return false;
  if (isSelf(actor.id, targetAcc)) return false;
  if (isMainOwner(targetAcc)) return false; // Can never modify ID 1
  if (isMainOwner(actor)) return true; // ID 1 can modify anyone
  return RANKS[actor.role] > RANKS[targetAcc.role];
};

router.get('/role/:userId', (req, res) => {
  try {
    const acc = Object.values(data.accounts).find(a => Number(a.id) === Number(req.params.userId));
    res.json({ success: true, id: Number(req.params.userId), role: acc?.role || "user" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.get('/staff', (req, res) => {
  try {
    const staff = Object.values(data.accounts).filter(a => ["owner", "admin", "moderator"].includes(a.role)).map(a => ({ 
      id: Number(a.id), 
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
    
    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);
    if (!actor || !targetAcc) return res.status(404).json({ success: false, error: "User not found" });
    if (!canInteract(actor, targetAcc)) return res.status(403).json({ success: false, error: "You cannot modify this account" });
    
    // ✅ Prevent removing owner from ID 1 entirely
    if (Number(targetAcc.id) === OWNER_USER_ID && role !== "owner") {
      return res.status(403).json({ success: false, error: "Cannot remove owner role from the main account" });
    }
    // Prevent removing the last owner
    if (targetAcc.role === "owner" && role !== "owner") {
      const ownerCount = Object.values(data.accounts).filter(a => a.role === "owner").length;
      if (ownerCount <= 1) return res.status(403).json({ success: false, error: "Cannot remove the only owner" });
    }

    const oldRole = targetAcc.role;
    targetAcc.role = role;
    const profile = Object.values(data.userProfiles).find(p => Number(p.id) === Number(targetAcc.id));
    if (profile) profile.role = role;

    data.moderationLogs.push({ 
      type: "SET_ROLE", 
      actorId: Number(actorId), 
      actorName: getUsername(actor), 
      targetId: Number(targetAcc.id), 
      targetName: getUsername(targetAcc), 
      oldRole, 
      newRole: role, 
      timestamp: new Date().toISOString() 
    });
    
    saveData();
    res.json({ success: true, message: "Role updated" });
  } catch (err) {
    console.error("Set role error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post('/ban', (req, res) => {
  try {
    const { actorId, target, reason = "No reason", days = null } = req.body;
    if (!actorId || !target) return res.status(400).json({ success: false, error: "Missing fields" });
    if (!hasRole(actorId, "moderator", data)) return res.status(403).json({ success: false, error: "No permission" });
    
    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);
    if (!actor || !targetAcc) return res.status(404).json({ success: false, error: "User not found" });
    if (!canInteract(actor, targetAcc)) return res.status(403).json({ success: false, error: "You cannot ban this account" });

    const banUntil = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
    Object.assign(targetAcc, { banned: true, banReason: reason, banUntil });

    data.moderationLogs.push({ 
      type: "BAN", 
      actorId: Number(actorId), 
      actorName: getUsername(actor), 
      targetId: Number(targetAcc.id), 
      targetName: getUsername(targetAcc), 
      reason, 
      banUntil, 
      timestamp: new Date().toISOString() 
    });
    
    saveData();
    res.json({ success: true, message: "User banned" });
  } catch (err) {
    console.error("Ban error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post('/unban', (req, res) => {
  try {
    const { actorId, target } = req.body;
    if (!actorId || !target) return res.status(400).json({ success: false, error: "Missing fields" });
    if (!hasRole(actorId, "moderator", data)) return res.status(403).json({ success: false, error: "No permission" });
    
    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);
    if (!actor || !targetAcc) return res.status(404).json({ success: false, error: "User not found" });
    if (!canInteract(actor, targetAcc)) return res.status(403).json({ success: false, error: "You cannot unban this account" });

    Object.assign(targetAcc, { banned: false, banReason: "", banUntil: null });

    data.moderationLogs.push({ 
      type: "UNBAN", 
      actorId: Number(actorId), 
      actorName: getUsername(actor), 
      targetId: Number(targetAcc.id), 
      targetName: getUsername(targetAcc), 
      timestamp: new Date().toISOString() 
    });
    
    saveData();
    res.json({ success: true, message: "User unbanned" });
  } catch (err) {
    console.error("Unban error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post('/delete-account', (req, res) => {
  try {
    const { actorId, target } = req.body;
    if (!actorId || !target) return res.status(400).json({ success: false, error: "Missing fields" });
    if (!hasRole(actorId, "owner", data)) return res.status(403).json({ success: false, error: "Only owners can delete accounts" });
    
    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);
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

    data.moderationLogs.push({ 
      type: "DELETE_ACCOUNT", 
      actorId: Number(actorId), 
      actorName: getUsername(actor), 
      targetId: Number(targetAcc.id), 
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

    data.moderationLogs.push({ 
      type: "RECOVER_ACCOUNT", 
      actorId: Number(actorId), 
      actorName: getUsername(resolveTarget(actorId)), 
      targetId: Number(deletedEntry.account.id), 
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
    if (!hasRole(req.query.actorId, "admin", data)) return res.status(403).json({ success: false, error: "No permission" });
    res.json({ success: true, logs: data.moderationLogs || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post('/create-account', async (req, res) => {
  try {
    const { actorId, username, password, gender, birthday, role, customHead, customThumbnail } = req.body;
    const actor = resolveTarget(actorId);
    const clean = String(username || '').trim();

    // Permissions & validation
    if (!actor || actor.id !== OWNER_USER_ID)
      return res.status(403).json({ success: false, error: "Only main owner can create accounts" });
    if (!clean || !password || !gender || !birthday)
      return res.status(400).json({ success: false, error: "Missing required fields" });
    if (data.usernameToId[clean.toLowerCase()])
      return res.status(400).json({ success: false, error: "Username already taken" });

    // New user setup
    const newId = data.nextUserId;
    data.nextUserId += 1;
    const joinDate = new Date().toISOString();
    const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const finalRole = Number(newId) === OWNER_USER_ID ? "owner" : (role || "user");

    // Save core account
    data.accounts[clean] = { id: newId, role: finalRole };
    data.userProfiles[clean] = {
      id: newId,
      username: clean,
      passwordHash,
      gender: gender.toLowerCase(),
      birthday,
      joinedAt: joinDate,
      role: finalRole,
      banned: false
    };
    data.usernameToId[clean.toLowerCase()] = newId;

    // 🎨 Avatar logic — EXACTLY what you asked for
    if (customHead && customThumbnail) {
      // Use custom if both provided
      const customId = data.nextOutfitId;
      data.outfitCatalog[customId] = {
        id: customId,
        name: `Custom: ${clean}`,
        price: 0,
        head: `data:image/png;base64,${customHead.trim()}`,
        thumbnail: `data:image/png;base64,${customThumbnail.trim()}`,
        uploadedBy: OWNER_USER_ID,
        uploadedAt: joinDate,
        sales: 1,
        views: 0
      };
      data.nextOutfitId += 1;

      if (!data.userOutfits[newId]) data.userOutfits[newId] = { equipped: null, owned: [] };
      data.userOutfits[newId].owned.push(customId);
      data.userOutfits[newId].equipped = customId;
      console.log(`✅ Custom outfit ${customId} → ${clean}`);
    } else {
      // ✅ RANDOM DEFAULT FOR GENDER — male = 1/2, female = 3/4
      const defaultId = getDefaultOutfitIdForGender(gender);
      console.log(`🎲 Gender: ${gender} → picked outfit ${defaultId} for ${clean}`);

      if (!data.userOutfits[newId]) data.userOutfits[newId] = { equipped: null, owned: [] };
      data.userOutfits[newId].owned.push(defaultId);
      data.userOutfits[newId].equipped = defaultId;
    }

    await saveData();
    res.json({ success: true, accountId: newId });
  } catch (err) {
    console.error("❌ Create account error:", err);
    res.status(500).json({ success: false, error: "Server error creating account" });
  }
});

// ✅ ADD THIS MISSING ROUTE (your frontend calls it!)
router.get('/find-user', async (req, res) => {
  try {
    const target = req.query.query;
    const acc = resolveTarget(target);
    if (!acc) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, user: { id: acc.id, role: acc.role } });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;