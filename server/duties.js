/**
 * Regeln fuer Dienste. Kennt bewusst kein Express — damit die Fachlogik ohne
 * HTTP testbar bleibt und index.js nur um duenne Routen waechst.
 *
 * Invariante: user_id kommt IMMER vom Aufrufer aus der Session, nie aus
 * Nutzereingaben. Diese Datei prueft das nicht, sie kann es nicht — die
 * Routen in index.js sind dafuer verantwortlich.
 */
const { db } = require('./db');

class FachFehler extends Error {
  constructor(code, nachricht) {
    super(`${code}: ${nachricht}`);
    this.code = code;
    this.nachricht = nachricht;
  }
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
    throw new FachFehler('UNGUELTIG', 'kein gültiger Kalendertag');
  }
}

function pruefeAnteil(share) {
  if (share !== 1 && share !== 0.5) {
    throw new FachFehler('UNGUELTIG', 'Anteil muss 1 oder 0.5 sein');
  }
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

// Admin traegt direkt freigegeben ein — er ist zugleich der Entscheider.
function anlegenDurchAdmin({ adminId, userId, date, share }) {
  pruefeDatum(date);
  pruefeAnteil(share);
  if (!db.prepare('SELECT id FROM users WHERE id=?').get(userId)) {
    throw new FachFehler('NICHT_GEFUNDEN', 'Nutzer nicht gefunden');
  }
  const now = new Date().toISOString();
  try {
    const info = db.prepare(
      `INSERT INTO duties (user_id,date,share,status,created_at,decided_by,decided_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(userId, date, share, 'approved', now, adminId, now);
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
  if (!row || row.user_id !== userId) {
    throw new FachFehler('NICHT_GEFUNDEN', 'Dienst nicht gefunden');
  }
  if (row.status !== 'pending') {
    throw new FachFehler('ENTSCHIEDEN', 'entschiedene Dienste ändert nur der Admin');
  }
  db.prepare('DELETE FROM duties WHERE id=?').run(id);
  return true;
}

// Admin raeumt Fehleintraege — unabhaengig vom Status. Liefert die betroffene
// user_id, damit die Route sie ins Audit schreiben kann.
function loeschenDurchAdmin({ id }) {
  const row = db.prepare('SELECT user_id FROM duties WHERE id=?').get(id);
  if (!row) throw new FachFehler('NICHT_GEFUNDEN', 'Dienst nicht gefunden');
  db.prepare('DELETE FROM duties WHERE id=?').run(id);
  return row.user_id;
}

function entscheiden({ adminId, id, status, note }) {
  if (!STATUS.includes(status)) {
    throw new FachFehler('UNGUELTIG', 'Status muss approved oder rejected sein');
  }
  const row = db.prepare('SELECT * FROM duties WHERE id=?').get(id);
  if (!row) throw new FachFehler('NICHT_GEFUNDEN', 'Dienst nicht gefunden');
  if (row.status !== 'pending') {
    throw new FachFehler('ENTSCHIEDEN', 'dieser Dienst wurde bereits entschieden');
  }
  db.prepare('UPDATE duties SET status=?, note=?, decided_by=?, decided_at=? WHERE id=?')
    .run(status, note || null, adminId, new Date().toISOString(), id);
  // Ob der Admin ueber seinen eigenen Dienst entschieden hat, entscheidet die
  // Route — sie schreibt es als eigenes Audit-Ereignis.
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

module.exports = {
  anlegen, anlegenDurchAdmin, loeschen, loeschenDurchAdmin, entscheiden, monat, offene, FachFehler,
};
