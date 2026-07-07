const { test } = require('node:test');
const assert = require('node:assert');
const ImageImporter = require('./image-import.js');

const imp = new ImageImporter(null);

test('normalizeName entfernt Anrede/Titel (auch gestapelt)', () => {
  assert.strictEqual(imp.normalizeName('Herr Alsholi'), 'alsholi');
  assert.strictEqual(imp.normalizeName('Frau Cabrera'), 'cabrera');
  assert.strictEqual(imp.normalizeName('Herr Dr. Azizi'), 'azizi');
  assert.strictEqual(imp.normalizeName('Hr. Schierholz'), 'schierholz');
  assert.strictEqual(imp.normalizeName('Prof. Müller'), 'müller');
});

test('normalizeName laesst titellose Namen unveraendert', () => {
  assert.strictEqual(imp.normalizeName('Alsholi'), 'alsholi');
  assert.strictEqual(imp.normalizeName('  Elsharawy '), 'elsharawy');
  // "Frei" darf nicht als Titel "fr" fehlinterpretiert werden (kein Space danach)
  assert.strictEqual(imp.normalizeName('Frei'), 'frei');
});

test('matchNames matcht Titel-Namen auf titellose Mitarbeiter (kein Doppelanlegen)', () => {
  const entries = [
    { name: 'Herr Alsholi', date: '2026-06-10', share: 1.0 },
    { name: 'Frau Cabrera', date: '2026-06-11', share: 1.0 },
    { name: 'Herr Dr. Azizi', date: '2026-06-02', share: 1.0 },
  ];
  const existing = ['Alsholi', 'Cabrera', 'Azizi'];
  const { matched, unknowns } = imp.matchNames(entries, existing);
  assert.strictEqual(unknowns.length, 0, 'keine Unbekannten mehr');
  assert.strictEqual(matched.length, 3);
  assert.strictEqual(matched[0].resolvedName, 'Alsholi');
  assert.strictEqual(matched[1].resolvedName, 'Cabrera');
  assert.strictEqual(matched[2].resolvedName, 'Azizi');
});

test('matchNames meldet echten Unbekannten weiterhin als unknown', () => {
  const entries = [{ name: 'Herr Weiszflog', date: '2026-06-10', share: 1.0 }];
  const existing = ['Alsholi', 'Cabrera'];
  const { matched, unknowns } = imp.matchNames(entries, existing);
  assert.strictEqual(matched.length, 0);
  assert.strictEqual(unknowns.length, 1);
  assert.strictEqual(unknowns[0].candidate, 'Herr Weiszflog');
});
