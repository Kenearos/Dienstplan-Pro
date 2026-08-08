# Team-Dienstplan TP1 — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Server verwaltet Dienste als einzelne Datensätze mit Besitzer und Freigabe-Status — anlegen, ansehen, entscheiden, migrieren. Die bestehende Oberfläche bleibt unverändert lauffähig.

**Architecture:** Neue SQLite-Tabelle `duties` neben den bestehenden Blob-Dokumenten. Schreiben ausschließlich mit der `user_id` aus der Session; ein neuer Lesepfad (`/api/roster`) liefert den Monatsplan des ganzen Teams ohne Beträge. Entscheidungen nur für Admins, jede im `audit_log`. Die alten Blobs bleiben in TP1 die Wahrheit für die Oberfläche; die neue Tabelle wird befüllt und getestet, aber von keiner UI gelesen.

**Tech Stack:** Node 20, Express 4, better-sqlite3, `node --test` (Bordmittel, kein Framework).

**Spec:** `docs/superpowers/specs/2026-08-08-team-dienstplan-design.md` (zwei Gate-Linsen durchlaufen)

## Global Constraints

- **Kein neues npm-Paket.** Alles mit Bordmitteln und den vorhandenen Abhängigkeiten.
- **`user_id` NIEMALS aus dem Request-Body oder der Query.** Immer `req.user.id`. Das ist die v1.0-Invariante und gilt für jeden schreibenden Zugriff ohne Ausnahme.
- **Beträge gehören nicht in `/api/roster`.** Kein Feld, das einen Euro-Betrag enthält oder ableiten lässt.
- **Statuswerte auf Englisch** (`pending`, `approved`, `rejected`), Meldungstexte auf Deutsch — Hauskonvention aus CLAUDE.md.
- **Idempotentes DDL:** `CREATE TABLE IF NOT EXISTS`; Spalten nur nach Prüfung via `PRAGMA table_info` hinzufügen.
- **Testdateien fassen niemals das echte `~`/HOME an.** `process.env.DATA_DIR` wird als Erstes auf ein `mkdtemp`-Verzeichnis gesetzt, davor kein `require` von `./db` oder `./index`.
- **Ein Commit pro Task**, volle Suite (`npm test`) muss vor jedem Commit grün sein.

## File Structure

| Datei | Verantwortung |
|---|---|
| `server/db.js` (ändern) | Schema-DDL: `duties`, partieller Index, `users.display_name`, `users.active`, `vacation_months` |
| `server/duties.js` (neu) | Reine Datenzugriffs- und Regel-Schicht: anlegen, löschen, entscheiden, Monat lesen. Kennt kein Express |
| `server/duties-routes.test.js` (neu) | HTTP-Ebene: Auth, Status-Codes, Sichtbarkeit |
| `server/duties.test.js` (neu) | Regel-Ebene ohne HTTP: Constraints, Validierung |
| `server/index.js` (ändern) | Endpunkte, die `server/duties.js` verdrahten |
| `server/migrate-duties.js` (neu) | Einmaliger Migrationslauf Blob → Tabelle, als Funktion + CLI |
| `server/migrate-duties.test.js` (neu) | Migration: Datumsregel, Urlaub, Idempotenz, Abbruch |

`server/duties.js` bleibt bewusst frei von Express: die Regeln sind damit ohne HTTP testbar, und `index.js` wächst nur um dünne Routen.

---

### Task 1: Schema

**Files:**
- Modify: `server/db.js:14-57` (der `db.exec`-Block)
- Test: `server/duties.test.js` (neu)

**Interfaces:**
- Consumes: nichts
- Produces: Tabellen `duties`, `vacation_months`; Spalten `users.display_name`, `users.active`. Export von `db.js` bleibt unverändert `{ db, getDoc, putDoc, DB_PATH, DATA_DIR }`.

- [ ] **Step 1: Write the failing test**

```javascript
// server/duties.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/duties.test.js`
Expected: FAIL — `no such table: duties`

- [ ] **Step 3: Write minimal implementation**

In `server/db.js`, an den bestehenden `db.exec(...)`-Block anhängen (innerhalb desselben Template-Strings, direkt vor den `CREATE INDEX`-Zeilen):

