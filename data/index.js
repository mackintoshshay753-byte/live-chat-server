const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'chat-data.json');

const DEFAULT_DATA = {
  nextUserId: 2,
  registeredNames: {
    "sadieandshay87": true
  },
  accounts: {
    "sadieandshay87": {
      id: 1,
      hash: "$2b$12$EixZaYb7xqgRjKzRjKzRjOe0xQe0xQe0xQe0xQe0xQe0xQe0xQe0xQ",
      joinDate: new Date().toISOString(),
      theme: "light",
      verified: false,
      role: "owner", // ✅ ALREADY OWNER FROM DAY ONE
      birthday: { "month": "June", "day": 23, "year": 2000 }
    }
  },
  userProfiles: {
    "sadieandshay87": {
      id: 1,
      username: "sadieandshay87",
      joinDate: new Date().toISOString(),
      lastOnline: null,
      theme: "light",
      bio: "",
      birthday: { "month": "June", "day": 23, "year": 2000 },
      status: ""
    }
  },
  usernameToId: { "sadieandshay87": 1 },
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
    console.log("📄 Creating fresh data with Owner account");
    data = { ...DEFAULT_DATA };
    saveData();
    return;
  }
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const loaded = JSON.parse(raw);
    data = { ...DEFAULT_DATA, ...loaded };

    // Still force owner if it ever changes
    if (data.accounts["sadieandshay87"]) {
      if (data.accounts["sadieandshay87"].role !== "owner") {
        data.accounts["sadieandshay87"].role = "owner";
        saveData();
        console.log("✅ Forced sadieandshay87 to Owner");
      }
    }

    console.log("✅ Data loaded");
  } catch (err) {
    console.error("⚠️ Corrupted file — resetting to default");
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

module.exports = { data, loadData, saveData };