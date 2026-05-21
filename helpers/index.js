const sanitizeHtml = require('sanitize-html');
const { data, saveData } = require('../data');

function clean(input) {
  return sanitizeHtml(String(input || '').trim(), { 
    allowedTags: [], 
    allowedAttributes: {} 
  });
}

// ✅ FIXED: Explicitly pass the precise user ID assigned during signup
function createProfile(username, userId) {
  if (data.userProfiles[username]) return data.userProfiles[username];

  const profile = {
    id: Number(userId),
    username,
    joinDate: new Date().toISOString(),
    lastOnline: new Date().toISOString(),
    theme: "light",
    bio: "" 
  };

  data.userProfiles[username] = profile;
  data.usernameToId[username] = profile.id;
  saveData();
  return profile;
}

function getProfileById(id) {
  id = Number(id);
  if (!id) return null;

  const profile = Object.values(data.userProfiles).find(p => Number(p.id) === id);
  if (!profile) return null;

  const currentUsername = Object.keys(data.accounts).find(
    name => data.accounts[name].id === profile.id
  );

  return {
    id: profile.id,
    username: currentUsername || profile.username,
    joinDate: profile.joinDate,
    lastOnline: profile.lastOnline || null,
    theme: profile.theme,
    bio: profile.bio || ""
  };
}

// ✅ NEW: Middleware validating API requests against active sessions
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Expecting "Bearer <token>"

  if (!token || !data.sessions[token]) {
    return res.status(401).json({ error: "Unauthorized access. Please log in again." });
  }

  const username = data.sessions[token];
  const account = data.accounts[username];

  if (!account) {
    return res.status(401).json({ error: "Account no longer exists." });
  }

  // Bind authenticated user data securely to the request lifecycle
  req.user = {
    username: username,
    id: account.id
  };
  next();
}

module.exports = { clean, createProfile, getProfileById, authenticateToken };