```sql
  CREATE TABLE IF NOT EXISTS duties (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    date       TEXT NOT NULL,
    share      REAL NOT NULL,
    status     TEXT NOT NULL,
    note       TEXT,
    created_at TEXT NOT NULL,
    decided_by INTEGER REFERENCES users(id),
    decided_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_duties_person_tag
    ON duties(user_id, date) WHERE status <> 'rejected';
  CREATE INDEX IF NOT EXISTS idx_duties_date ON duties(date);
  CREATE TABLE IF NOT EXISTS vacation_months (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    month   TEXT NOT NULL,
    PRIMARY KEY (user_id, month)
  );
```

Danach, nach dem `db.exec(...)`-Aufruf, die Spalten idempotent nachrüsten (gleiches Muster wie `migrateToMultiUser` in `server/auth.js`):

```javascript
// Spalten nachruesten, ohne bestehende Datenbanken zu brechen.
const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userCols.includes('display_name')) db.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
if (!userCols.includes('active')) db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/duties.test.js`
Expected: PASS (3 Tests)

- [ ] **Step 5: Idempotenz belegen**

Run: `node --test server/duties.test.js && node -e "process.env.DATA_DIR=require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'x-')); require('./server/db'); delete require.cache[require.resolve('./server/db')]; require('./server/db'); console.log('zweiter Lauf ok')"`
Expected: `zweiter Lauf ok` ohne Fehler

- [ ] **Step 6: Commit**

```bash
git add server/db.js server/duties.test.js
git commit -m "feat(duties): Schema fuer Dienste als Datensaetze

duties mit Besitzer und Status, partieller Unique-Index (abgelehnte
Dienste blockieren den Tag nicht), vacation_months, users.display_name
und users.active. DDL idempotent, ON DELETE RESTRICT statt CASCADE."
```

---

### Task 2: Regel-Schicht `server/duties.js`

**Files:**
- Create: `server/duties.js`
- Test: `server/duties.test.js` (erweitern)

**Interfaces:**
- Consumes: `db` aus `./db`
- Produces:
  - `anlegen({ userId, date, share })` → `{ id }`, wirft `FachFehler` mit `.code`
  - `loeschen({ userId, id })` → `true`, wirft `FachFehler`
  - `entscheiden({ adminId, id, status, note })` → `{ selbst: boolean }`, wirft `FachFehler`
  - `monat(monatString)` → `[{ id, userId, name, date, share, status }]`
  - `offene()` → wie `monat`, aber nur `status='pending'`
  - `class FachFehler extends Error` mit `code` (`'DOPPELT' | 'NICHT_GEFUNDEN' | 'ENTSCHIEDEN' | 'UNGUELTIG'`)

- [ ] **Step 1: Write the failing test**

An `server/duties.test.js` anhängen:

```javascript
const D = require('./duties');

function neuerNutzer(email, name) {
  const id = db.prepare('INSERT INTO users (email,is_admin,created_at,display_name) VALUES (?,0,?,?)')
    .run(email, new Date().toISOString(), name).lastInsertRowid;
  return Number(id);
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

test('monat: Name faellt auf den lokalen Teil der E-Mail zurueck', () => {
  const id = Number(db.prepare('INSERT INTO users (email,is_admin,created_at) VALUES (?,0,?)')
    .run('ohnename@x.de', new Date().toISOString()).lastInsertRowid);
  D.anlegen({ userId: id, date: '2026-11-04', share: 1.0 });
  const zeile = D.monat('2026-11').find(z => z.userId === id);
  assert.strictEqual(zeile.name, 'ohnename');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/duties.test.js`
