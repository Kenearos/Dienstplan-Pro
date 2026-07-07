# Changelog

## v1.0.0 — Team-Release (2026-07-07)

### Neu — Mehrbenutzer
- **Magic-Link-Login** (passwortlos): Kollegen melden sich mit freigeschalteter Arbeits-E-Mail an; Login-Link scanner-sicher (Bestätigungsseite gegen Mail-Prefetch), Sitzung mit absoluter + Inaktivitäts-Frist, Logout.
- **Getrennte Datenbasis pro Nutzer** (server-erzwungen, `user_id` nur aus der Session — Anti-IDOR). Auch der Admin sieht nur seine eigenen Daten.
- **Admin-Nutzerverwaltung**: E-Mails freischalten / auflisten / entfernen mit Last-Admin-Schutz; Notzugangs-Link (audit-geloggt).
- **Migration** der bisherigen globalen Daten auf den Admin — atomar, idempotent, Fail-Fast bei fehlender `ADMIN_EMAIL`.

### Sicherheit
- Login-Token & Session-IDs nur als SHA-256-Hash gespeichert; Rohwert nur im Link/Cookie.
- `foreign_keys=ON` + `ON DELETE CASCADE`; httpOnly/Secure/SameSite=Lax-Cookies (secure-by-default).
- Rate-Limit (E-Mail primär, IP großzügig), neutrale Auth-Antworten, atomarer Token-Claim (TOCTOU-frei).
- Minimales, PII-freies Audit-Log (Login/Logout/Admin-Aktionen/Fehlversuche) mit pseudonymer `user_id`.

### Unverändert übernommen
- Server-Persistenz (SQLite/WAL) + tägliches Online-Backup + Offline-fähiger Sync.
- Foto-Import (Vision-LLM) und 3-Varianten-Bonusberechnung (NRW Psychiatrie 2011).

### Bewusst nicht in v1
- DSGVO-Rechtstexte/Löschkonzept (internes Team, Risiko akzeptiert), Passwort-Login, gemeinsame Datenbasis.
