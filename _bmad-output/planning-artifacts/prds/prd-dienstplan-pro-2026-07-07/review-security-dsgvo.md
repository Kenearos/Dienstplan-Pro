# PRD-Review — Linse: Sicherheit + Datenschutz (DSGVO, Klinik-Kontext)

**Reviewer-Fokus:** Personenbezogene Daten in einem öffentlich erreichbaren Dienst.
**Betrachtet:** `prd.md` (Kritik-Ziel), `addendum.md` + `project-context.md` (nur als Kontext).
**Grundregel dieses Reviews:** Das technische „Wie" (Hashing, Cookie-Handling, Rate-Limit-Implementierung) gehört ins Addendum und wird hier **nicht** als PRD-Lücke gewertet. Bewertet werden Klarheit, Vollständigkeit und Umsetzbarkeit des PRD auf der Ebene *Was/Warum* — speziell, ob die Sicherheits-/Datenschutz-NFRs für einen live erreichbaren Klinik-Dienst mit Personendaten ausreichen.

**Verdict: REVISE** — Die Auth-/Isolations-NFRs (NFR-1 bis NFR-5) sind für den Login-/Session-/Enumeration-Teil solide und testbar. Aber der PRD betrachtet Datenschutz fast ausschließlich als *Datentrennung zwischen eingeloggten Nutzern*. Der eigentliche DSGVO-Kern eines Klinik-Dienstes — **die betroffenen Dritten (Mitarbeiter-Namen), das Löschkonzept, die Weitergabe an einen externen LLM und die Pflicht-Transparenz (Datenschutzerklärung/Rechtsgrundlage)** — fehlt oder ist auf „v2/offen" geschoben. Für einen bereits **live** öffentlich erreichbaren Dienst sind das keine v2-Themen.

---

## 1. Was gut ist (kein Handlungsbedarf)

- **NFR-1/NFR-3 (Token-/Session-Hashing, 32-Byte-Zufall, 15-Min-Einmal-Token):** angemessen, testbar.
- **NFR-2 (Cookie-Flags httpOnly/Secure/SameSite=Lax):** korrekt für diesen Anwendungsfall.
- **NFR-4 (neutrale Response + Rate-Limit gegen Enumeration):** die Enumeration-Klasse ist erkannt und mit FR-1 („beide Fälle 200") + `429` sauber adressiert.
- **NFR-5 (foreign_keys + CASCADE):** verhindert verwaiste Sessions/Tokens beim Nutzer-Löschen → sofortiger Zugangsentzug (FR-10) ist konsistent.
- **FR-4 (Auth-Gate auf allen Datenschnittstellen):** schließt die zentrale Schwachstelle (offen beschreibbare API) — das Kern-Ziel des Release.

Der Login-/Session-/Enumeration-Block ist gut. Die Findings betreffen die **Datenschutz-Schicht darüber**, nicht die Auth-Mechanik.

---

## 2. Findings

### F1 — CRITICAL — Betroffene Dritte (Mitarbeiter-Namen) kommen im Datenschutz-Konzept nicht vor
**Section:** §3 Glossary (Mitarbeiter) / §4.2 / Constraints (Privacy/DSGVO)

Das Datenmodell speichert **personenbezogene Daten von Personen, die keine Nutzer sind**: Ein Nutzer legt „Mitarbeiter" (echte Kollegen, benannt) an und erfasst deren Dienste + berechnet deren Bonus (UJ-2: „sieht pro Mitarbeiter die Gewinner-Variante und den Bonus"). Name + Dienstzeiten + abgeleitete Vergütung eines Dritten = klar personenbezogene Daten nach DSGVO.

Der PRD behandelt „Datenschutz" durchgängig nur als **Isolation zwischen eingeloggten Nutzern** (FR-5, FR-7, SM-2). Die eigentlichen *Betroffenen* (die Mitarbeiter) haben:
- keine Rechtsgrundlage (Art. 6),
- keinen Weg, Auskunft/Löschung zu verlangen (Art. 15/17),
- keine Information, dass sie verarbeitet werden (Art. 13/14).