Expected: FAIL — `Cannot find module './duties'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// server/duties.js — Regeln fuer Dienste. Kennt bewusst kein Express,
// damit die Fachlogik ohne HTTP testbar bleibt.
const { db } = require('./db');

class FachFehler extends Error {
  constructor(code, nachricht) { super(`${code}: ${nachricht}`); this.code = code; this.nachricht = nachricht; }
}

const STATUS = ['approved', 'rejected'];

// Echter Kalendertag, nicht nur Formatpruefung: 2026-02-30 ist syntaktisch
// korrekt und trotzdem kein Datum.
function pruefeDatum(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new FachFehler('UNGUELTIG', 'Datum muss YYYY-MM-DD sein');
  }
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) {
    throw new FachFehler('UNGUELTIG', 'kein gueltiger Kalendertag');
  }
}

function pruefeAnteil(share) {
  if (share !== 1 && share !== 0.5) throw new FachFehler('UNGUELTIG', 'Anteil muss 1 oder 0.5 sein');
}

function anlegen({ userId, date, share }) {
  pruefeDatum(date);
  pruefeAnteil(share);
  try {
    const info = db.prepare(
      'INSERT INTO duties (user_id,date,share,status,created_at) VALUES (?,?,?,?,?)',
    ).run(userId, date, share, 'pending', new Date().toISOString());
    return { id: Number(info.lastInsertRowid) };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      throw new FachFehler('DOPPELT', 'für diesen Tag ist bereits ein Dienst eingetragen');
    }
    throw e;
  }
}

function loeschen({ userId, id }) {
  const row = db.prepare('SELECT * FROM duties WHERE id=?').get(id);
  // Fremde ID wie nicht vorhanden behandeln: verraet nicht, ob sie existiert.
  if (!row || row.user_id !== userId) throw new FachFehler('NICHT_GEFUNDEN', 'Dienst nicht gefunden');
  if (row.status !== 'pending') throw new FachFehler('ENTSCHIEDEN', 'entschiedene Dienste ändert nur der Admin');
  db.prepare('DELETE FROM duties WHERE id=?').run(id);
  return true;
}

function entscheiden({ adminId, id, status, note }) {
  if (!STATUS.includes(status)) throw new FachFehler('UNGUELTIG', 'Status muss approved oder rejected sein');
  const row = db.prepare('SELECT * FROM duties WHERE id=?').get(id);
  if (!row) throw new FachFehler('NICHT_GEFUNDEN', 'Dienst nicht gefunden');
  if (row.status !== 'pending') throw new FachFehler('ENTSCHIEDEN', 'dieser Dienst wurde bereits entschieden');
  db.prepare('UPDATE duties SET status=?, note=?, decided_by=?, decided_at=? WHERE id=?')
    .run(status, note || null, adminId, new Date().toISOString(), id);
  return { selbst: row.user_id === adminId };
}

const AUSWAHL = `
  SELECT d.id, d.user_id AS userId, d.date, d.share, d.status,
         COALESCE(u.display_name, substr(u.email, 1, instr(u.email,'@')-1)) AS name
  FROM duties d JOIN users u ON u.id = d.user_id`;

function monat(m) {
  if (typeof m !== 'string' || !/^\d{4}-\d{2}$/.test(m)) {
    throw new FachFehler('UNGUELTIG', 'Monat muss YYYY-MM sein');
  }
  return db.prepare(`${AUSWAHL} WHERE d.date LIKE ? ORDER BY d.date, name`).all(`${m}-%`);
}

function offene() {
  return db.prepare(`${AUSWAHL} WHERE d.status='pending' ORDER BY d.date, name`).all();
}

module.exports = { anlegen, loeschen, entscheiden, monat, offene, FachFehler };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/duties.test.js`
Expected: PASS (alle Tests)

- [ ] **Step 5: Volle Suite**

Run: `npm test`
Expected: alle bisherigen Tests weiterhin grün

- [ ] **Step 6: Commit**

```bash
git add server/duties.js server/duties.test.js
git commit -m "feat(duties): Regel-Schicht ohne HTTP

anlegen/loeschen/entscheiden/monat mit Validierung, Fachfehlern und
Namensrueckfall auf den lokalen Teil der E-Mail."
```

---

### Task 3: Endpunkte

**Files:**
- Modify: `server/index.js` (nach dem `/api/state`-Block, vor `app.use(express.static(...))`)
- Test: `server/duties-routes.test.js` (neu)

**Interfaces:**
- Consumes: `server/duties.js` (Task 2), `authMiddleware`/`adminMiddleware` aus `index.js`
- Produces: die sechs Routen aus der Spec

- [ ] **Step 1: Write the failing test**

```javascript
// server/duties-routes.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-droutes-'));
process.env.RATE_LIMIT_IP = '1000';
delete process.env.SMTP_HOST;
const app = require('./index');
const { db } = require('./db');
const { createLoginToken } = require('./auth');

function seedUser(email, isAdmin = 0, name = null) {
  return Number(db.prepare('INSERT INTO users (email,is_admin,created_at,display_name) VALUES (?,?,?,?)')
    .run(email, isAdmin, new Date().toISOString(), name).lastInsertRowid);
}
async function withServer(fn) {
  const server = app.listen(0);
  try { return await fn(server.address().port); } finally { server.close(); }
}
function req(port, p, opts = {}) {
  return fetch(`http://127.0.0.1:${port}${p}`, { redirect: 'manual', ...opts });
}
const json = (o) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
const form = (s) => ({ headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: s });

