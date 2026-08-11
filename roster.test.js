const { test } = require('node:test');
const assert = require('node:assert');
const Roster = require('./roster');

// Die Berechnung speist sich aus dem Team-Plan: nur freigegebene Dienste
// zaehlen, gruppiert nach Server-Namen, Datum als Mittags-Date (Zeitzonen).
test('zuBerechnung: nur approved, gruppiert nach Name, Datum als Mittags-Date', () => {
  const rows = [
    { userId: 1, name: 'Alsholi', date: '2026-08-01', share: 1, status: 'approved' },
    { userId: 1, name: 'Alsholi', date: '2026-08-15', share: 0.5, status: 'approved' },
    { userId: 2, name: 'Cabrera', date: '2026-08-01', share: 0.5, status: 'pending' },
    { userId: 3, name: 'Gaxhja', date: '2026-08-02', share: 1, status: 'rejected' },
  ];
  const erg = Roster.zuBerechnung(rows);
  assert.deepStrictEqual(Object.keys(erg), ['Alsholi'], 'pending/rejected duerfen nicht zaehlen');
  assert.strictEqual(erg.Alsholi.length, 2);
  assert.strictEqual(erg.Alsholi[1].share, 0.5);
  assert.ok(erg.Alsholi[0].date instanceof Date, 'Datum muss ein Date sein');
  assert.strictEqual(erg.Alsholi[0].date.getHours(), 12, 'Mittagszeit gegen Zeitzonen-Kanten');
  assert.strictEqual(erg.Alsholi[0].date.getDate(), 1);
});

test('zuBerechnung: leere Liste -> leeres Objekt', () => {
  assert.deepStrictEqual(Roster.zuBerechnung([]), {});
});
