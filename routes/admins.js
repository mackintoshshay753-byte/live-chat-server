const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { data, saveData, OWNER_USER_ID, getDefaultOutfitIdForGender } = require('../data'); // ✅ Import the gender→outfit function
const { hasRole } = require('./permissions');
const { assignPermanentDefaultOutfit } = require('../sockets');

if (!data.deletedAccounts) data.deletedAccounts = {};

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

const isMainOwner = user => {
  if (!user) return false;
  const checkId = typeof user === "object" ? Number(user.id) : Number(user);
  return checkId === OWNER_USER_ID;
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
    
    if (Number(targetAcc.id) === OWNER_USER_ID && role !== "owner") {
      return res.status(403).json({ success: false, error: "Cannot remove owner role from the main account" });
    }
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
    const { 
      actorId, username, password, role = "user", gender = "", birthday = "",
      customHead, customThumbnail
    } = req.body;

    // ✅ Fixed: Only require core fields, allow custom avatars to be empty
    if (!actorId || !username || !password || !gender || !birthday) 
      return res.status(400).json({ success: false, error: "All required fields are needed" });

    const actor = resolveTarget(actorId);
    if (!actor || !isMainOwner(actor)) 
      return res.status(403).json({ success: false, error: "Access denied — only main owner can create accounts" });

    const clean = username.trim(), lower = clean.toLowerCase();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(clean)) 
      return res.status(400).json({ success: false, error: "Invalid username — use 3–20 letters, numbers, underscores" });

    if (data.accounts[clean] || data.deletedAccounts[clean] || data.registeredNames[lower]) 
      return res.status(409).json({ success: false, error: "Username already taken" });

    if (!(password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password))) 
      return res.status(400).json({ success: false, error: "Password needs 8+ characters, letters and numbers" });

    const finalRole = ["user", "moderator", "admin", "owner"].includes(role) ? role : "user";

    let newId = data.nextUserId;
    while (Object.values(data.accounts).some(a => Number(a.id) === newId) || Object.values(data.deletedAccounts).some(d => Number(d.account.id) === newId)) newId++;
    data.nextUserId = newId + 1;

    const joinDate = new Date().toISOString();
    const hash = await bcrypt.hash(password, 12);

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
      verified: false 
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
      createdAt: joinDate 
    };

    data.accounts[clean] = newAccount;
    data.userProfiles[clean] = newProfile;
    data.registeredNames[lower] = clean;
    data.usernameToId[clean] = newId;

    // ✅ Fixed: Accept base64 strings directly, no trim() crash on null
    if (customHead && customThumbnail) {
      const customOutfitId = data.nextOutfitId;
      data.outfitCatalog[customOutfitId] = {
        id: customOutfitId,
        name: `Custom: ${clean}`,
        price: 0,
        head: customHead, // ✅ Removed .trim() to avoid crash on base64 data
        thumbnail: customThumbnail, // ✅ Removed .trim()
        uploadedBy: OWNER_USER_ID,
        uploadedAt: joinDate,
        sales: 1,
        views: 0
      };
      data.nextOutfitId += 1;

      if (!data.userOutfits[newId]) data.userOutfits[newId] = { equipped: null, owned: [] };
      data.userOutfits[newId].owned.push(customOutfitId);
      data.userOutfits[newId].equipped = customOutfitId;
    } else {
      // ✅ Ensure default assignment works with the correct gender logic
      await assignPermanentDefaultOutfit(newId, gender);
    }

    data.moderationLogs.push({ 
      type: "CREATE_ACCOUNT", 
      actorId: Number(actorId), 
      actorName: getUsername(actor), 
      targetId: newId, 
      targetName: clean, 
      role: finalRole, 
      timestamp: joinDate 
    });

    await saveData();
    res.json({ success: true, accountId: newId, username: clean, role: finalRole });
  } catch (err) {
    console.error("❌ Create account full error:", err); // ✅ Log full error for debugging
    res.status(500).json({ success: false, error: "Server error creating account", details: err.message });
  }
});

module.exports = router;