async function anmelden(port, userId) {
  const raw = createLoginToken(userId);
  const r = await req(port, '/auth/confirm', { method: 'POST', ...form(`token=${raw}`) });
  return r.headers.get('set-cookie').split(';')[0];
}
const mit = (cookie, extra = {}) => ({
  ...extra,
  headers: { ...(extra.headers || {}), Cookie: cookie },
});

test('POST /api/duties: ohne Anmeldung 401, angemeldet 201', async () => {
  const uid = seedUser('r1@x.de', 0, 'Alsholi');
  await withServer(async (port) => {
    let r = await req(port, '/api/duties', { method: 'POST', ...json({ date: '2027-01-05', share: 1 }) });
    assert.strictEqual(r.status, 401);

    const c = await anmelden(port, uid);
    r = await req(port, '/api/duties', mit(c, { method: 'POST', ...json({ date: '2027-01-05', share: 1 }) }));
    assert.strictEqual(r.status, 201);
    const body = await r.json();
    assert.ok(body.id, 'id fehlt in der Antwort');
  });
});

test('POST /api/duties: user_id aus dem Body wird ignoriert (Anti-IDOR)', async () => {
  const ich = seedUser('r2@x.de', 0, 'Cabrera');
  const fremd = seedUser('r3@x.de', 0, 'Fremd');
  await withServer(async (port) => {
    const c = await anmelden(port, ich);
    const r = await req(port, '/api/duties',
      mit(c, { method: 'POST', ...json({ date: '2027-01-06', share: 1, user_id: fremd, userId: fremd }) }));
    assert.strictEqual(r.status, 201);
    const row = db.prepare('SELECT user_id FROM duties WHERE date=?').get('2027-01-06');
    assert.strictEqual(row.user_id, ich, 'Der Dienst wurde dem falschen Konto zugeordnet');
  });
});

test('POST /api/duties: doppelter Tag -> 409, ungueltige Werte -> 400', async () => {
  const uid = seedUser('r4@x.de', 0, 'Gaxhja');
  await withServer(async (port) => {
    const c = await anmelden(port, uid);
    await req(port, '/api/duties', mit(c, { method: 'POST', ...json({ date: '2027-01-07', share: 1 }) }));
    let r = await req(port, '/api/duties', mit(c, { method: 'POST', ...json({ date: '2027-01-07', share: 0.5 }) }));
    assert.strictEqual(r.status, 409);
    r = await req(port, '/api/duties', mit(c, { method: 'POST', ...json({ date: '2027-02-30', share: 1 }) }));
    assert.strictEqual(r.status, 400);
  });
});

test('GET /api/roster: Monatspflicht, Namen sichtbar, keine Betraege', async () => {
  const a = seedUser('r5@x.de', 0, 'Giurgiu');
  const b = seedUser('r6@x.de', 0, 'Jizdan');
  await withServer(async (port) => {
    const ca = await anmelden(port, a);
    const cb = await anmelden(port, b);
    await req(port, '/api/duties', mit(ca, { method: 'POST', ...json({ date: '2027-03-01', share: 1 }) }));
    await req(port, '/api/duties', mit(cb, { method: 'POST', ...json({ date: '2027-03-02', share: 1 }) }));

    let r = await req(port, '/api/roster', mit(ca));
    assert.strictEqual(r.status, 400, 'ohne month muss 400 kommen');

    r = await req(port, '/api/roster?month=2027-03', mit(ca));
    assert.strictEqual(r.status, 200);
    const { duties } = await r.json();
    assert.strictEqual(duties.length, 2, 'jeder sieht den ganzen Monat des Teams');
    assert.ok(duties.some(d => d.name === 'Jizdan'), 'fremder Name fehlt im Aushang');
    assert.ok(!/bonus|betrag|amount|euro/i.test(JSON.stringify(duties)), 'Betrag im Aushang');
  });
});

