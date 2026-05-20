const fs   = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'chat-data.json');
const TMP_PATH  = DATA_PATH + '.tmp';   // atomic write staging file
const BAK_PATH  = DATA_PATH + '.bak';   // single rolling backup

const DEFAULT_DATA = {
  nextUserId:      1,
  registeredNames: {},
  accounts:        {},
  userProfiles:    {},
  usernameToId:    {},
  friendRequests:  {},
  friends:         {},
  groups:          [],
  nextGroupId:     1,
};

let data = { ...DEFAULT_DATA };

// ─── Deep-merge loaded file onto defaults ─────────────────────
// Ensures any new top-level keys added to DEFAULT_DATA in future
// are always present, even when loading an older data file.
function mergeWithDefaults(loaded) {
  const merged = { ...DEFAULT_DATA };
  for (const key of Object.keys(DEFAULT_DATA)) {
    if (key in loaded) merged[key] = loaded[key];
  }
  return merged;
}

// ─── Load ─────────────────────────────────────────────────────
function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    console.log("📄 No data file — creating fresh");
    saveData();
    return;
  }
  try {
    const raw    = fs.readFileSync(DATA_PATH, 'utf8');
    const loaded = JSON.parse(raw);
    data = mergeWithDefaults(loaded);
    console.log(`✅ Data loaded (${Object.keys(data.accounts).length} accounts)`);
  } catch (err) {
    console.error("⚠️ Data file unreadable — backing up and starting fresh:", err.message);
    try { fs.renameSync(DATA_PATH, DATA_PATH + `.bak-${Date.now()}`); } catch (_) {}
    data = { ...DEFAULT_DATA };
    saveData();
  }
}

// ─── Save (atomic write) ──────────────────────────────────────
// Write to a .tmp file first, then rename over the real file.
// rename() is atomic on the OS level — the live file is never
// left in a partially-written state if the process crashes.
let saveTimer = null;

function saveData() {
  // Debounce: coalesce rapid successive saves into one disk write
  clearTimeout(saveTimer);
  saveTimer = setTimeout(_writeToDisk, 300);
}

function _writeToDisk() {
  const json = JSON.stringify(data, null, 2);
  try {
    // 1. Write to temp file
    fs.writeFileSync(TMP_PATH, json, 'utf8');
    // 2. Keep one rolling backup of the previous good file
    if (fs.existsSync(DATA_PATH)) fs.copyFileSync(DATA_PATH, BAK_PATH);
    // 3. Atomically replace live file
    fs.renameSync(TMP_PATH, DATA_PATH);
  } catch (err) {
    console.error("❌ Save failed:", err.message);
  }
}

// ─── Periodic auto-save ───────────────────────────────────────
// Flushes any unsaved state every 60 s even if saveData()
// was never called (e.g. process killed between explicit saves).
setInterval(_writeToDisk, 60_000).unref(); // .unref() won't keep the process alive

// ─── Graceful shutdown ────────────────────────────────────────
// Flush immediately on clean exit so the debounce delay doesn't
// cause the final save to be skipped.
function _flushAndExit(signal) {
  console.log(`\n${signal} received — flushing data before exit`);
  clearTimeout(saveTimer);
  _writeToDisk();
  process.exit(0);
}
process.on('SIGINT',  () => _flushAndExit('SIGINT'));
process.on('SIGTERM', () => _flushAndExit('SIGTERM'));

module.exports = { data, loadData, saveData };