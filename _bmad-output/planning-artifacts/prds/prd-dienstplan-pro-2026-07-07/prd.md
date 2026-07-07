---
title: Dienstplan-Pro
status: final
created: 2026-07-07
updated: 2026-07-07
---

# PRD: Dienstplan-Pro — Team-Release v1.0

## 0. Document Purpose

Dieser PRD ist für den Product Owner (Kenearos, zugleich Admin und primärer Nutzer) und die downstream BMAD-Workflows (Architecture, Epics/Stories, Dev). Er definiert das **Was** und **Warum** des v1.0-Release; das technische **Wie** (Hashing, Schema-Migration, Cookie-Handling, Rate-Limit) liegt in `addendum.md`. Bestehende Fähigkeiten (Bonus-Berechnung, Foto-Import, Sync) sind bereits gebaut und live und werden als Kontext erfasst; der release-treibende Kern ist **Mehrbenutzer-Zugang**. Vokabular folgt dem Glossar (§3) verbatim; inferierte Annahmen sind inline `[ASSUMPTION]` markiert und in §9 indexiert. Dieser PRD wurde adversarial validiert (BMAD-Rubrik + adversarial + Edge-Case + Sicherheit/DSGVO); die Reviews liegen als `review-*.md` im selben Ordner.

## 1. Vision

Dienstplan-Pro rechnet Assistenzärzten den Bonus für Wochenend- und Feiertagsdienste nach der NRW-Regelung aus — inklusive der drei Abrechnungs-Varianten und der Feiertags-Verschiebung, die man beim Handrechnen leicht übersieht. Heute ist es ein Single-User-Werkzeug: eine globale Datenbasis, öffentlich ohne Login.

Das v1.0-Release macht Dienstplan-Pro **team-tauglich**: jeder Kollege meldet sich passwortlos per Magic-Link an und hat seine **eigene, getrennte Datenbasis**. Der **Admin** behält seinen bestehenden Team-Blick (mehrere Mitarbeiter); **reguläre Nutzer erfassen nur ihre eigene Person** und sehen nur ihren Bonus. Ein Admin schaltet frei, wer teilnehmen darf. Damit wird aus einem privaten Rechner-Helfer ein kleines, sicheres Team-Tool — ohne Passwort-Management und ohne die bewährte Berechnungslogik zu verändern. Zugleich wird die bisher öffentlich beschreibbare Datenschnittstelle geschlossen.

## 2. Target User

### 2.1 Jobs To Be Done

- **Als regulärer Nutzer (Assistenzarzt)** will ich **meine eigenen** geleisteten Wochenend-/Feiertagsdienste erfassen und meinen Bonus korrekt berechnet bekommen — ohne die Varianten/Feiertagsregeln selbst durchrechnen zu müssen und ohne auf den Admin angewiesen zu sein.
- **Als regulärer Nutzer** will ich, dass **nur ich** meine Daten sehe/bearbeite.
- **Als Kollege** will ich mich **ohne Passwort** anmelden und trotzdem sicher wieder reinkommen.
- **Als Admin (Kenearos)** will ich weiterhin **das ganze Team** erfassen/abrechnen können, steuern **wer** teilnimmt, und meine bestehenden Daten behalten.
- **Als Betreiber** will ich, dass die App im öffentlichen Netz nicht mehr offen beschreibbar ist.

### 2.2 Non-Users (v1)

- Externe/Fremde ohne Freischaltung.
- Lohnbuchhaltung/Vorgesetzte als eigene Rolle — Ergebnisse werden weiter per Export/Bericht geteilt.
- Teams, die **gemeinsam an derselben** Datenbasis arbeiten wollen — v1 ist pro Nutzer isoliert (§5).

### 2.3 Key User Journeys