test('DELETE /api/duties/:id: eigener pending 200, fremder 404, entschiedener 409', async () => {
  const ich = seedUser('r7@x.de', 0, 'Guenes');
  const admin = seedUser('r8@x.de', 1, 'Admin');
  await withServer(async (port) => {
    const c = await anmelden(port, ich);
    const ca = await anmelden(port, admin);

    let r = await req(port, '/api/duties', mit(c, { method: 'POST', ...json({ date: '2027-04-01', share: 1 }) }));
    const { id } = await r.json();
    r = await req(port, `/api/duties/${id}`, mit(ca, { method: 'DELETE' }));
    assert.strictEqual(r.status, 404, 'fremde ID darf nicht loeschbar sein');
    r = await req(port, `/api/duties/${id}`, mit(c, { method: 'DELETE' }));
    assert.strictEqual(r.status, 200);

    r = await req(port, '/api/duties', mit(c, { method: 'POST', ...json({ date: '2027-04-02', share: 1 }) }));
    const zweite = (await r.json()).id;
    await req(port, `/api/duties/${zweite}/decision`, mit(ca, { method: 'POST', ...json({ status: 'approved' }) }));
    r = await req(port, `/api/duties/${zweite}`, mit(c, { method: 'DELETE' }));
    assert.strictEqual(r.status, 409);
  });
});

test('decision: Nicht-Admin 403, Admin 200 + Audit; pending-Liste nur fuer Admin', async () => {
  const ich = seedUser('r9@x.de', 0, 'Elsharawy');
  const admin = seedUser('r10@x.de', 1, 'Admin2');
  await withServer(async (port) => {
    const c = await anmelden(port, ich);
    const ca = await anmelden(port, admin);
    const r0 = await req(port, '/api/duties', mit(c, { method: 'POST', ...json({ date: '2027-05-01', share: 1 }) }));
    const { id } = await r0.json();

    let r = await req(port, `/api/duties/${id}/decision`, mit(c, { method: 'POST', ...json({ status: 'approved' }) }));
    assert.strictEqual(r.status, 403);
    r = await req(port, '/api/duties/pending', mit(c));
    assert.strictEqual(r.status, 403);

    const vorher = db.prepare("SELECT COUNT(*) c FROM audit_log WHERE event='duty_decision'").get().c;
    r = await req(port, `/api/duties/${id}/decision`, mit(ca, { method: 'POST', ...json({ status: 'approved' }) }));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE event='duty_decision'").get().c, vorher + 1);

    r = await req(port, '/api/duties/pending', mit(ca));
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray((await r.json()).duties));
  });
});

