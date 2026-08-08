const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-setup-'));
const { db, putDoc } = require('./db');
const { teamAufsetzen } = require('./setup-team');

function admin(email) {
  return Number(db.prepare('INSERT INTO users (email,is_admin,created_at) VALUES (?,1,?)')
    .run(email, new Date().toISOString()).lastInsertRowid);
}

test('legt fehlende Konten an und setzt den Anzeigenamen', () => {
  const a = admin('chef1@x.de');
  const erg = teamAufsetzen({
    adminUserId: a,
    zuordnung: { Alsholi: 'alsholi@k.de', 'Günes': 'guenes@k.de' },
  });

  assert.strictEqual(erg.angelegt.length, 2);
  const u = db.prepare('SELECT email, display_name, is_admin, active FROM users WHERE email=?').get('alsholi@k.de');
  assert.strictEqual(u.display_name, 'Alsholi');
  assert.strictEqual(u.is_admin, 0, 'Kollegen sind keine Admins');
  assert.strictEqual(u.active, 1);
});

test('vorhandenes Konto wird nicht doppelt angelegt, Name wird nachgetragen', () => {
  const a = admin('chef2@x.de');
  db.prepare('INSERT INTO users (email,is_admin,created_at) VALUES (?,0,?)')
    .run('schon@k.de', new Date().toISOString());

  const erg = teamAufsetzen({ adminUserId: a, zuordnung: { Cabrera: 'schon@k.de' } });
  assert.strictEqual(erg.angelegt.length, 0);
  assert.strictEqual(erg.aktualisiert.length, 1);
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM users WHERE email=?').get('schon@k.de').c, 1);
  assert.strictEqual(db.prepare('SELECT display_name FROM users WHERE email=?').get('schon@k.de').display_name, 'Cabrera');
});

test('E-Mails werden normalisiert, ungueltige brechen ab', () => {
  const a = admin('chef3@x.de');
  teamAufsetzen({ adminUserId: a, zuordnung: { Gaxhja: '  Gaxhja@K.de ' } });
  assert.ok(db.prepare('SELECT id FROM users WHERE email=?').get('gaxhja@k.de'), 'nicht normalisiert');

  assert.throws(() => teamAufsetzen({ adminUserId: a, zuordnung: { X: 'keine-mail' } }), /keine-mail/);
});

test('zieht die Alt-Dienste mit und meldet jede Zuordnung', () => {
  const a = admin('chef4@x.de');
  putDoc(a, 'duties', {
    Giurgiu: { '2026-06': [{ date: '2026-06-09T10:00:00.000Z', share: 1 }] },
    Jizdan: { '2026-06': [{ date: '2026-06-16T10:00:00.000Z', share: 1 }] },
  }, new Date().toISOString());
  putDoc(a, 'vacation', { Giurgiu: { '2026-06': true } }, new Date().toISOString());

  const erg = teamAufsetzen({
    adminUserId: a,
    zuordnung: { Giurgiu: 'giurgiu@k.de', Jizdan: 'jizdan@k.de' },
  });

  assert.strictEqual(erg.migration.dienste, 2);
  assert.strictEqual(erg.migration.urlaube, 1);
  assert.strictEqual(erg.migration.zeilen.length, 2, 'jede Zuordnung muss zum Gegenlesen ausgegeben werden');

  const gid = db.prepare('SELECT id FROM users WHERE email=?').get('giurgiu@k.de').id;
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM duties WHERE user_id=?').get(gid).c, 1);
});

test('zweiter Lauf aendert nichts', () => {
  const a = admin('chef5@x.de');
  putDoc(a, 'duties', { Bob: { '2026-08': [{ date: '2026-08-04T10:00:00.000Z', share: 1 }] } },
    new Date().toISOString());
  const z = { Bob: 'bob2@k.de' };
  teamAufsetzen({ adminUserId: a, zuordnung: z });
  const erg = teamAufsetzen({ adminUserId: a, zuordnung: z });
  assert.strictEqual(erg.angelegt.length, 0);
  assert.strictEqual(erg.migration.dienste, 0, 'Dienste duerfen nicht doppelt wandern');
  const bid = db.prepare('SELECT id FROM users WHERE email=?').get('bob2@k.de').id;
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM duties WHERE user_id=?').get(bid).c, 1);
});

test('Namen im Blob ohne Zuordnung brechen ab, bevor Konten entstehen', () => {
  const a = admin('chef6@x.de');
  putDoc(a, 'duties', {
    Bekannt: { '2026-09': [{ date: '2026-09-01T10:00:00.000Z', share: 1 }] },
    Vergessen: { '2026-09': [{ date: '2026-09-02T10:00:00.000Z', share: 1 }] },
  }, new Date().toISOString());

  assert.throws(
    () => teamAufsetzen({ adminUserId: a, zuordnung: { Bekannt: 'bekannt@k.de' } }),
    /Vergessen/,
  );
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM users WHERE email=?').get('bekannt@k.de').c, 0,
    'bei Abbruch darf kein Konto entstanden sein');
});
