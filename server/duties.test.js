const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-duties-'));
const { db } = require('./db');

function spalten(tabelle) {
  return db.prepare(`PRAGMA table_info(${tabelle})`).all().map(c => c.name);
}

test('Schema: duties, vacation_months und die neuen users-Spalten existieren', () => {
  assert.deepStrictEqual(
    spalten('duties'),
    ['id', 'user_id', 'date', 'share', 'status', 'note', 'created_at', 'decided_by', 'decided_at'],
  );
  assert.deepStrictEqual(spalten('vacation_months'), ['user_id', 'month']);
  const u = spalten('users');
  assert.ok(u.includes('display_name'), 'users.display_name fehlt');
  assert.ok(u.includes('active'), 'users.active fehlt');
});

test('Schema: aktive Konten sind per Default aktiv', () => {
  const id = db.prepare('INSERT INTO users (email,is_admin,created_at) VALUES (?,0,?)')
    .run('default@x.de', new Date().toISOString()).lastInsertRowid;
  assert.strictEqual(db.prepare('SELECT active FROM users WHERE id=?').get(id).active, 1);
});

test('Schema: ein gueltiger Dienst pro Person und Tag, abgelehnte zaehlen nicht', () => {
  const uid = db.prepare('INSERT INTO users (email,is_admin,created_at) VALUES (?,0,?)')
    .run('unique@x.de', new Date().toISOString()).lastInsertRowid;
  const ins = (status) => db.prepare(
    'INSERT INTO duties (user_id,date,share,status,created_at) VALUES (?,?,?,?,?)',
  ).run(uid, '2026-09-01', 1.0, status, new Date().toISOString());

  ins('pending');
  assert.throws(() => ins('pending'), /UNIQUE/, 'zweiter gueltiger Dienst muss scheitern');

  // Ablehnen und erneut eintragen muss gehen — sonst ist der Tag fuer immer blockiert
  db.prepare("UPDATE duties SET status='rejected' WHERE user_id=? AND date=?").run(uid, '2026-09-01');
  assert.doesNotThrow(() => ins('pending'), 'nach Ablehnung muss der Tag wieder frei sein');
  assert.strictEqual(
    db.prepare('SELECT COUNT(*) c FROM duties WHERE user_id=? AND date=?').get(uid, '2026-09-01').c, 2,
  );
});

// ── Task 2: Regel-Schicht ────────────────────────────────────────────
const D = require('./duties');

function neuerNutzer(email, name) {
  return Number(db.prepare('INSERT INTO users (email,is_admin,created_at,display_name) VALUES (?,0,?,?)')
    .run(email, new Date().toISOString(), name).lastInsertRowid);
}

test('anlegen: gueltige Werte, Status pending', () => {
  const uid = neuerNutzer('a1@x.de', 'Alsholi');
  const { id } = D.anlegen({ userId: uid, date: '2026-10-05', share: 1.0 });
  const row = db.prepare('SELECT * FROM duties WHERE id=?').get(id);
  assert.strictEqual(row.status, 'pending');
  assert.strictEqual(row.share, 1);
  assert.strictEqual(row.user_id, uid);
});

test('anlegen: ungueltiger Anteil und ungueltiges Datum werden abgewiesen', () => {
  const uid = neuerNutzer('a2@x.de', 'Cabrera');
  for (const share of [0, 0.7, 2, -1, null]) {
    assert.throws(() => D.anlegen({ userId: uid, date: '2026-10-06', share }), /UNGUELTIG/);
  }
  for (const date of ['2026-13-01', '2026-02-30', '05.10.2026', '2026-10-5', '', null]) {
    assert.throws(() => D.anlegen({ userId: uid, date, share: 1.0 }), /UNGUELTIG/);
  }
});

test('anlegen: zweiter Dienst am selben Tag -> DOPPELT', () => {
  const uid = neuerNutzer('a3@x.de', 'Gaxhja');
  D.anlegen({ userId: uid, date: '2026-10-07', share: 1.0 });
  assert.throws(() => D.anlegen({ userId: uid, date: '2026-10-07', share: 0.5 }), /DOPPELT/);
});

test('loeschen: nur eigene und nur solange pending', () => {
  const uid = neuerNutzer('a4@x.de', 'Giurgiu');
  const fremd = neuerNutzer('a5@x.de', 'Jizdan');
  const { id } = D.anlegen({ userId: uid, date: '2026-10-08', share: 1.0 });

  assert.throws(() => D.loeschen({ userId: fremd, id }), /NICHT_GEFUNDEN/);
  assert.strictEqual(D.loeschen({ userId: uid, id }), true);

  const { id: id2 } = D.anlegen({ userId: uid, date: '2026-10-09', share: 1.0 });
  D.entscheiden({ adminId: fremd, id: id2, status: 'approved' });
  assert.throws(() => D.loeschen({ userId: uid, id: id2 }), /ENTSCHIEDEN/);
});