test('decision ueber eigenen Dienst wird als self_decision geloggt', async () => {
  const admin = seedUser('r11@x.de', 1, 'AdminSelbst');
  await withServer(async (port) => {
    const ca = await anmelden(port, admin);
    const r0 = await req(port, '/api/duties', mit(ca, { method: 'POST', ...json({ date: '2027-06-01', share: 1 }) }));
    const { id } = await r0.json();
    await req(port, `/api/duties/${id}/decision`, mit(ca, { method: 'POST', ...json({ status: 'approved' }) }));
    assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE event='self_decision'").get().c, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/duties-routes.test.js`
Expected: FAIL — 404 statt 201 (Route fehlt)

- [ ] **Step 3: Write minimal implementation**

In `server/index.js` oben ergänzen:

```javascript
const duties = require('./duties');
```

Und vor `app.use(express.static(...))` einfügen:

```javascript
// ── Dienste als Datensaetze ──────────────────────────────────────────
// user_id kommt ausschliesslich aus der Session (req.user.id) — die
// v1.0-Invariante gilt unveraendert fuer jeden Schreibzugriff.
function fachFehlerAntwort(res, e) {
  const codes = { UNGUELTIG: 400, NICHT_GEFUNDEN: 404, DOPPELT: 409, ENTSCHIEDEN: 409 };
  if (e instanceof duties.FachFehler) return res.status(codes[e.code] || 400).json({ error: e.nachricht });
  throw e;
}

app.post('/api/duties', authMiddleware, (req, res) => {
  const { date, share } = req.body || {};
  try {
    const { id } = duties.anlegen({ userId: req.user.id, date, share });
    res.status(201).json({ id });
  } catch (e) { fachFehlerAntwort(res, e); }
});

app.delete('/api/duties/:id', authMiddleware, (req, res) => {
  try {
    duties.loeschen({ userId: req.user.id, id: parseInt(req.params.id, 10) });
    res.json({ ok: true });
  } catch (e) { fachFehlerAntwort(res, e); }
});

// Aushang: bewusst kontouebergreifend lesbar, aber ohne jeden Betrag.
app.get('/api/roster', authMiddleware, (req, res) => {
  try {
    res.json({ duties: duties.monat(req.query.month) });
  } catch (e) { fachFehlerAntwort(res, e); }
});

app.get('/api/duties/pending', authMiddleware, adminMiddleware, (req, res) => {
  res.json({ duties: duties.offene() });
});

app.post('/api/duties/:id/decision', authMiddleware, adminMiddleware, (req, res) => {
  const { status, note } = req.body || {};
  try {
    const { selbst } = duties.entscheiden({
      adminId: req.user.id, id: parseInt(req.params.id, 10), status, note,
    });
    audit('duty_decision', req.user.id, ipHashOf(req));
    // Entscheidung ueber eigene Dienste ist erlaubt (kein zweiter Freigeber
    // bei acht Personen), muss aber in der Historie auffallen.
    if (selbst) audit('self_decision', req.user.id, ipHashOf(req));
    res.json({ ok: true });
  } catch (e) { fachFehlerAntwort(res, e); }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/duties-routes.test.js`
Expected: PASS (7 Tests)

- [ ] **Step 5: Volle Suite**

Run: `npm test`
Expected: alle Tests grün

- [ ] **Step 6: Commit**

```bash
git add server/index.js server/duties-routes.test.js
git commit -m "feat(duties): Endpunkte fuer Eintragen, Aushang und Freigabe

Schreiben strikt mit der user_id aus der Session; /api/roster liest
kontouebergreifend, aber ohne Betraege. Entscheidungen nur fuer Admins,
jede im audit_log, Selbstentscheidungen zusaetzlich als self_decision."
```

---

### Task 4: Ausscheiden statt Löschen

**Files:**
- Modify: `server/index.js:141-153` (`DELETE /api/admin/users/:id`)
- Test: `server/duties-routes.test.js` (erweitern)

**Interfaces:**
- Consumes: `users.active` (Task 1), `duties` (Task 1)
- Produces: `POST /api/admin/users/:id/deactivate`; `DELETE` scheitert bei vorhandenen Diensten mit `409`

- [ ] **Step 1: Write the failing test**

An `server/duties-routes.test.js` anhängen:

```javascript
test('Konto mit Diensten laesst sich nicht loeschen, nur deaktivieren', async () => {
  const admin = seedUser('r12@x.de', 1, 'Chef');
  const geht = seedUser('r13@x.de', 0, 'Scheidet');
  await withServer(async (port) => {
    const ca = await anmelden(port, admin);
    const cg = await anmelden(port, geht);
    const r0 = await req(port, '/api/duties', mit(cg, { method: 'POST', ...json({ date: '2027-07-01', share: 1 }) }));
    const { id } = await r0.json();
    await req(port, `/api/duties/${id}/decision`, mit(ca, { method: 'POST', ...json({ status: 'approved' }) }));

    // Loeschen wuerde die Grundlage gezahlter Verguetung vernichten
    let r = await req(port, `/api/admin/users/${geht}`, mit(ca, { method: 'DELETE' }));
    assert.strictEqual(r.status, 409);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM duties WHERE user_id=?').get(geht).c, 1,
      'Dienste duerfen nicht verschwunden sein');

    r = await req(port, `/api/admin/users/${geht}/deactivate`, mit(ca, { method: 'POST' }));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(db.prepare('SELECT active FROM users WHERE id=?').get(geht).active, 0);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM duties WHERE user_id=?').get(geht).c, 1);
  });
});

test('deaktiviertes Konto kann sich nicht mehr anmelden', async () => {
  const uid = seedUser('r14@x.de', 0, 'Weg');
  db.prepare('UPDATE users SET active=0 WHERE id=?').run(uid);
  await withServer(async (port) => {
    const raw = createLoginToken(uid);
    const r = await req(port, '/auth/confirm', { method: 'POST', ...form(`token=${raw}`) });
    assert.strictEqual(r.status, 400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/duties-routes.test.js`
Expected: FAIL — Löschen liefert 200 statt 409

- [ ] **Step 3: Write minimal implementation**

In `server/index.js`, im bestehenden `DELETE /api/admin/users/:id` **vor** dem `DELETE FROM users`:

```javascript
  const anzahl = db.prepare('SELECT COUNT(*) c FROM duties WHERE user_id = ?').get(id).c;
  if (anzahl > 0) {
    return res.status(409).json({
      error: 'Dieses Konto hat Dienste und darf nicht gelöscht werden — bitte deaktivieren.',
    });
  }
```

Direkt darunter die neue Route:

```javascript
app.post('/api/admin/users/:id/deactivate', authMiddleware, adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Ungültige ID' });
  const target = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
  if (target.is_admin && db.prepare('SELECT COUNT(*) c FROM users WHERE is_admin = 1 AND active = 1').get().c <= 1) {
    return res.status(400).json({ error: 'Der letzte aktive Admin kann nicht deaktiviert werden.' });
  }
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
  deleteUserSessions(id);
  audit('admin_deactivate', req.user.id, ipHashOf(req));
  res.json({ ok: true });
});
```

`deleteUserSessions` aus `./auth` in die bestehende Import-Liste in `server/index.js` aufnehmen.

In `server/auth.js`, in `consumeLoginToken`, die Abfrage um `AND u.active = 1` erweitern, damit deaktivierte Konten keine Session mehr bekommen:

```javascript
'SELECT t.user_id AS userId, u.email, u.is_admin AS isAdmin FROM login_tokens t JOIN users u ON t.user_id = u.id WHERE t.token_hash = ? AND u.active = 1'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/duties-routes.test.js`
Expected: PASS

- [ ] **Step 5: Volle Suite**

Run: `npm test`
Expected: grün — insbesondere die bestehenden Auth-Tests, die `consumeLoginToken` nutzen

- [ ] **Step 6: Commit**

```bash
git add server/index.js server/auth.js server/duties-routes.test.js
git commit -m "feat(users): Ausscheiden heisst deaktivieren, nicht loeschen

Ein Konto mit Diensten laesst sich nicht mehr loeschen (409) - sonst
haette der erste Personalwechsel die Grundlage gezahlter Verguetung
vernichtet. Deaktivierte Konten bekommen keine Session mehr."
```

---

### Task 5: Migration Blob → Tabelle

**Files:**
- Create: `server/migrate-duties.js`
- Test: `server/migrate-duties.test.js`

**Interfaces:**
- Consumes: `duties`-Tabelle (Task 1), `getDoc` aus `./db`
- Produces: `migriere({ adminUserId, zuordnung, trocken })` → `{ dienste, urlaube, zeilen }`; wirft `Error` mit Liste fehlender Namen

- [ ] **Step 1: Write the failing test**

```javascript
// server/migrate-duties.test.js
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
    Anna: { '2026-06': [{ date: '2026-06-03T10:00:00.000Z', share: 1 },
                        { date: '2026-06-06T10:00:00.000Z', share: 0.5 }] },
  }, new Date().toISOString());
  putDoc(admin, 'vacation', { Anna: { '2026-06': true } }, new Date().toISOString());

  const erg = migriere({ adminUserId: admin, zuordnung: { Anna: anna } });
  assert.strictEqual(erg.dienste, 2);
  assert.strictEqual(erg.urlaube, 1);

  const rows = db.prepare('SELECT * FROM duties WHERE user_id=? ORDER BY date').all(anna);
  assert.deepStrictEqual(rows.map(r => r.date), ['2026-06-03', '2026-06-06']);
  assert.ok(rows.every(r => r.status === 'approved'), 'Altdaten gelten als freigegeben');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/migrate-duties.test.js`
Expected: FAIL — `Cannot find module './migrate-duties'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// server/migrate-duties.js — einmaliger Lauf: Blob-Dienste des Admins auf
// die Konten der Kollegen verteilen. Wird NICHT beim Start ausgefuehrt:
// die Zuordnung Name->Konto kennt nur ein Mensch.
const { db, getDoc } = require('./db');

// Massgeblich ist der lokale Kalendertag in Europe/Berlin, nicht der
// UTC-Tag: die App erzeugte lokale Mittagszeit und speicherte toISOString().
// 'sv-SE' formatiert als YYYY-MM-DD.
function kalendertag(iso) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(iso));
}

function migriere({ adminUserId, zuordnung }) {
  const dutiesDoc = getDoc(adminUserId, 'duties');
  const vacationDoc = getDoc(adminUserId, 'vacation');
  const alleDienste = (dutiesDoc && dutiesDoc.value) || {};
  const alleUrlaube = (vacationDoc && vacationDoc.value) || {};

  const fehlend = Object.keys(alleDienste).filter(n => !zuordnung[n]);
  if (fehlend.length) {
    throw new Error(`Ohne Konto-Zuordnung, Abbruch: ${fehlend.join(', ')}`);
  }

  const einDienst = db.prepare(
    `INSERT INTO duties (user_id,date,share,status,created_at,decided_by,decided_at)
     SELECT ?,?,?,'approved',?,?,?
     WHERE NOT EXISTS (SELECT 1 FROM duties WHERE user_id=? AND date=? AND status<>'rejected')`,
  );
  const einUrlaub = db.prepare(
    'INSERT OR IGNORE INTO vacation_months (user_id, month) VALUES (?,?)',
  );

  let dienste = 0; let urlaube = 0; const zeilen = [];
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const [name, monate] of Object.entries(alleDienste)) {
      const uid = zuordnung[name];
      for (const liste of Object.values(monate)) {
        for (const d of liste) {
          const tag = kalendertag(d.date);
          const info = einDienst.run(uid, tag, d.share, now, adminUserId, now, uid, tag);
          if (info.changes) { dienste += 1; zeilen.push(`${name} ${d.date} -> ${tag} (${d.share})`); }
        }
      }
    }
    for (const [name, monate] of Object.entries(alleUrlaube)) {
      const uid = zuordnung[name];
      if (!uid) continue;
      for (const [monat, an] of Object.entries(monate)) {
        if (an) { const i = einUrlaub.run(uid, monat); if (i.changes) urlaube += 1; }
      }
    }
  });
  tx();
  return { dienste, urlaube, zeilen };
}

module.exports = { migriere, kalendertag };

// CLI: node server/migrate-duties.js '{"Alsholi":3,"Cabrera":4}'
if (require.main === module) {
  const zuordnung = JSON.parse(process.argv[3] || process.argv[2] || '{}');
  const adminId = Number(process.env.MIGRATE_ADMIN_ID || 1);
  const erg = migriere({ adminUserId: adminId, zuordnung });
  console.log(`${erg.dienste} Dienste, ${erg.urlaube} Urlaubsmonate uebernommen`);
  for (const z of erg.zeilen) console.log('  ', z);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/migrate-duties.test.js`
Expected: PASS (4 Tests)

- [ ] **Step 5: Volle Suite**

Run: `npm test`
Expected: grün

- [ ] **Step 6: Commit**

```bash
git add server/migrate-duties.js server/migrate-duties.test.js
git commit -m "feat(duties): Migrationslauf Blob -> Tabelle

Kein Startup-Automatismus: die Zuordnung Name->Konto kommt vom Menschen.
Datum wird auf den lokalen Kalendertag in Europe/Berlin gekuerzt,
Urlaubsflags wandern mit, Altdaten gelten als freigegeben. Idempotent,
Abbruch bei unzugeordnetem Namen ohne Teilschreibung."
```

---

## Self-Review

**Spec-Abdeckung:** Datenmodell → Task 1 · Regeln und Validierung → Task 2 · Endpunkte und Autorisierung → Task 3 · Ausscheiden/Aufbewahrung → Task 4 · Migration inkl. Zeitzonenregel und Urlaub → Task 5. Die Übergangsregel („alte Blobs bleiben die Wahrheit") ist erfüllt, weil keine Oberfläche die neuen Endpunkte konsumiert — `/api/state` bleibt unangetastet. `410 Gone` gehört zum Umstellungspunkt am Ende von TP3 und ist bewusst nicht Teil dieses Plans.

**Nicht abgedeckt, bewusst:** `/api/bonus` (TP4), Team-Tabelle (TP3), Anzeigenamen-Pflege in der Oberfläche (TP2).

**Typkonsistenz geprüft:** `anlegen/loeschen/entscheiden/monat/offene/FachFehler` heißen in Task 3 exakt wie in Task 2 definiert; `kalendertag` und `migriere` in Task 5 entsprechen dem Testaufruf; `deleteUserSessions` existiert bereits in `server/auth.js` und wird in Task 4 nur importiert.
