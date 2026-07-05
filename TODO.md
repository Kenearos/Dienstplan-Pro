# TODO / Known Gaps

Fundierte Liste offener Punkte in der Bonusberechnung — verifiziert im Code,
nicht spekulativ. Referenz-Spec: `docs/specs/2026-05-11-bonus-varianten-design.md`.

## Bugs (Implementierung weicht vom Spec ab)

- **Tie-Breaker inkonsistent mit Spec §5.** Spec sagt: bei Bonus-Gleichstand
  gewinnt immer die niedrigere `variantId`. `calculateMonthlyBonus` fügt aber
  eine zusätzliche Eligibility-Regel ein (`r.eligible && !winner.eligible`),
  die den Sieger bei Bonus-Gleichstand 0 auf eine höhere Variante umbiegen
  kann, wenn diese "eligible" ist und V1 es nicht ist. Entweder Spec oder Code
  anpassen. `calculator.js:72-80`

## Fachliche Lücken (nicht im Spec abgedeckt)

- **Feiertage nur bis 2030 hinterlegt.** `HolidayProvider` kennt Feiertage nur
  für 2025-2030 (`holidays.js:1-90`). Ab 2031 liefert `isHoliday`/
  `isDayBeforeHoliday` still `false` — Fr/Sa/So-Klassifizierung degradiert
  lautlos zu "weekday" für alle Feiertage, ohne Warnung. Rechtzeitig vor
  Jahreswechsel 2030/2031 erweitern.

- **Zwei Dienste am selben Tag werden überschrieben, nicht summiert.**
  `DataStorage.addDuty` ersetzt einen bestehenden Dienst für dasselbe Datum
  statt ihn zu addieren — zwei Halbschichten (0.5 + 0.5) am selben Tag lassen
  sich nicht als 1.0 erfassen, nur der zuletzt eingetragene Share zählt.
  `storage.js:213-227`

## Explizit Out-of-Scope laut Spec (§2) — falls sich das mal ändert

- Nur NRW-Feiertage, andere Bundesländer nicht unterstützt.
- Raten (250€/450€) und Schwellen sind hartkodiert, keine UI-Konfiguration.
- Urlaubsmodus ist ein reiner Monats-Toggle pro Mitarbeiter, kein Teilurlaub.
- Keine Server-/Multi-User-Synchronisierung (rein `localStorage`).
