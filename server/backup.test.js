const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-backup-'));
const { putDoc } = require('./db');
const { runBackup, BACKUP_DIR } = require('./backup');

test('runBackup erzeugt eine nicht-leere DB-Datei', async () => {
  putDoc('employees', ['Max'], '2026-07-07T10:00:00.000Z');
  const dest = await runBackup('2026-07-07T10:00:00.000Z');
  assert.ok(fs.existsSync(dest), 'Backup-Datei existiert');
  assert.ok(fs.statSync(dest).size > 0, 'Backup ist nicht leer');
  assert.ok(dest.startsWith(BACKUP_DIR), 'Backup liegt im BACKUP_DIR');
});
