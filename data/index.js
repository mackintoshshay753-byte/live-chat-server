const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'chat-data.json');

// Start EMPTY — no pre-made accounts
const DEFAULT_DATA = {
  nextUserId: 1,
  registeredNames: {},
  accounts: {},
  userProfiles: {},
  usernameToId: {},
  friendRequests: {},
  friends: {},
  groups: [],
  nextGroupId: 1,
  ads: [],
  moderationLogs: []
};

let data = { ...DEFAULT_DATA };

function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    console.log("📄 No data file — starting fresh");
    saveData();
    return;
  }

  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const loaded = JSON.parse(raw);
    data = { ...DEFAULT_DATA, ...loaded };

    // ✅ Sync roles from userProfiles into accounts
    const MY_OWNER_USERNAME = "sadieandshay87";

    // First: if exists in userProfiles, copy role to accounts
    Object.entries(data.userProfiles || {}).forEach(([uname, prof]) => {
      if (!data.accounts[uname]) data.accounts[uname] = { id: prof.id };
      // Keep role in sync
      data.accounts[uname].role = prof.role || "user";
    });

    // ✅ Force owner role for your username
    if (data.userProfiles[MY_OWNER_USERNAME]) {
      if (data.userProfiles[MY_OWNER_USERNAME].role !== "owner") {
        data.userProfiles[MY_OWNER_USERNAME].role = "owner";
        data.accounts[MY_OWNER_USERNAME].role = "owner";
        saveData();
        console.log(`✅ ${MY_OWNER_USERNAME} set and saved as Owner`);
      } else {
        console.log(`ℹ️ ${MY_OWNER_USERNAME} is already Owner`);
      }
    } else {
      console.log(`ℹ️ ${MY_OWNER_USERNAME} not registered yet — will become Owner when you sign up`);
    }

    console.log("✅ Data loaded successfully");
  } catch (err) {
    console.error("⚠️ Data error — starting fresh");
    if (fs.existsSync(DATA_PATH)) fs.renameSync(DATA_PATH, DATA_PATH + `.bak-${Date.now()}.json`);
    data = { ...DEFAULT_DATA };
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

// ✅ Automatically set role when you create your account
function setRoleOnSignup(username, role = "user") {
  return username === "sadieandshay87" ? "owner" : role;
}

module.exports = { data, loadData, saveData, setRoleOnSignup };