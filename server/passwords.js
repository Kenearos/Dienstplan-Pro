/**
 * Passwort-Hashing mit Bordmitteln: crypto.scrypt aus Node, kein Paket.
 *
 * Format: scrypt$N$r$p$<salt-hex>$<hash-hex>. Die Parameter stehen mit im
 * Hash, damit sie sich spaeter erhoehen lassen, ohne alte Hashes zu brechen.
 */
const crypto = require('crypto');

const PASSWORT_MIN = 10;
// N=16384, r=8, p=1: die ueblichen scrypt-Parameter, ~50-100 ms pro Hash.
// Langsam genug gegen Rateversuche, schnell genug fuer einen Login.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function hashPasswort(klartext) {
  if (typeof klartext !== 'string' || klartext.length < PASSWORT_MIN) {
    throw new Error(`Das Passwort muss mindestens ${PASSWORT_MIN} Zeichen haben.`);
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(klartext, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function pruefePasswort(klartext, gespeichert) {
  if (typeof klartext !== 'string' || typeof gespeichert !== 'string') return false;
  const teile = gespeichert.split('$');
  if (teile.length !== 6 || teile[0] !== 'scrypt') return false;
  const [, n, r, p, saltHex, hashHex] = teile;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const erwartet = Buffer.from(hashHex, 'hex');
    if (!salt.length || !erwartet.length) return false;
    const berechnet = crypto.scryptSync(klartext, salt, erwartet.length, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    // timingSafeEqual statt ===: die Laufzeit soll nichts ueber den Hash verraten.
    return crypto.timingSafeEqual(berechnet, erwartet);
  } catch {
    return false;
  }
}

module.exports = { hashPasswort, pruefePasswort, PASSWORT_MIN };
