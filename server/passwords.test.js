const { test } = require('node:test');
const assert = require('node:assert');
const { hashPasswort, pruefePasswort, PASSWORT_MIN } = require('./passwords');

test('hashPasswort: gleiches Passwort ergibt verschiedene Hashes (Salt)', () => {
  const a = hashPasswort('einSicheresPasswort');
  const b = hashPasswort('einSicheresPasswort');
  assert.notStrictEqual(a, b, 'ohne zufaelliges Salt waeren beide gleich');
  assert.ok(a.startsWith('scrypt$'), 'Verfahren muss im Hash stehen');
  assert.ok(!a.includes('einSicheresPasswort'), 'das Klartextpasswort darf nirgends auftauchen');
});

test('pruefePasswort: richtig ja, falsch nein', () => {
  const h = hashPasswort('Regenschirm-Blau-42');
  assert.strictEqual(pruefePasswort('Regenschirm-Blau-42', h), true);
  assert.strictEqual(pruefePasswort('regenschirm-blau-42', h), false);
  assert.strictEqual(pruefePasswort('', h), false);
});

test('pruefePasswort: kaputter oder fehlender Hash wirft nicht, sondern sagt nein', () => {
  for (const h of [null, undefined, '', 'quatsch', 'scrypt$nur$zwei']) {
    assert.strictEqual(pruefePasswort('irgendwas', h), false, `Hash ${h} muss false liefern`);
  }
});

test('zu kurze Passwoerter werden abgelehnt', () => {
  assert.ok(PASSWORT_MIN >= 8, 'Mindestlaenge zu niedrig');
  assert.throws(() => hashPasswort('kurz'), /mindestens/i);
  assert.throws(() => hashPasswort(null), /mindestens/i);
});
