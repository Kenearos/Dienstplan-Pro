/**
 * Team-Onboarding in einem Zug: Konten anlegen, Anzeigenamen setzen und die
 * Alt-Dienste des Admins auf die Konten verteilen.
 *
 *   MIGRATE_ADMIN_ID=1 node server/setup-team.js zuordnung.json
 *
 * zuordnung.json ist { "NameWieInDenAltdaten": "mail@example.de", ... }.
 * Die Namen links muessen exakt so lauten wie im duties-Blob — daran haengt
 * die Zuordnung der Alt-Dienste. Der Lauf ist idempotent und bricht ab,
 * bevor er etwas schreibt, wenn ein Name im Blob keine Zuordnung hat.
 */
const { db, getDoc } = require('./db');
const { normalizeEmail } = require('./auth');
const { migriere } = require('./migrate-duties');

function teamAufsetzen({ adminUserId, zuordnung }) {
  // 1. Eingaben pruefen, bevor irgendetwas entsteht.
  const paare = Object.entries(zuordnung).map(([name, rohMail]) => {
    const email = normalizeEmail(rohMail || '');
    if (!email || !email.includes('@')) {
      throw new Error(`Keine gültige E-Mail für "${name}": ${rohMail}`);
    }
    return { name, email };
  });

  // 2. Namen aus den Altdaten gegen die Zuordnung halten — dieselbe Pruefung
  //    wie in migriere(), aber VOR dem Anlegen der Konten, damit ein Tippfehler
  //    keine halben Konten hinterlaesst.
  const doc = getDoc(adminUserId, 'duties');
  const namenImBlob = Object.keys((doc && doc.value) || {});
  const fehlend = namenImBlob.filter((n) => !zuordnung[n]);
  if (fehlend.length) {
    throw new Error(`Diese Namen stehen in den Altdaten, haben aber keine Zuordnung: ${fehlend.join(', ')}`);
  }

  const angelegt = [];
  const aktualisiert = [];
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    for (const { name, email } of paare) {
      const vorhanden = db.prepare('SELECT id, display_name FROM users WHERE email = ?').get(email);
      if (!vorhanden) {
        db.prepare('INSERT INTO users (email,is_admin,created_at,display_name,active) VALUES (?,0,?,?,1)')
          .run(email, now, name);
        angelegt.push(`${name} <${email}>`);
      } else if (vorhanden.display_name !== name) {
        db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, vorhanden.id);
        aktualisiert.push(`${name} <${email}>`);
      }
    }
  });
  tx();

  // 3. Erst jetzt die Alt-Dienste, mit den frisch bekannten IDs.
  const idsNachName = {};
  for (const { name, email } of paare) {
    idsNachName[name] = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  }
  const migration = migriere({ adminUserId, zuordnung: idsNachName });

  return { angelegt, aktualisiert, migration };
}

module.exports = { teamAufsetzen };

if (require.main === module) {
  const datei = process.argv[2];
  if (!datei) { console.error('Nutzung: node server/setup-team.js zuordnung.json'); process.exit(2); }
  const zuordnung = JSON.parse(require('fs').readFileSync(datei, 'utf8'));
  const adminUserId = Number(process.env.MIGRATE_ADMIN_ID || 1);
  const erg = teamAufsetzen({ adminUserId, zuordnung });

  console.log(`Konten angelegt: ${erg.angelegt.length}`);
  for (const z of erg.angelegt) console.log('   +', z);
  console.log(`Namen nachgetragen: ${erg.aktualisiert.length}`);
  for (const z of erg.aktualisiert) console.log('   ~', z);
  console.log(`\nDienste uebernommen: ${erg.migration.dienste}, Urlaubsmonate: ${erg.migration.urlaube}`);
  console.log('Zum Gegenlesen:');
  for (const z of erg.migration.zeilen) console.log('   ', z);
}
