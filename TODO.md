# TODO / Known Gaps

Fundierte Liste offener Punkte in der Bonusberechnung — verifiziert im Code,
nicht spekulativ. Referenz-Spec: `docs/specs/2026-05-11-bonus-varianten-design.md`.

## Explizit Out-of-Scope laut Spec (§2) — falls sich das mal ändert

- Nur NRW-Feiertage, andere Bundesländer nicht unterstützt.
- Raten (250€/450€) und Schwellen sind hartkodiert, keine UI-Konfiguration.
- Urlaubsmodus ist ein reiner Monats-Toggle pro Mitarbeiter, kein Teilurlaub.
- Keine Server-/Multi-User-Synchronisierung (rein `localStorage`).
