/**
 * Einmaliger Lauf: die Blob-Dienste des Admins auf die Konten der Kollegen
 * verteilen. Wird bewusst NICHT beim Start ausgefuehrt — die Zuordnung
 * Name -> Konto kennt nur ein Mensch, ein Server darf sie nicht raten.
 *
 * Aufruf:  MIGRATE_ADMIN_ID=1 node server/migrate-duties.js '{"Alsholi":3}'
 */
const { db, getDoc } = require('./db');

// Massgeblich ist der lokale Kalendertag in Europe/Berlin, nicht der UTC-Tag:
// die App erzeugte lokale Mittagszeit und speicherte toISOString(). Bei den
// Bestandsdaten (10:00/11:00 UTC) liefern beide Wege dasselbe; die Regel
// greift fuer Eintraege nahe Mitternacht. 'sv-SE' formatiert als YYYY-MM-DD.
function kalendertag(iso) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(iso));
}

function migriere({ adminUserId, zuordnung }) {
  const dutiesDoc = getDoc(adminUserId, 'duties');
  const vacationDoc = getDoc(adminUserId, 'vacation');
  const alleDienste = (dutiesDoc && dutiesDoc.value) || {};
  const alleUrlaube = (vacationDoc && vacationDoc.value) || {};

  // Erst pruefen, dann schreiben: ein halb migrierter Bestand waere schlimmer
  // als gar keiner.
  const fehlend = Object.keys(alleDienste).filter((n) => !zuordnung[n]);
  if (fehlend.length) {
    throw new Error(`Ohne Konto-Zuordnung, Abbruch: ${fehlend.join(', ')}`);
  }

  const einDienst = db.prepare(
    `INSERT INTO duties (user_id,date,share,status,created_at,decided_by,decided_at)
     SELECT ?,?,?,'approved',?,?,?
     WHERE NOT EXISTS (SELECT 1 FROM duties WHERE user_id=? AND date=? AND status<>'rejected')`,
  );
  const einUrlaub = db.prepare('INSERT OR IGNORE INTO vacation_months (user_id, month) VALUES (?,?)');

  let dienste = 0;
  let urlaube = 0;
  const zeilen = [];
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    for (const [name, monate] of Object.entries(alleDienste)) {
      const uid = zuordnung[name];
      for (const liste of Object.values(monate)) {
        for (const d of liste) {
          const tag = kalendertag(d.date);
          const info = einDienst.run(uid, tag, d.share, now, adminUserId, now, uid, tag);
          if (info.changes) {
            dienste += 1;
            zeilen.push(`${name}: ${d.date} -> ${tag} (${d.share})`);
          }
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

if (require.main === module) {
  const zuordnung = JSON.parse(process.argv[2] || '{}');
  const adminId = Number(process.env.MIGRATE_ADMIN_ID || 1);
  const erg = migriere({ adminUserId: adminId, zuordnung });
  console.log(`${erg.dienste} Dienste, ${erg.urlaube} Urlaubsmonate uebernommen`);
  for (const z of erg.zeilen) console.log('  ', z);
}
