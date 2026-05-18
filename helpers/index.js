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

  const profile = {
    id: data.nextUserId,           // Use current ID (don't increment here)
    username,
    joinDate: new Date().toISOString(),
    lastOnline: new Date().toISOString(),
    theme: "light"
  };

  data.userProfiles[username] = profile;
  data.usernameToId[username] = profile.id;
  saveData();
  return profile;
}

function getProfileById(id) {
  id = Number(id);
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
    theme: profile.theme
  };
}

module.exports = { clean, createProfile, getProfileById };