const fs = require('fs').promises; // Switching to async promises
const { existsSync, renameSync } = require('fs'); // Keep sync only for emergency crash fallback
const path = require('path');

const DATA_PATH = path.join(__dirname, 'chat-data.json');
const TEMP_DATA_PATH = path.join(__dirname, 'chat-data.tmp.json');

const DEFAULT_DATA = {
  nextUserId: 1,
  registeredNames: {},
  accounts: {},
  userProfiles: {},
  usernameToId: {},
  friendRequests: {},
  friends: {},
  messages: {},
  moderationLogs: [],
  deletedAccounts: {},
  groups: [],
  nextGroupId: 1,
  ads: {},
  nextOutfitId: 1,
  outfitCatalog: {},
  userOutfits: {}
};

// In-memory data reference
let data = { ...DEFAULT_DATA };
const ACTUAL_OWNER_USERNAME = "sadieandshay87";

// Keep track of ongoing save operations to prevent overlapping writes
let isSaving = false;
let savePending = false;

async function loadData() {
  try {
    // existsSync is fine for initial startup checking
    if (!existsSync(DATA_PATH)) {
      console.log("📄 No data file — starting fresh");
      await saveData();
      return;
    }

    const raw = await fs.readFile(DATA_PATH, 'utf8');
    const loaded = JSON.parse(raw);
    
    // Deep-ish merge to ensure all top-level keys exist
    data = { ...DEFAULT_DATA, ...loaded };

    // Sync roles from userProfiles into accounts
    Object.entries(data.userProfiles || {}).forEach(([uname, prof]) => {
      if (!data.accounts[uname]) data.accounts[uname] = { id: prof.id };
      data.accounts[uname].role = prof.role || "user";
    });

    // Force main owner role
    if (data.userProfiles[ACTUAL_OWNER_USERNAME]) {
      if (data.userProfiles[ACTUAL_OWNER_USERNAME].role !== "owner") {
        data.userProfiles[ACTUAL_OWNER_USERNAME].role = "owner";
        data.accounts[ACTUAL_OWNER_USERNAME].role = "owner";
        await saveData();
        console.log(`✅ ${ACTUAL_OWNER_USERNAME} set as Owner`);
      }
    } else {
      console.log(`ℹ️ ${ACTUAL_OWNER_USERNAME} will be Owner when registered`);
    }

    console.log("✅ Data loaded successfully");
  } catch (err) {
    console.error("⚠️ Data corruption/error detected — backing up and restarting fresh:", err.message);
    
    // Sync backup fallback since we are handling a catastrophic boot failure
    if (existsSync(DATA_PATH)) {
      renameSync(DATA_PATH, `${DATA_PATH}.bak-${Date.now()}.json`);
    }
    
    data = { ...DEFAULT_DATA };
    await saveData();
  }
}

async function saveData() {
  // Queue system: If already saving, flag that we need another save when done
  if (isSaving) {
    savePending = true;
    return;
  }
  
  isSaving = true;

  try {
    const payload = JSON.stringify(data, null, 2);
    
    // ATOMIC WRITE: Write to a temp file first, then rename it.
    // This ensures that if the server crashes mid-write, your actual data file isn't left half-written/corrupted.
    await fs.writeFile(TEMP_DATA_PATH, payload, 'utf8');
    await fs.rename(TEMP_DATA_PATH, DATA_PATH);
  } catch (err) {
    console.error("❌ Save failed:", err.message);
  } finally {
    isSaving = false;
    
    // If a save request came in while we were writing, run it now
    if (savePending) {
      savePending = false;
      await saveData();
    }
  }
}

function setRoleOnSignup(username, role = "user") {
  return username === ACTUAL_OWNER_USERNAME ? "owner" : role;
}

// Export a getter/setter function for data so other files don't accidentally break the reference
module.exports = { 
  get data() { return data; },
  setData: (newData) => { data = newData; },
  loadData, 
  saveData, 
  setRoleOnSignup, 
  ACTUAL_OWNER_USERNAME 
};