**Suggestion:** Im PRD explizit benennen, dass zwei Datensubjekt-Klassen existieren (Nutzer *und* die erfassten Mitarbeiter). Mindestens: (a) Rechtsgrundlage/Zweckbindung als Constraint aufnehmen, (b) klären, ob Mitarbeiter-Namen wirklich Klarnamen sein müssen oder pseudonymisiert werden können (Datenminimierung, Art. 5), (c) das Löschkonzept (F2) muss auch die Mitarbeiter-Ebene abdecken.

---

### F2 — CRITICAL — Löschkonzept / Recht auf Vergessen auf „v2/offen" geschoben, obwohl der Dienst live ist
**Section:** §4.3/FR-10, §6.2 Out of Scope, §8.1 Open Questions, §9 Assumptions

FR-10 + §9 legen fest: Die Datenbasis eines *entfernten* Nutzers wird v1 **belassen** (nicht gelöscht). §6.2 schiebt automatisches Löschen nach v2, §8.1 markiert es als offene Frage („DSGVO/Recht auf Vergessen"). Für einen **bereits öffentlich live** laufenden Dienst mit Personendaten ist das kein v2-Thema: Art. 17 DSGVO ist eine Betriebspflicht ab Tag 1, nicht ein Feature-Wunsch.

Konkret entsteht ein Zustand, in dem personenbezogene Daten (des entfernten Nutzers **und** der von ihm erfassten Mitarbeiter, siehe F1) unbegrenzt und ohne definierten Löschpfad im System bleiben.

**Suggestion:** Für v1 mindestens einen **manuellen, dokumentierten Löschpfad** in Scope nehmen (Admin kann Datenbasis eines entfernten Nutzers hart löschen; oder Export + Löschung). Es muss keine Automatik sein — aber „gar kein Weg" ist für einen Live-Dienst nicht vertretbar. §8.1 von „offen" zu einer Entscheidung machen, bevor Architecture startet.

---

### F3 — HIGH — Weitergabe von Klinik-Dienstplänen an externen LLM (OpenRouter) ohne DSGVO-Behandlung
**Section:** §4.5 Foto-Import (bestehend), Constraints (Privacy/DSGVO)

Der Foto-Import schickt ein Foto des **Papier-Dienstplans** (enthält Kollegen-Namen + komplette Dienstzeiten = Personendaten mehrerer Betroffener) an einen **externen Vision-LLM-Dienst (OpenRouter)**. Der PRD führt das als „bestehend, unverändert" und schiebt in §6.2 nur den *Wechsel* auf einen lokalen KI-Server nach „Stufe 3".

Datenschutzrechtlich ist das eine Auftragsverarbeitung / potenzielle Drittland-Übermittlung von Personendaten. Der PRD adressiert weder AVV, noch Zweck/Einwilligung, noch was mit dem hochgeladenen Bild beim Anbieter passiert. NFR-8 („KI nie im kritischen Pfad") behandelt nur *Verfügbarkeit*, nicht *Datenschutz*.

**Suggestion:** Im PRD (Constraints oder Open Questions) als Datenschutz-Risiko explizit benennen, auch wenn die Funktion technisch unverändert bleibt. Mindestens ein Hinweis/Consent im UI vor dem Upload und eine Entscheidung, ob Klinik-Roster überhaupt an einen externen US-LLM gehen dürfen — sonst ist die „bestehende" Funktion im nun multi-user, öffentlichen Kontext ein blinder Fleck.

---

### F4 — HIGH — Keine Datenschutzerklärung / Rechtsgrundlage / Transparenz für den öffentlichen Dienst
**Section:** §6 MVP Scope (Release-Hygiene), Constraints

`bonus.pixel-by-design.de` ist ein **öffentlich erreichbarer** Dienst, der Personendaten verarbeitet. Der PRD listet unter Release-Hygiene README/CHANGELOG/Version-Tag, aber **keine Datenschutzerklärung, kein Impressum, keine Angabe der Rechtsgrundlage** (Art. 13 DSGVO Informationspflicht; §5 TMG/DDG Impressumspflicht). Für einen Dienst, der ab v1 „team-tauglich" beworben und von Kollegen genutzt wird, ist das eine harte Lücke.

**Suggestion:** Datenschutzerklärung + Impressum als v1-Release-Artefakt in §6.1 aufnehmen (Pflicht, nicht optional). Rechtsgrundlage (vermutlich berechtigtes Interesse / Einwilligung) als Constraint festhalten.

---

### F5 — HIGH — 30-Tage-Session auf dem geteilten Klinik-Rechner ohne Idle-/Re-Auth-Timeout
**Section:** §2.3 UJ-4, FR-3 (SESSION_TTL_DAYS=30), §8.4 Open Questions

UJ-4 beschreibt explizit den **geteilten Praxis-Rechner im Stationszimmer**. Die Isolation (FR-7) greift nur beim *aktiven Nutzerwechsel* (anderer Login) oder *expliziten Logout*. Passiert weder — Nutzer A geht einfach weg — bleibt A's Session bis zu **30 Tage** aktiv und httpOnly-Cookie-gebunden am Klinik-Terminal. Jeder, der danach den Browser öffnet, ist als A eingeloggt und sieht A's Personendaten.

Der PRD hat keinen Idle-Timeout / keine absolute Re-Auth für den Shared-Device-Fall. §8.4 fragt nur allgemein nach der Sitzungsdauer, ohne das Shared-Terminal-Risiko zu benennen. SM-C1 verbietet zwar, Sicherheit für Komfort zu senken — aber der Default 30 Tage *ist* bereits die komfort-optimierte Wahl für genau das Risiko-Szenario aus UJ-4.

**Suggestion:** Für den Shared-Device-Fall ein Idle-Timeout (z. B. Session-Ablauf nach X Stunden Inaktivität) oder einen deutlich sichtbaren, obligatorischen Logout-Flow fordern. §8.4 um das konkrete Shared-Terminal-Risiko erweitern, damit die Sitzungsdauer-Entscheidung informiert getroffen wird.

---

### F6 — MEDIUM — SM-2 („0 Leak-Vorfälle") ist ohne Audit-/Nachweis-Anforderung nicht messbar
**Section:** §7 SM-2, NFRs

SM-2 („0 Vorfälle, in denen ein Nutzer fremde Daten sieht") ist die **primäre Sicherheits-Metrik**, aber es gibt keine NFR/FR für **Zugriffs-Logging, Anomalie-Erkennung oder Nachvollziehbarkeit**. Ohne serverseitiges Audit-Log kann ein Leck weder erkannt noch die Metrik validiert werden — SM-2 wäre nur „uns ist nichts aufgefallen". Für einen Klinik-Dienst ist Nachvollziehbarkeit (wer hat wann auf welche Datenbasis zugegriffen) auch DSGVO-relevant (Rechenschaftspflicht, Art. 5 Abs. 2) und Voraussetzung für die Meldepflicht bei Datenpannen (F7).

**Suggestion:** Eine NFR für minimales, datensparsames Zugriffs-/Auth-Audit-Log ergänzen (Login, Logout, Admin-Aktionen, 401/403-Häufungen), damit SM-2 überhaupt prüfbar wird. Kein PII in den Logs (siehe auch F8).

---

### F7 — MEDIUM — Kein Datenpannen-/Breach-Prozess (Art. 33/34 DSGVO)
**Section:** §8 Open Questions, Constraints

Der PRD nennt Backups (NFR-6) und Zugangsentzug, aber keinen **Incident-/Meldeprozess** für den Fall eines Datenlecks. Bei Personendaten fordert Art. 33/34 DSGVO die Meldung binnen 72 h. Für einen öffentlich erreichbaren Dienst, dessen Kern-Metrik „0 Leaks" ist, gehört zumindest ein Verweis darauf, wer im Leak-Fall was tut, in die Constraints oder Open Questions.

**Suggestion:** Als Open Question / Constraint aufnehmen: Wer ist Verantwortlicher, wie wird eine Datenpanne erkannt (siehe F6) und gemeldet.

---

### F8 — MEDIUM — Roh-Login-Token im URL-Query-String landet in Access-/Proxy-Logs
**Section:** NFR-1, Constraints („Keine personenbezogenen Daten in URLs/Query-Strings")

NFR-1 sagt zu Recht: Rohwert existiert „ausschließlich im Link bzw. Cookie". Der Login-Link ist aber `GET /auth?token=…` (Addendum) — der **Roh-Token steht im URL-Query-String**. Damit landet er in Caddy-Access-Logs, evtl. Proxy-/CDN-Logs, Browser-History und `Referer`-Headern. Der Constraint des PRD selbst verlangt „keine … Daten in URLs/Query-Strings" — ein Bearer-Credential im Query-String verletzt den Geist dieser Regel, auch wenn der Token nur 15 Min gültig ist.

Das ist kein reines Addendum-Detail, weil der PRD einen **expliziten Constraint** dazu aufstellt, den das eigene Design bricht. Der Constraint sollte präzisiert werden (gilt er auch für kurzlebige Credentials? Müssen Access-Logs Token maskieren?).

**Suggestion:** Constraint schärfen: Access-/Proxy-Logs dürfen Login-Token nicht im Klartext protokollieren (Masking), oder der Constraint wird explizit auf „Roh-Token im Link ist eine bewusste, akzeptierte Ausnahme" reduziert. Entscheidung im PRD festhalten, nicht offen lassen.

---

### F9 — LOW — Admin ist alleiniger Single Point of Full Control, ohne besonderen Schutz
**Section:** §3 Glossary (Admin), FR-8..FR-11, §8.5

Der Admin (per `ADMIN_EMAIL`) steuert die gesamte Allowlist und hat eine eigene Datenbasis. Da es keine Passwörter/2FA gibt (bewusst), ist der Zugang zum Admin-Postfach der einzige Schutz der kompletten Zugangskontrolle. Kompromittiertes Admin-Postfach = vollständige Übernahme (neue Nutzer freischalten, Zugangsentzug). §8.5 fragt nur nach *mehreren* Admins, nicht nach dem *Schutz* des einen.

**Suggestion:** Als Risiko/Constraint benennen. Nichts Schweres nötig, aber die Abhängigkeit „Sicherheit des gesamten Systems = Sicherheit eines E-Mail-Postfachs" sollte bewusst akzeptiert und dokumentiert sein.

---

### F10 — LOW — Keine Retention-/Aufbewahrungsgrenze (Storage Limitation, Art. 5)
**Section:** NFR-6, §4.2, Addendum `history`

Dienste- und `history`-Daten wachsen unbegrenzt; es gibt keine Aufbewahrungs-/Purge-Regel. DSGVO Art. 5 (Speicherbegrenzung) verlangt, Personendaten nicht länger als nötig zu halten. Für v1 vermutlich unkritisch (kleines Team), aber sollte als bewusste Entscheidung stehen, nicht implizit „für immer".

**Suggestion:** Als Open Question aufnehmen: Wie lange werden Dienst-/History-Daten aufbewahrt.

---

## 3. Zusammenfassung

Die Auth-Mechanik (Magic-Link, Session-Hashing, Enumeration-Neutralität, Rate-Limit, CASCADE) ist für dieses Projekt gut und testbar spezifiziert — der Login-Teil braucht keine Nacharbeit. Die Lücken liegen eine Ebene höher, im **Datenschutz-Konzept für einen Live-Klinik-Dienst**:

- **Blocker für „live mit Personendaten":** Löschkonzept (F2), betroffene Dritte (F1), fehlende Datenschutzerklärung/Rechtsgrundlage (F4), externer LLM (F3).
- **Betriebsrisiken:** Shared-Terminal-Session (F5), fehlendes Audit → SM-2 nicht messbar (F6), kein Breach-Prozess (F7), Token im Query-String vs. eigener Constraint (F8).

Empfehlung: F1–F4 vor dem Start der Architecture-Phase entscheiden (mind. manueller Löschpfad + Datenschutzerklärung in v1-Scope), F5–F8 als NFR/Open-Question nachziehen.
