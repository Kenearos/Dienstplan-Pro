const { test } = require('node:test');
const assert = require('node:assert');
const { classify, variant1, variant2, variant3 } = require('./variants');

const noHolidays = { isHoliday: () => false, isDayBeforeHoliday: () => false };
const d = (s) => new Date(s + 'T12:00:00');

test('classify: echte Wochentage', () => {
  assert.strictEqual(classify(d('2026-06-12'), noHolidays), 'fr'); // Freitag
  assert.strictEqual(classify(d('2026-06-13'), noHolidays), 'sa'); // Samstag
  assert.strictEqual(classify(d('2026-06-14'), noHolidays), 'so'); // Sonntag
  assert.strictEqual(classify(d('2026-06-10'), noHolidays), 'weekday'); // Mittwoch
});

test('classify: Feiertags-Verschiebung (Mo–Do)', () => {
  const hp = { isHoliday: (x) => x.getDate() === 4, isDayBeforeHoliday: (x) => x.getDate() === 3 };
  assert.strictEqual(classify(d('2026-06-04'), hp), 'so'); // Do-Feiertag → so
  assert.strictEqual(classify(d('2026-06-03'), hp), 'fr'); // Tag davor → fr
  const sandwich = { isHoliday: (x) => x.getDate() === 4, isDayBeforeHoliday: (x) => x.getDate() === 4 };
  assert.strictEqual(classify(d('2026-06-04'), sandwich), 'sa'); // Sandwich → sa
});

test('Juni-Fall Jizdan: V3 gewinnt mit 500 €', () => {
  const c = { fr: 2, sa: 0, so: 0, weekday: 2 };
  assert.strictEqual(variant3(c, false).bonus, 500); // Pool 2 abgezogen, 2 Werktage × 250
  assert.strictEqual(variant1(c, false).eligible, false); // Werktage 2 < 3
  assert.strictEqual(variant2(c, false).eligible, false); // kein sa
});

test('Juni-Fall Giurgiu: V1=450, V2=700, V3=750 (Gewinner V3)', () => {
  const c = { fr: 0, sa: 1, so: 1, weekday: 3 };
  assert.strictEqual(variant1(c, false).bonus, 450);
  assert.strictEqual(variant2(c, false).bonus, 700);
  assert.strictEqual(variant3(c, false).bonus, 750);
});

test('Juni-Fall Günes: keine Variante greift → 0 €', () => {
  const c = { fr: 0, sa: 1, so: 0, weekday: 0 };
  assert.strictEqual(variant1(c, false).eligible, false);
  assert.strictEqual(variant2(c, false).eligible, false);
  assert.strictEqual(variant3(c, false).eligible, false);
});

test('Urlaubsmodus halbiert Schwellen: Günes mit Urlaub → V2 greift', () => {
  const c = { fr: 0, sa: 0.5, so: 0, weekday: 1 };
  // Urlaub: V2 Schwelle sa≥0.5 UND weekday≥1 → greift; Abzug 0.5 sa + 1 weekday → 0 bezahlt
  assert.strictEqual(variant2(c, true).eligible, true);
});
