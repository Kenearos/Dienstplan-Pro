const path = require('path');
const fs = require('fs');
const { db, DATA_DIR } = require('./db');

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP = 14;

async function runBackup(now) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = now.replace(/[:.]/g, '-');
  const dest = path.join(BACKUP_DIR, `dienstplan-${stamp}.db`);
  await db.backup(dest); // Online-Backup-API von SQLite — konsistent, ohne cp-Risiko
  prune();
  return dest;
}

function prune() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('dienstplan-') && f.endsWith('.db'))
    .sort(); // ISO-abgeleiteter Stamp → lexikografisch == chronologisch
  const excess = files.length - KEEP;
  for (let i = 0; i < excess; i++) {
    fs.unlinkSync(path.join(BACKUP_DIR, files[i]));
  }
}

function scheduleBackups() {
  const tick = () => runBackup(new Date().toISOString())
    .catch(e => console.error('Backup fehlgeschlagen:', e));
  tick();
  setInterval(tick, 24 * 60 * 60 * 1000);
}

module.exports = { runBackup, scheduleBackups, BACKUP_DIR };
