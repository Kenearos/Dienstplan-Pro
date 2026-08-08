const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-mig-'));
const { db, putDoc } = require('./db');
const { migriere, kalendertag } = require('./migrate-duties');

function nutzer(email, name) {
  return Number(db.prepare('INSERT INTO users (email,is_admin,created_at,display_name) VALUES (?,0,?,?)')
    .run(email, new Date().toISOString(), name).lastInsertRowid);
}

test('kalendertag: massgeblich ist der lokale Tag in Europe/Berlin', () => {
  assert.strictEqual(kalendertag('2026-06-03T10:00:00.000Z'), '2026-06-03');
  // 22:30 UTC im Sommer ist in Berlin bereits der Folgetag
  assert.strictEqual(kalendertag('2026-06-03T22:30:00.000Z'), '2026-06-04');
  // Winterzeit: 23:30 UTC -> 00:30 Folgetag
  assert.strictEqual(kalendertag('2026-01-03T23:30:00.000Z'), '2026-01-04');
});

test('migriere: Dienste und Urlaube wandern, Status approved', () => {
  const admin = nutzer('mig-admin@x.de', 'Chef');
  const anna = nutzer('anna@x.de', 'Anna');
  putDoc(admin, 'duties', {
    Anna: {
      '2026-06': [{ date: '2026-06-03T10:00:00.000Z', share: 1 },
        { date: '2026-06-06T10:00:00.000Z', share: 0.5 }],
    },
  }, new Date().toISOString());
  putDoc(admin, 'vacation', { Anna: { '2026-06': true } }, new Date().toISOString());

  const erg = migriere({ adminUserId: admin, zuordnung: { Anna: anna } });
  assert.strictEqual(erg.dienste, 2);
  assert.strictEqual(erg.urlaube, 1);

  const rows = db.prepare('SELECT * FROM duties WHERE user_id=? ORDER BY date').all(anna);
  assert.deepStrictEqual(rows.map((r) => r.date), ['2026-06-03', '2026-06-06']);
  assert.ok(rows.every((r) => r.status === 'approved'), 'Altdaten gelten als freigegeben');
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM vacation_months WHERE user_id=?').get(anna).c, 1);
});

test('migriere: unzugeordneter Name bricht ab, ohne etwas zu schreiben', () => {
  const admin = nutzer('mig2@x.de', 'Chef2');
  putDoc(admin, 'duties', {
    Bekannt: { '2026-07': [{ date: '2026-07-01T10:00:00.000Z', share: 1 }] },
    Unbekannt: { '2026-07': [{ date: '2026-07-02T10:00:00.000Z', share: 1 }] },
  }, new Date().toISOString());
  const vorher = db.prepare('SELECT COUNT(*) c FROM duties').get().c;
  const bekannt = nutzer('bekannt@x.de', 'Bekannt');

  assert.throws(() => migriere({ adminUserId: admin, zuordnung: { Bekannt: bekannt } }), /Unbekannt/);
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM duties').get().c, vorher,
    'bei Abbruch darf nichts geschrieben sein');
});

test('migriere: zweiter Lauf schreibt nicht doppelt', () => {
  const admin = nutzer('mig3@x.de', 'Chef3');
  const bob = nutzer('bob@x.de', 'Bob');
  putDoc(admin, 'duties', { Bob: { '2026-08': [{ date: '2026-08-04T10:00:00.000Z', share: 1 }] } },
    new Date().toISOString());
  migriere({ adminUserId: admin, zuordnung: { Bob: bob } });
  migriere({ adminUserId: admin, zuordnung: { Bob: bob } });
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM duties WHERE user_id=?').get(bob).c, 1);
});
