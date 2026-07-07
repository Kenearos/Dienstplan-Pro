# PRD Quality Review — Dienstplan-Pro Team-Release v1.0

## Overall verdict

Ein starker, kohärenter PRD mit klarer These (aus einem öffentlichen Single-User-Tool ein isoliertes Team-Tool machen, ohne Einfachheit oder die verifizierte Rechenlogik zu verlieren) und ungewöhnlich testbaren FRs — die Consequences-Blöcke sind das Rückgrat und tragen. Was ihn von „build-ready" trennt, sind vier gezielte Lücken: die Success Metrics haben kein benanntes Messinstrument (SM-2 „0 Leck-Vorfälle" ist ohne Detektionsmechanismus unfalsifizierbar bis zur Katastrophe), die Migration (FR-6) beschreibt kein Verhalten im Fehlerfall obwohl sie ein destruktiver Table-Rebuild auf Produktivdaten ist, die Daten-Zugriffsgrenze des Admins ist nur ableitbar statt ausgesprochen, und der Assumptions-Index hält die in §0 versprochene Inline-Disziplin nicht ein. Keine davon ist ein Blocker; alle sind eng umrissen und schnell zu schließen. Verdict: **revise**.

## Decision-readiness — strong

Der PRD trifft Entscheidungen als Entscheidungen: Non-Goals (§5) sind hart formuliert („Keine Passwörter, kein SSO, keine 2FA"), das Addendum trägt echte Trade-offs (Passwortlos → E-Mail wird kritischer Pfad; Server-Sessions → DB-Lookup pro Request). Die Open Questions (§8) sind wirklich offen und nicht rhetorisch — Sitzungsdauer, Mehr-Admin-Bedarf, Deployment-Tool. Der `[NOTE FOR PM]` am DSGVO-Löschkonzept (§6.2/§8.1) sitzt an einer echten Spannung, nicht an einem sicheren Checkpoint.

Eine reale Kehrseite: Open Question #1 (Löschkonzept für entfernte Nutzer) ist rechtlich lasttragend — die App speichert ab Tag 1 Personenbezug (Namen + Dienste) — und wird dennoch nach v2 verschoben. Das ist ehrlich geflaggt, aber ein Green-Light-to-Build-PRD sollte hier einen Entscheidungs-Owner und ein Datum tragen, nicht nur „früh klären".

### Findings
- **low** DSGVO-Löschkonzept offen bei Build-Start (§8.1 / §6.2) — Personenbezogene Daten werden ab v1 gespeichert, das „Recht auf Vergessen" ist aber vollständig offen. Gut geflaggt, aber ohne Owner/Deadline. *Fix:* dem `[NOTE FOR PM]` einen Verantwortlichen und ein Zieldatum geben, damit die Entscheidung nicht bis v2 treibt.

## Substance over theater — strong

Kein Furniture. Die vier UJs haben benannte Protagonisten (Dr. Alsholi, Kenearos) und treiben je eine Design-Entscheidung — UJ-4 (geteilter Stationsrechner, Nutzerwechsel) rechtfertigt direkt FR-7. Die Vision (§1) ist produktspezifisch und ließe sich nicht in einen beliebigen anderen PRD einsetzen. Die NFRs sind mit konkreten Schwellen unterlegt (SHA-256, 32 Byte, 15 Min Token, 30-Tage-Session, Rate-Limit pro E-Mail+IP) statt „system must be secure". Keine Persona-, Innovation- oder NFR-Theater-Signale.

## Strategic coherence — strong

Der PRD hat eine These und wettet sichtbar darauf: Datentrennung + passwortloser Zugang als der eine release-treibende Kern, alles Bestehende ausdrücklich als Kontext markiert (§0, §4.4–4.6 „bestehend"). Feature-Priorisierung folgt der These, nicht „was ist einfach zuerst". Die Success Metrics zielen auf die These (Team-Nutzung, Datentrennung) statt auf Aktivitäts-Vanity-Metriken, und die Counter-Metric (SM-C1: Login-Komfort nicht auf Kosten der Sicherheit) ist vorhanden und sinnvoll gegen SM-3 gerichtet. MVP-Scope-Art ist klar problemlösend.

## Done-ness clarity — adequate

Dies ist die Stärke des PRD und zugleich der Ort der schärfsten Restlücken. Fast alle FRs tragen mindestens eine testbare Consequence mit HTTP-Status oder beobachtbarem Zustand (401/403/429, „Token als verbraucht markiert", „disjunkte Datensätze"). Keine „handles X gracefully"-Weichmacher. Aber:

**FR-6 (Migration)** beschreibt nur den Erfolgspfad (idempotent, Admin sieht Daten). Es ist ein destruktiver `documents`-Table-Rebuild auf Produktivdaten (Addendum: DROP/RENAME). Das produktseitige „Done" muss den Fehlerfall einschließen — kein Datenverlust bei Abbruch. Das Addendum erwähnt „Migration gegen Prod-DB-Kopie" in der Verifikation, aber FR-6 selbst hat keine Fehlerfall-Consequence.

**Admin-Datengrenze:** Das Glossar sagt, der Admin habe „zusätzlich eine eigene Datenbasis wie jeder Nutzer" und FR-5 filtert per `user_id` — also *impliziert* der PRD, dass ein Admin fremde Datenbasen nicht lesen kann. Ausgesprochen wird es nie. Bei einem sicherheitslasttragenden Punkt sollte „Admin hat keine Daten-Superkraft" explizit stehen (FR-11-Consequence oder Non-Goal), nicht nur ableitbar sein.

### Findings
- **medium** Migration ohne Fehlerfall-Done-Bedingung (§4.2 / FR-6) — destruktiver Rebuild auf Produktivdaten, aber keine Consequence für Abbruch/Datenverlust. *Fix:* Consequence ergänzen: „Bei Migrationsfehler bleiben die Ursprungsdaten unverändert; Cutover erst nach erfolgreicher Verifikation gegen eine DB-Kopie."
- **medium** Admin-Daten-Zugriffsgrenze nur ableitbar (§3 Glossar / §4.3 FR-11) — nirgends steht, dass ein Admin fremde Datenbasen *nicht* lesen kann; ein Leser könnte Admin als Daten-Superuser annehmen. *Fix:* explizite FR-11-Consequence oder Non-Goal: „Admin-Recht umfasst ausschließlich die Allowlist; `/api/state` bleibt auch für Admins auf die eigene `user_id` beschränkt."

## Scope honesty — strong

Die Non-Goals (§5) leisten echte Arbeit und decken die Verwechslungsgefahren ab (keine kollaborative Datenbasis, keine Mandanten-Ebene, keine Buchhaltungs-Rolle). §6.2 nennt Out-of-Scope mit Begründung. `[ASSUMPTION]` an FR-10, `[NOTE FOR PM]` an der DSGVO-Frage. Die Open-Items-Dichte (5 Open Questions + 1 NOTE + 4 Assumptions) ist für die Stakes angemessen — zwei der Open Questions (SMTP-Zugangsdaten, Deployment-Orchestrierung) sind operative Ship-Blocker, aber sauber als solche erkennbar. De-Scoping wird offen vorgeschlagen, nicht still gemacht.

Eine Ungenauigkeit im Scope-Anspruch: FR-10 verspricht „sofortiger Zugangsentzug" beim Entfernen eines Nutzers. Serverseitig stimmt das (CASCADE killt Sessions → 401). Aber NFR-8 + FR-7 halten die letzten Daten offline im LocalStorage lesbar, bis ein Nutzerwechsel sie leert. Auf dem geteilten Stationsrechner könnte ein entfernter Nutzer seine zwischengespeicherten Daten offline noch sehen. Kleine Kante, aber der Absolutheits-Anspruch ist leicht überzogen.

### Findings
- **low** „Sofortiger Zugangsentzug" überzeichnet (§4.3 FR-10 vs. NFR-8/FR-7) — Server-Sessions sterben sofort, der Offline-LocalStorage-Cache eines entfernten Nutzers bleibt aber bis zum Nutzerwechsel lesbar. *Fix:* Caveat ergänzen („serverseitiger Zugang sofort entzogen; gerätelokaler Cache wird beim nächsten Nutzerwechsel geleert").

## Downstream usability — strong

Chain-top-PRD (speist Architecture → Epics → Stories), und die Traceability hält: FR-1..FR-14 lückenlos, UJ-1..UJ-4, SM/SM-C, NFR-1..8 alle eindeutig. Cross-Refs lösen auf (`Realizes UJ-x`, `Validates FR-x`, `Counterbalances SM-3`). Stichprobe SM-2 → FR-5, FR-7: existieren und passen. Das Glossar ist vorhanden und die Domänennomen sind über FRs/UJs weitgehend konsistent benutzt. Jeder Abschnitt ist einzeln herausziehbar.

Kleine Glossar-Drift: die Datenbasis wird über „Urlaubs-Flags" definiert (§3), an anderer Stelle heißt dasselbe Konzept „Urlaubsmodus" (§4.4) — kein eigener Glossar-Eintrag, zwei Bezeichnungen. Downstream harmlos, aber notierbar.

## Shape fit — strong

Korrekt kalibriert. Brownfield-Tool mit lasttragender UX (Magic-Link-Flow, Nutzerwechsel) → UJs mit benannten Protagonisten sind hier zurecht schwergewichtig, nicht Overhead. Bestehende Fähigkeiten sind sauber von neuen getrennt („bestehend"-Markierung) und die Brownfield-Referenzen decken sich mit `project-context.md` (better-sqlite3 synchron, `documents`-PK-Rebuild, `foreign_keys` default OFF). Weder über- noch unterformalisiert.

## Mechanical notes

- **Assumptions-Index-Roundtrip (medium):** §0 behauptet „Annahmen sind inline mit `[ASSUMPTION]` markiert und in §9 indexiert." Tatsächlich ist nur die FR-10-Annahme inline getaggt. Die drei übrigen Index-Einträge (§2 eigene Arbeits-E-Mails, §4.6 ein Gerät/Session, §7/SM-3 zuverlässige Mail-Zustellung) haben keinen korrespondierenden Inline-Tag. Roundtrip gebrochen → entweder Inline-Tags nachziehen oder Index auf tatsächlich inline markierte Annahmen reduzieren.
- **Success-Metric-Messbarkeit (medium):** SM-1/SM-2/SM-3 benennen kein Messinstrument. Die App sammelt keine Analytics/Timing; SM-2 („0 Vorfälle, in denen ein Nutzer fremde Daten sieht") hat keinen Detektionsmechanismus — ein Leck wäre still. Für ein 3-Personen-Team ist manuelle Beobachtung (Admin prüft `users`-Tabelle, Selbstauskunft für SM-3) legitim, aber der PRD sollte je Metrik sagen *wie* sie beobachtet wird und für SM-2 den stehenden 2-Nutzer-Isolationstest (Addendum-Verifikation) als laufenden Check benennen.
- **Glossar-Drift (low):** „Urlaubs-Flags" (§3) vs. „Urlaubsmodus" (§4.4) für dasselbe Konzept; kein eigener Glossar-Eintrag.
- **Cross-Ref `§8.1`:** In Constraints referenziert; mappt auf Open Question #1 — auflösbar, aber die Open Questions sind als flache Liste ohne `§8.x`-Nummerierung geführt. Konsistente Nummerierung würde den Verweis wasserdicht machen.