- **UJ-1. Dr. Alsholi wird freigeschaltet und kommt zum ersten Mal rein.**
  - **Persona + Kontext:** regulärer Nutzer, Arbeits-E-Mail vom Admin freigeschaltet, will ohne Passwort loslegen.
  - **Entry state:** nicht eingeloggt, öffnet `bonus.pixel-by-design.de`.
  - **Path:** Login-Overlay → freigeschaltete E-Mail eingeben → „Link anfordern" → „Prüfe dein Postfach" → Mail öffnen → Magic-Link klicken → **Bestätigungsseite** („Jetzt anmelden"-Button) → bestätigen.
  - **Climax:** Sitzung gesetzt; App öffnet sich mit **leerer, eigener** Datenbasis; Sync-Badge „Synchronisiert".
  - **Resolution:** angemeldet für ~30 Tage (bzw. bis 8 h Inaktivität).
  - **Edge case:** Link abgelaufen/verbraucht → „Link ungültig — neuen anfordern".

- **UJ-2. Kenearos (Admin) rechnet das ganze Team ab.** *(folgt auf UJ-1; Admin-Nutzung.)*
  - **Persona + Kontext:** Admin, pflegt wie bisher mehrere Mitarbeiter in seiner eigenen (Admin-)Datenbasis.
  - **Path:** Monat wählen → Dienste je Mitarbeiter erfassen (manuell oder **Foto-Import**) → Tab „Berechnung".
  - **Climax:** pro Mitarbeiter Gewinner-Variante + Bonus; Summen stimmen mit Handrechnung.
  - **Resolution:** Daten in der Admin-Datenbasis gesichert.

- **UJ-3. Dr. Alsholi (regulär) trägt nur sich selbst ein.**
  - **Persona + Kontext:** regulärer Nutzer, eingeloggt, will seinen eigenen Monat abrechnen.
  - **Path:** Monat wählen → seine eigenen Dienste eintragen → „Berechnung".
  - **Climax:** sieht seinen eigenen Bonus; keine fremden Daten sichtbar.
  - **Resolution:** nur für ihn gesichert.

- **UJ-4. Kenearos schaltet einen Kollegen frei.**
  - **Path:** „Einstellungen" → „Nutzer verwalten" (nur Admin) → E-Mail freischalten → Kollegen informieren (Notzugang: Admin kann bei Bedarf einen Login-Link generieren und out-of-band übergeben, falls die Mail nicht ankommt).
  - **Climax:** E-Mail in der Liste; nur diese Person kann sich einloggen.
  - **Resolution:** Entfernen später möglich → Sitzungen sofort ungültig.

- **UJ-5. Geteilter Stationsrechner — Nutzerwechsel.**
  - **Path:** Kollege A loggt aus (oder Session läuft nach 8 h Inaktivität ab); Kollege B loggt sich ein.
  - **Climax:** A's lokale Daten **und** gerätelokaler OpenRouter-Key werden geleert; B sieht frisch nur seine eigenen Daten.
  - **Resolution:** keine Vermischung, kein geteilter API-Key.

## 3. Glossary

- **Nutzer** — Person mit freigeschalteter E-Mail und eigener, isolierter **Datenbasis**. Eine E-Mail = ein Nutzer.
- **Regulärer Nutzer** — Nutzer ohne Admin-Recht; erfasst konventionsgemäß nur die **eigene Person** (typisch ein Mitarbeiter = er selbst).
- **Admin** — Nutzer mit dem Recht, die **Allowlist** zu verwalten; pflegt in seiner eigenen Datenbasis das ganze Team (mehrere Mitarbeiter). Admin-Recht betrifft **ausschließlich** die Allowlist — kein Zugriff auf fremde Datenbasen. Mindestens ein Admin existiert immer.
- **Allowlist** — Menge freigeschalteter E-Mails = Zeilen der `users`-Tabelle. Nur diese können einen Magic-Link erhalten.
- **Magic-Link** — einmaliger, kurzlebiger Login-Link (Rohtoken im Link, nur Hash gespeichert). Einlösung per menschlicher Bestätigung erzeugt eine **Sitzung**.
- **Sitzung (Session)** — serverseitig gespeicherter, ablaufender Anmeldezustand; im Browser httpOnly-Cookie (Rohwert), in der DB nur Hash. Läuft nach absoluter Frist **oder** Inaktivitäts-Frist ab.
- **Datenbasis** — die **Dienste**, **Mitarbeiter** und **Urlaubs-Flags** genau eines Nutzers (per `user_id` getrennt).
- **Mitarbeiter** — benannter Eintrag innerhalb der Datenbasis eines Nutzers, für den Dienste erfasst und Boni berechnet werden. Bei regulären Nutzern konventionsgemäß nur sie selbst; beim Admin das Team.
- **Dienst** — Datum mit **Anteil** (1,0 oder 0,5) für einen Mitarbeiter in einem Monat.
- **Urlaubs-Flag** — pro Mitarbeiter/Monat gesetzter Schalter, der die Bonus-Schwellen und Abzüge halbiert (der „Urlaubsmodus" der Berechnung).
- **Slot** — Klassifizierung eines Diensttages: `fr`, `sa`, `so` (Wochenend-Slots, je 450 €) oder `weekday` (250 €), inkl. Feiertags-Verschiebung.
- **Variante** — eine der drei Abrechnungsregeln (V1/V2/V3); pro Mitarbeiter/Monat gewinnt die mit dem höchsten Bonus.

## 4. Features

### 4.1 Authentifizierung per Magic-Link

**Description:** Passwortloser Login. Ein Nutzer gibt seine E-Mail ein; ist sie in der Allowlist, erhält er einen Magic-Link. **Einlösung erfordert eine menschliche Bestätigung** (Bestätigungsseite mit POST), damit automatische Klinik-Mailscanner (Safe-Links/Proofpoint) den Einmal-Token nicht per Prefetch verbrauchen. Keine Passwörter, kein Passwort-Reset. Realizes UJ-1.

**Functional Requirements:**

#### FR-1: Login-Link anfordern (neutral, rate-limited)
Ein Besucher kann per E-Mail-Feld einen Magic-Link anfordern. Realizes UJ-1.
**Consequences (testable):**
- E-Mail in der Allowlist → Login-Token erzeugt, Magic-Link an diese E-Mail gesendet.
- E-Mail NICHT in der Allowlist → nichts gesendet.
- In beiden Fällen dieselbe neutrale `200`-Antwort.
- Eine neue Anfrage invalidiert vorherige noch nicht verbrauchte Tokens desselben Nutzers.
- Enforcement primär **pro E-Mail** (Default 5 / 15 Min → `429`); pro-IP-Limit großzügig (klinikinterne NAT teilt eine IP — mehrere Kollegen dürfen sich nicht gegenseitig aussperren).

#### FR-2: Magic-Link scanner-sicher einlösen → Sitzung
Ein Nutzer kann per Magic-Link eine Sitzung erhalten, ohne dass Mailscanner den Link verbrauchen. Realizes UJ-1.
**Consequences (testable):**
- `GET /auth?token=` liefert eine **Bestätigungsseite**; erst ein expliziter menschlicher POST verbraucht den Token und erzeugt die Sitzung (setzt httpOnly/Secure/SameSite=Lax-Cookie, leitet zur App). Ein reiner GET-Prefetch verbraucht den Token nicht.
- Verbrauchter/abgelaufener Token (>30 Min) → Fehlerseite „Link ungültig/abgelaufen — neuen anfordern".

#### FR-3: Sitzungsdauer, Idle-Timeout & Logout
Ein Nutzer bleibt angemeldet, bis eine Frist abläuft oder er sich abmeldet. Realizes UJ-5.
**Consequences (testable):**
- Absolute Frist `SESSION_TTL_DAYS` (Default 30) **und** Inaktivitäts-Frist `SESSION_IDLE_HOURS` (Default 8) — die zuerst greifende beendet die Sitzung; danach `401` + Login.
- Ein prominenter Logout-Button beendet die Sitzung serverseitig sofort und leert das Cookie.

#### FR-4: Zugangs-Gate auf allen Daten (offline-bewusst)
Alle Datenschnittstellen sind nur mit gültiger Sitzung erreichbar; Offline-Betrieb bleibt möglich.
**Consequences (testable):**
- `GET`/`PUT /api/state` ohne gültige Sitzung → `401`.
- Beim App-Start wird **`401` (ungültige Sitzung → Login-Overlay)** klar von **Netzwerkfehler/Serverausfall (offline → App läuft mit letzter bekannter Sitzung + lokalen Daten weiter)** unterschieden. Offline sperrt die Kernapp nicht aus (Konsistenz mit NFR-8).

#### FR-5: Notzugang (Admin-generierter Link)
Fällt die Mail-Zustellung aus, kann ein Admin einem freigeschalteten Nutzer einen gültigen Login-Link out-of-band bereitstellen.
**Consequences (testable):**
- Ein Admin kann für eine freigeschaltete E-Mail einen einmaligen Login-Link erzeugen/abrufen (übergibt ihn selbst, z.B. per Arbeits-Chat).
- Der Link unterliegt denselben Regeln wie FR-2 (Bestätigung, Ablauf, Einmaligkeit).
- Jede Not-Link-Erzeugung wird als Admin-Aktion im Audit-Log verzeichnet (Missbrauchs-Nachvollziehbarkeit, siehe §6.1).

### 4.2 Nutzer-Datentrennung

**Description:** Jede Datenbasis ist per `user_id` getrennt; jeder Nutzer — **auch der Admin** — liest/schreibt ausschließlich seine eigene Datenbasis. Realizes UJ-3, UJ-5.

#### FR-6: Strikte Datentrennung pro Nutzer
**Consequences (testable):**
- `GET/PUT /api/state` betrifft ausschließlich die Dokumente des eingeloggten Nutzers — auch für Admins (Admin ist **kein** Daten-Superuser).
- Die `user_id` wird **ausschließlich aus dem Session-Kontext** des Servers abgeleitet, **nie** aus dem Client-Payload — Test gegen horizontale Rechteausweitung (manipulierte `user_id` im Request hat keinen Effekt).
- Zwei verschiedene Nutzer sehen disjunkte Datensätze (stehender 2-Nutzer-Isolationstest, siehe SM-2).

#### FR-7: Übernahme der Alt-Daten (sicher & verifiziert)
Die bestehende globale Datenbasis wird beim Umstieg dem Admin zugeordnet — ohne Verlustrisiko.
**Consequences (testable):**
- Der Server bricht bei fehlender/leerer/ungültiger `ADMIN_EMAIL` **laut und ohne Migration** ab (Fail-Fast) — kein verwaister Zustand, keine Totalaussperrung.
- Migration läuft **atomar in einer Transaktion** (documents-Rebuild + history) — ein Abbruch hinterlässt keinen halb-migrierten Zustand; die Ursprungsdaten bleiben bei Fehler unverändert.
- Nach erfolgreicher Migration gehören alle bisherigen Daten dem Admin; kein anderer Nutzer sieht sie.
- Zweiter Start = No-Op (idempotent). `ADMIN_EMAIL` ist nach dem Erst-Boot unveränderlich (Änderung erzeugt keinen zweiten „Alt-Daten"-Empfänger). `[ASSUMPTION: ADMIN_EMAIL wird vor dem ersten Produktiv-Boot korrekt gesetzt und danach nicht geändert.]`

#### FR-8: Nutzer-Isolation im Browser
Beim Nutzerwechsel/Erstlogin im selben Browser werden keine Daten vermischt. Realizes UJ-5.
**Consequences (testable):**
- Bei Login wird geleert, wenn **kein** Nutzer gemerkt ist (Erstfall — verhindert, dass Alt-Daten aus der Login-losen Ära beim ersten regulären Nutzer aufblitzen) **oder** ein anderer Nutzer gemerkt ist.
- Geleert werden die Daten-Schlüssel **und** der gerätelokale OpenRouter-Key/Modell (kein geteilter Kosten-/Secret-Zugang auf geteilten Geräten).
- Ungeflushte `pending`-Änderungen: Bei Re-Login **desselben** Nutzers bleiben sie erhalten und werden geflusht (kein Überschreiben durch den Boot-Pull). Loggt sich ein **anderer** Nutzer ein, während ungeflushte Änderungen offen sind, wird gewarnt/geblockt statt still verworfen.

### 4.3 Admin-Nutzerverwaltung

**Description:** Der Admin pflegt die Allowlist in einem nur für ihn sichtbaren Bereich. Realizes UJ-4.

#### FR-9: E-Mail freischalten
**Consequences (testable):** Nach Freischalten kann diese E-Mail einen Magic-Link erhalten (FR-1); E-Mails werden mit **identischer Normalisierung** (lowercase/trim) sowohl beim Speichern als auch beim Allowlist-Abgleich behandelt (case-insensitive, keine Lücke); Duplikate erzeugen keinen zweiten Nutzer.

#### FR-10: Nutzerliste einsehen
**Consequences (testable):** Liste zeigt alle Nutzer inkl. Admin-Kennzeichnung.

#### FR-11: Nutzer entfernen (mit Last-Admin-Schutz)
**Consequences (testable):**
- Nach Entfernen kein Magic-Link mehr; bestehende Sitzungen/Tokens des Nutzers werden mit entfernt (CASCADE) → serverseitiger Zugang sofort entzogen (gerätelokaler Cache wird beim nächsten Nutzerwechsel geleert).
- Ein Admin kann sich **nicht selbst** und **nicht den letzten Admin** entfernen (definierte Fehlermeldung) — die Invariante „mindestens ein Admin existiert immer" gilt.
- `[ASSUMPTION: Die Datenbasis eines entfernten Nutzers wird v1 belassen; siehe §8/DSGVO.]`

#### FR-12: Admin-Gating
**Consequences (testable):** `/api/admin/*` ohne Admin-Recht → `403`, ohne Sitzung → `401`; Admin-Bereich im UI nur bei Admin-Rechten sichtbar.

### 4.4 Bonus-Berechnung *(bestehend, unverändert)*

**Description:** Klassifiziert jeden Dienst in einen Slot (inkl. Feiertags-Verschiebung), berechnet den Bonus über V1/V2/V3, wählt den höchsten. Urlaubs-Flag halbiert Schwellen/Abzüge. Verifiziert gegen Handrechnung (Juni 2026).

#### FR-13: Varianten-Berechnung
**Consequences (testable):** Wochenend-Slots 450 €, Werktage 250 €, Anteile 0,5/1,0 anteilig; Gleichstand → „Schwelle erreicht" vor „nicht", dann niedrigere Varianten-Nummer. (Bestehende Node-Tests decken das ab.)

### 4.5 Dienste-Erfassung & Foto-Import *(bestehend)*

**Description:** Manuelles Eintragen (Datum + Anteil) sowie **Foto-Import** per Vision-LLM (OpenRouter). Namens-Matching entfernt Anrede/Titel; Zielmonat aus dem Live-Dropdown. **DSGVO-Hinweis:** Der Foto-Import überträgt Bilder (Namen + Dienstzeiten) an einen externen LLM — für v1 als bewusst akzeptiertes Risiko geführt (§6.2/§8).

#### FR-14: Foto-Import auf den gewählten Monat
**Consequences (testable):** Import zielt auf den gewählten Monat (nicht auf ein veraltetes Feld); Namen mit Anrede/Titel matchen titellose Mitarbeiter (kein Doppelanlegen).

### 4.6 Synchronisation & Offline *(bestehend, an Auth angepasst)*

**Description:** LocalStorage = synchrone Working-Copy; `DataSync` zieht beim Start den Server-Stand, schiebt Änderungen debounced zurück; `pending`-Flag schützt Offline-Änderungen. Neu: alle Sync-Anfragen tragen die Sitzung.

#### FR-15: Auth-bewusster Sync
**Consequences (testable):**
- `boot()` und `_flush()` senden Credentials; bei `401` (ungültige Sitzung) → Login-Overlay + Sync-Stopp; bei Netzwerkfehler (offline) → App läuft lokal weiter (FR-4).
- Offline getätigte Änderungen gehen nicht verloren (bestehende `pending`-Logik + Race-Fix + FR-8-Regeln zum Nutzerwechsel).

## 5. Non-Goals (Explicit)

- **Keine Passwörter, kein SSO, keine 2FA** — Login nur per Magic-Link.
- **Keine gemeinsame/kollaborative Datenbasis**; jeder Nutzer isoliert (last-write-wins pro Nutzer).
- **Kein Daten-Superuser** — auch der Admin sieht nur seine eigene Datenbasis.
- **Keine Mandanten-/Firmen-Ebene** über den Nutzern.
- **Keine eigene Rolle für Lohnbuchhaltung/Vorgesetzte** in v1.
- **Kein Wechsel der Berechnungslogik**.
- **E-Mail-Änderung eines Nutzers = neuer Nutzer** (Alt-Daten bleiben unter der alten E-Mail; kein automatischer Umzug in v1).
- **Kein Wechsel des Foto-Import-LLM** (OpenRouter bleibt; lokaler KI-Server = späteres Vorhaben).

## 6. MVP Scope

### 6.1 In Scope
- Magic-Link-Login: Anfordern (neutral, rate-limited), scanner-sichere Einlösung (Bestätigung/POST), Sitzung mit absoluter + Idle-Frist, Logout, Admin-Notzugang.
- Datentrennung pro Nutzer (Admin inbegriffen) inkl. sicherer, atomarer, verifizierter Migration + Fail-Fast auf `ADMIN_EMAIL`.
- Admin-Nutzerverwaltung (freischalten/auflisten/entfernen) mit Last-Admin-Schutz.
- Auth-Gate auf `/api/state`; auth-bewusster, offline-fähiger Frontend-Sync; Nutzerwechsel-/Erstlogin-Isolation (inkl. OpenRouter-Key + pending-Schutz).
- E-Mail-Versand per SMTP (Konsolen-Fallback im Dev/Test).
- Sicherheits-Härtungen: Token- & Session-Hashing, `foreign_keys`+CASCADE, Rate-Limit (E-Mail primär, IP großzügig), Cookie-Flags, Token in Access-Logs maskiert.
- **Minimales Audit-Log** (Login/Logout/Admin-Aktionen inkl. Not-Link/401-403-Häufungen) — **ohne PII**, aber mit **stabiler pseudonymer Nutzer-Kennung** (`user_id`, nicht E-Mail), damit SM-1 „≥3 verschiedene Nutzer" zählbar ist.
- Release-Hygiene: `.env.example`, `README`-Update, `CHANGELOG`, Version-Tag `v1.0.0`, veraltete `CLAUDE.md`-Regeln aktualisieren, alte Test-Artefakte prüfen/aufräumen.
- **Bericht-Text-Splice-Bug** — eigenes Arbeitspaket mit Akzeptanzkriterium: im Textbericht dürfen Bemerkungs-Zeilen zweier Mitarbeiter nicht mehr ineinanderrutschen (jede Bemerkung dem korrekten Mitarbeiter zugeordnet).

### 6.2 Out of Scope for MVP *(bewusst zurückgestellt)*
- **DSGVO/Rechtstexte** (Datenschutzerklärung, Impressum, Auskunfts-/Löschpfad für Nutzer- und Mitarbeiterdaten, Aufbewahrungsgrenzen, AVV/Consent für den externen Foto-Import-LLM, Breach-Prozess) — **bewusst nicht in v1**; internes Team, Risiko vom Owner (Kenearos) akzeptiert. `[NOTE FOR PM: bewusst akzeptiertes Rechts-/Datenschutzrisiko; bei Ausweitung über das interne Team hinaus zwingend nachzuziehen. Owner: Kenearos.]`
- Passwort-Login / Self-Service-Registrierung.
- „Nutzer zum Admin befördern" über die UI.
- Automatisches Löschen der Datenbasis entfernter Nutzer.
- Wechsel auf den lokalen KI-Server für den Foto-Import (Stufe 3).

## 7. Success Metrics

*Beobachtbar über das minimale Audit-Log (§6.1) bzw. den stehenden Isolationstest — keine PII.*

**Primary**
- **SM-1:** Aktive Team-Nutzung — ≥3 verschiedene Nutzer mit erfolgreichem Login im ersten Monat, **gezählt über die Login-Events des Audit-Logs** bzw. die `users`/`sessions`-Tabellen. Validates FR-1..FR-6.
- **SM-2:** Datentrennung ohne Leck — der **automatisierte 2-Nutzer-Isolationstest** (Node) läuft grün in CI und bei jedem Deploy; keine gemeldeten Vorfälle. Validates FR-6, FR-8.

**Secondary**
- **SM-3:** Reibungsloser Zugang — qualitativ: Kollegen bestätigen, dass Anmelden „einfach funktioniert" (Selbstauskunft/Stichprobe), gestützt auf 401/Fehler-Häufungen im Audit-Log. Validates FR-1, FR-2.
- **SM-4:** Alt-Daten unverändert übernommen — Admin bestätigt nach Migration die Vollständigkeit gegen eine DB-Kopie. Validates FR-7.

**Counter-metrics (do not optimize)**
- **SM-C1:** Login-Komfort nicht auf Kosten der Sicherheit — Sitzungsfristen/Neutralität/Rate-Limit/Scanner-Schutz dürfen nicht gelockert werden, um SM-3 zu verbessern. Counterbalances SM-3.

## 8. Open Questions

1. **DSGVO-Nachzug-Trigger:** Ab wann (mehr als internes Team / externe Nutzer) werden Rechtstexte + Löschpfad Pflicht? Owner: Kenearos. *(v1 bewusst ohne — §6.2.)*
2. **Deployment-Ziel & Orchestrierung** — Tool klären („potctl"? Portainer?); bestimmt den Deploy-Schritt.
3. **SMTP-Postfach** — Zugangsdaten + SPF/DKIM (sonst Spam); harte Voraussetzung vor Live-Schaltung des Magic-Link.
4. Mehrere Admins später nötig? (Beförderung ist v1-Non-Goal.)

## 9. Assumptions Index

- §4.2/FR-7 — `ADMIN_EMAIL` wird vor Erst-Boot korrekt gesetzt und danach nicht geändert.
- §4.3/FR-11 — Datenbasis eines entfernten Nutzers wird v1 belassen.
- §2/§3 — Kollegen nutzen eigene, personengebundene Arbeits-E-Mails (kein geteiltes Postfach); eine E-Mail = ein Nutzer. `[ASSUMPTION inline in §3 Glossar.]`
- §4.6/FR-15 — Ein Nutzer arbeitet meist von einem Gerät zugleich; bei parallelem Multi-Device-Edit desselben Nutzers ist Datenverlust durch last-write-wins ein **bewusst akzeptiertes** Risiko (kein Fremd-Leck). `[ASSUMPTION inline in §5.]`
- §8/#3 — Mail-Zustellung ist mit SPF/DKIM zuverlässig genug (sonst FR-5 Notzugang).
