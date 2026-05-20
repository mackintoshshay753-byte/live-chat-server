const { data, saveData } = require('../data');

// ─── Input cleaning ───────────────────────────────────────────
// Strips all HTML tags and trims whitespace.
// sanitize-html is not needed here — usernames and bios are
// stored as plain text and never rendered as HTML by the server.
function clean(input) {
  return String(input ?? '').replace(/<[^>]*>/g, '').trim();
}

// ─── Create profile ───────────────────────────────────────────
// Accepts the already-assigned ID explicitly — never infers it
// from nextUserId, which is fragile if call order ever changes.
function createProfile(username, id) {
  if (data.userProfiles[username]) return data.userProfiles[username];

  const now = new Date().toISOString();
  const profile = {
    id,
    username,
    joinDate:   now,
    lastOnline: now,
    theme:      'light',
    bio:        '',
  };

  data.userProfiles[username]  = profile;
  data.usernameToId[username]  = id;
  saveData();
  return profile;
}

// ─── Get profile by ID ────────────────────────────────────────
// Uses the usernameToId reverse-index for O(1) lookup instead
// of scanning all profiles on every call.
function getProfileById(id) {
  const numId = Number(id);
  if (!numId) return null;

  // usernameToId maps username -> id; build a reverse lookup
  const username = Object.keys(data.usernameToId).find(
    name => data.usernameToId[name] === numId
  );
  if (!username) return null;

  const profile = data.userProfiles[username];
  if (!profile) return null;

  // Resolve the latest username via accounts in case of a rename
  const currentUsername =
    Object.keys(data.accounts).find(name => data.accounts[name].id === numId)
    ?? profile.username;

  return {
    id:         profile.id,
    username:   currentUsername,
    joinDate:   profile.joinDate,
    lastOnline: profile.lastOnline ?? null,
    theme:      profile.theme,
    bio:        profile.bio ?? '',
  };
}

module.exports = { clean, createProfile, getProfileById };