test('entscheiden: setzt Status, Entscheider und Zeitpunkt; meldet Selbstentscheidung', () => {
  const admin = neuerNutzer('adm2@x.de', 'Benadjemia');
  const { id } = D.anlegen({ userId: admin, date: '2026-10-10', share: 1.0 });
  const erg = D.entscheiden({ adminId: admin, id, status: 'approved' });
  assert.strictEqual(erg.selbst, true, 'Entscheidung ueber eigenen Dienst muss erkennbar sein');

  const row = db.prepare('SELECT * FROM duties WHERE id=?').get(id);
  assert.strictEqual(row.status, 'approved');
  assert.strictEqual(row.decided_by, admin);
  assert.ok(row.decided_at, 'decided_at fehlt');
});

test('entscheiden: nur approved oder rejected, nicht zweimal', () => {
  const admin = neuerNutzer('adm3@x.de', 'Admin');
  const uid = neuerNutzer('a6@x.de', 'Elsharawy');
  const { id } = D.anlegen({ userId: uid, date: '2026-10-11', share: 0.5 });
  assert.throws(() => D.entscheiden({ adminId: admin, id, status: 'vielleicht' }), /UNGUELTIG/);
  D.entscheiden({ adminId: admin, id, status: 'rejected', note: 'Tag war besetzt' });
  assert.throws(() => D.entscheiden({ adminId: admin, id, status: 'approved' }), /ENTSCHIEDEN/);
});

test('monat: liefert Namen, filtert auf den Monat, enthaelt keinen Betrag', () => {
  const uid = neuerNutzer('a7@x.de', 'Guenes');
  D.anlegen({ userId: uid, date: '2026-11-03', share: 1.0 });
  D.anlegen({ userId: uid, date: '2026-12-03', share: 1.0 });
  const zeilen = D.monat('2026-11');
  assert.strictEqual(zeilen.length, 1);
  assert.strictEqual(zeilen[0].name, 'Guenes');
  assert.strictEqual(zeilen[0].date, '2026-11-03');
  const felder = Object.keys(zeilen[0]).join(',');
  assert.ok(!/bonus|betrag|amount|euro/i.test(felder), `Betragsfeld im Aushang: ${felder}`);
});

// ── Admin traegt fuer andere ein / raeumt Fehleintraege ──────────────

test('anlegenDurchAdmin: sofort approved, Entscheider gesetzt', () => {
  const admin = neuerNutzer('adm4@x.de', 'Chef');
  const uid = neuerNutzer('a8@x.de', 'Kollege');
  const { id } = D.anlegenDurchAdmin({ adminId: admin, userId: uid, date: '2026-10-12', share: 0.5 });
  const row = db.prepare('SELECT * FROM duties WHERE id=?').get(id);
  assert.strictEqual(row.status, 'approved');
  assert.strictEqual(row.user_id, uid);
  assert.strictEqual(row.decided_by, admin);
  assert.ok(row.decided_at, 'decided_at fehlt');
});

test('anlegenDurchAdmin: unbekannter Nutzer, Wertepruefung, Doppel-Tag', () => {
  const admin = neuerNutzer('adm5@x.de', 'Chef2');
  const uid = neuerNutzer('a9@x.de', 'Kollege2');
  assert.throws(() => D.anlegenDurchAdmin({ adminId: admin, userId: 999999, date: '2026-10-13', share: 1 }), /NICHT_GEFUNDEN/);
  assert.throws(() => D.anlegenDurchAdmin({ adminId: admin, userId: uid, date: '2026-10-13', share: 0.7 }), /UNGUELTIG/);
  D.anlegen({ userId: uid, date: '2026-10-13', share: 1 });
  assert.throws(() => D.anlegenDurchAdmin({ adminId: admin, userId: uid, date: '2026-10-13', share: 1 }), /DOPPELT/);
});

test('loeschenDurchAdmin: loescht auch entschiedene Dienste und meldet das betroffene Konto', () => {
  const admin = neuerNutzer('adm6@x.de', 'Chef3');
  const uid = neuerNutzer('a10@x.de', 'Kollege3');
  const { id } = D.anlegenDurchAdmin({ adminId: admin, userId: uid, date: '2026-10-14', share: 1 });
  assert.strictEqual(D.loeschenDurchAdmin({ id }), uid, 'muss die betroffene user_id fuers Audit liefern');
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM duties WHERE id=?').get(id).c, 0);
  assert.throws(() => D.loeschenDurchAdmin({ id }), /NICHT_GEFUNDEN/);
});

test('monat: Name faellt auf den lokalen Teil der E-Mail zurueck', () => {
  const id = Number(db.prepare('INSERT INTO users (email,is_admin,created_at) VALUES (?,0,?)')
    .run('ohnename@x.de', new Date().toISOString()).lastInsertRowid);
  D.anlegen({ userId: id, date: '2026-11-04', share: 1.0 });
  const zeile = D.monat('2026-11').find((z) => z.userId === id);
  assert.strictEqual(zeile.name, 'ohnename');
});
