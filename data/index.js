const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'chat-data.json');

const DEFAULT_DATA = {
  nextUserId: 1,
  registeredNames: {},
  accounts: {},
  userProfiles: {},
  usernameToId: {}
};

let data = { ...DEFAULT_DATA };
let onlineUsers = new Set();   // Tracks currently online users

function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    console.log("📄 No data file — creating new");
    saveData();
    return;
  }
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const loaded = JSON.parse(raw);
    data = { ...DEFAULT_DATA, ...loaded };
    console.log("✅ Data loaded successfully");
  } catch (err) {
    console.error("⚠️ Data read error — starting fresh");
    if (fs.existsSync(DATA_PATH)) fs.renameSync(DATA_PATH, DATA_PATH + `.bak-${Date.now()}.json`);
    saveData();
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error("❌ Save failed:", err.message);
  }
}

// Online Status Functions
function setUserOnline(username) {
  if (username) onlineUsers.add(username);
}

function setUserOffline(username) {
  if (username) onlineUsers.delete(username);
}

function isUserOnline(username) {
  return onlineUsers.has(username);
}

module.exports = { 
  data, 
  loadData, 
  saveData,
  setUserOnline,
  setUserOffline,
  isUserOnline 
};