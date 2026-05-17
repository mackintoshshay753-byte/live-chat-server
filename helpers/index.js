const sanitizeHtml = require('sanitize-html');
const { data, saveData } = require('../data');

function clean(input) {
  return sanitizeHtml(String(input || '').trim(), { allowedTags: [], allowedAttributes: {} });
}

function createProfile(username) {
  if (data.userProfiles[username]) return data.userProfiles[username];

  const id = data.nextUserId++;
  const profile = {
    id,
    username,
    joinDate: new Date().toISOString(),
    theme: "light"
  };

  data.userProfiles[username] = profile;
  data.usernameToId[username] = id;
  saveData();
  return profile;
}

function getProfileById(id) {
  id = Number(id);
  return Object.values(data.userProfiles).find(p => Number(p.id) === id) || null;
}

module.exports = { clean, createProfile, getProfileById };