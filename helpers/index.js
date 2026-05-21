const sanitizeHtml = require('sanitize-html');
const { data, saveData } = require('../data');

function clean(input) {
  return sanitizeHtml(String(input || '').trim(), { 
    allowedTags: [], 
    allowedAttributes: {} 
  });
}

function createProfile(username) {
  if (data.userProfiles[username]) return data.userProfiles[username];

  // Use the ID that was already assigned in signup
  const profile = {
    id: data.nextUserId - 1,        // Important fix
    username,
    joinDate: new Date().toISOString(),
    lastOnline: new Date().toISOString(),
    theme: "light",
    bio: "" // ✅ ADDED: empty bio by default for new users
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

  // Get latest username in case it changed
  const currentUsername = Object.keys(data.accounts).find(
    name => data.accounts[name].id === profile.id
  );

  return {
    id: profile.id,
    username: currentUsername || profile.username,
    joinDate: profile.joinDate,
    lastOnline: profile.lastOnline || null,
    theme: profile.theme,
    bio: profile.bio || "" // ✅ ADDED: return bio value
  };
}

module.exports = { clean, createProfile, getProfileById };