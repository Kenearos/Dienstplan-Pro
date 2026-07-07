# Adversarial Review — PRD Dienstplan-Pro Team-Release v1.0

*Linse: zynischer/adversarialer Review. Fokus: Klarheit, Vollständigkeit, Umsetzbarkeit des PRD selbst. Technisches "Wie" (Addendum) ist bewusst ausgelagert und wird NICHT als "PRD-Lücke" gewertet.*

**Verdict: REVISE.** Der PRD ist sauber strukturiert und die Auth-Mechanik ist gut durchdacht. Aber er ruht auf zwei ungeklärten Fundamenten (Datenmodell-Bedeutung, E-Mail-Zustellung als einziger Zugangsweg), definiert unmessbare Erfolgsmetriken und hat ein UX-Sackgassen-Problem, das direkt aus der Sicherheitsentscheidung "neutrale 200" folgt. Nichts davon ist ein Blocker im Sinne von "unbaubar", aber alles davon wird ein skeptischer Dev/Architekt zerreißen, bevor er die erste Zeile schreibt.

---

## Kritisch / Hoch

### 1. Kern-Widerspruch: Was erfasst ein einzelner Nutzer eigentlich? (§2.1 vs §2.3/UJ-2 vs Glossar)
Der PRD ist sich uneins, ob ein Nutzer nur **seine eigenen** Dienste erfasst oder die **des ganzen Teams**:
- §2.1 JTBD: "will ich **meine** geleisteten Dienste erfassen" (Singular, eigene Person).
- UJ-2 Climax: "Er sieht **pro Mitarbeiter** die Gewinner-Variante" (Plural — mehrere Mitarbeiter in seiner eigenen Datenbasis).
- Glossar: Datenbasis = Dienste/**Mitarbeiter**/Urlaubs-Flags **eines** Nutzers; Mitarbeiter = benannter Eintrag "innerhalb der Datenbasis eines Nutzers".

Das ist nicht kosmetisch. Wenn jeder Nutzer eine eigene, isolierte Datenbasis mit **mehreren** Mitarbeitern führt (§5 verbietet ja explizit eine gemeinsame Datenbasis), dann müssen 3 Kollegen jeweils **denselben Team-Dienstplan komplett neu privat eintippen**. Das ist massiver Doppelaufwand und untergräbt genau die Rationale des Multi-User-Release. Die Alternative — jeder erfasst nur seine eigene Person — passt nicht zu "pro Mitarbeiter" und nicht zum bestehenden Modell (heute tippt der Admin den ganzen Plan für alle ein). Der PRD muss unmissverständlich sagen, welches der beiden Modelle gilt, sonst bauen Architektur und Dev an der falschen Sache. **Verdächtig: das reale Bedürfnis ist evtl. "Admin rechnet für alle und teilt Berichte" — was der aktuelle Single-User-Zustand bereits kann und den Multi-User-Bedarf teilweise aushöhlt.**

### 2. E-Mail-Zustellung ist Single Point of Failure für den EINZIGEN Login-Weg — und ist ungeprovisioniert (§4.1, §8.3, §9)
Magic-Link ist die einzige Authentifizierung (§5: keine Passwörter, kein SSO, kein Fallback). Damit hängt der gesamte "release-treibende Kern" (§0) an SMTP-Zustellung. Und ausgerechnet die ist:
- §8.3 **offene Frage** (Zugangsdaten + SPF/DKIM "vom Nutzer bereitzustellen") — d.h. beim Release noch nicht existent.
- §9 **bloße Annahme** ("Mail-Zustellung ist zuverlässig genug").

Wenn Mails im Spam landen oder der Provider zickt, ist **niemand** mehr reinzukommen — es gibt keinen Zweitweg. Ein zynischer Architekt fragt: Was ist der Notzugang, wenn SMTP am Release-Tag ausfällt? Der Admin-Konsolen-Fallback (`console.log(link)` laut Addendum) ist nur Dev/Test, nicht produktiv nutzbar. Der PRD verkauft "reibungslosen Zugang" (SM-3) auf einem Fundament, das er selbst als ungebaut und nur angenommen markiert. Mindestens ein produktiver Notzugang (z.B. Admin kann für einen Nutzer manuell einen Link generieren und out-of-band schicken) gehört in Scope oder explizit begründet ausgeschlossen.

### 3. Erfolgsmetriken sind nicht messbar — es gibt keine Instrumentierung (§7)
Der PRD definiert vier Metriken, von denen keine mit dem beschriebenen System messbar ist:
- **SM-1** (≥3 Logins im ersten Monat): Es gibt kein Analytics/Login-Event-Tracking. Woher kommt die Zahl? Manuelles DB-Abfragen? Nirgends spezifiziert.
- **SM-2** (0 Datenleck-Vorfälle): Abwesenheit von Meldungen ≠ Abwesenheit von Lecks. Unfalsifizierbar wie formuliert.
- **SM-3** (Median "E-Mail eingeben → in der App" < 2 Min): Erfordert clientseitiges Timing über den Mailversand hinweg — technisch nirgends vorgesehen und faktisch nicht instrumentierbar.
- **SM-4** (Admin bestätigt Alt-Daten): einzige realistisch prüfbare, aber rein manuell.

Entweder gehört minimale Instrumentierung (Login-Zähler o.ä.) in Scope, oder die Metriken müssen ehrlich als "manuell/qualitativ" umformuliert werden. So wie sie dastehen, sind sie Wunschdenken.

### 4. Die "neutrale 200" erzeugt eine Onboarding-Sackgasse — und die versprochene "Einladung" existiert als Feature gar nicht (FR-1, UJ-1, UJ-3)
FR-1: nicht-freigeschaltete E-Mails bekommen dieselbe 200 und "Prüfe dein Postfach", aber **nie eine Mail**. Ein Kollege, dem der Admin sagt "du bist freigeschaltet", der aber z.B. einen Tippfehler in der Allowlist hat (oder noch nicht drin ist), sitzt mit "Prüfe dein Postfach" ewig da, ohne Hinweis warum. Sicherheit gegen Enumeration ist richtig — aber der PRD adressiert die daraus folgende Support-Last/Frustration mit keinem Wort.

Verschärfend: UJ-1 spricht von "klickt direkt den **Einladungslink**", UJ-3 von "ihr den Einladungslink/die Info schicken" — aber **kein FR beschreibt ein Einladungs-/Invite-Mail-Feature**. FR-8 fügt nur die E-Mail zur Allowlist hinzu; der Nutzer muss selbst zur Seite und einen Link anfordern. Die Journeys versprechen einen Einladungsfluss, den die Requirements nicht liefern. Entweder Invite-Feature spezifizieren oder die Journeys ehrlich auf "Admin schaltet frei + teilt manuell mit, Nutzer fordert selbst an" zurechtstutzen.

---

## Mittel

### 5. 15-Minuten-Token kollidiert mit realem E-Mail-Verhalten (FR-2/NFR-3)
Token 15 Min gültig, aber der PRD sorgt sich selbst um Zustelllatenz (SM-3 rechnet sie ein). E-Mail wird oft erst 20–60 Min später gelesen. Ergebnis: abgelaufener Link, "Link ungültig", neu anfordern — ein Frustloop, den der Edge-Case in UJ-1 zwar erwähnt, dessen Häufigkeit aber unterschätzt wird. 15 Min ist für passwortlose E-Mail-Links aggressiv kurz. Entweder Wert überdenken oder die Re-Request-Ergonomie als First-Class-Fall behandeln.

### 6. Geteilter Klinik-Rechner + Rate-Limit pro IP = gegenseitige Aussperrung (FR-1/NFR-4 vs UJ-4)
UJ-4 macht den geteilten Stationszimmer-Rechner explizit zum Szenario. NFR-4/FR-1 rate-limiten "pro E-Mail **und pro IP**". In einer Klinik hinter NAT teilen sich alle Kollegen eine öffentliche IP. Mehrere legitime Kollegen, die kurz nacheinander Links anfordern, laufen ins IP-Limit (`RATE_LIMIT_EMAIL=5` / 15 Min laut Addendum) und sperren sich gegenseitig aus. Der PRD stellt beide Anforderungen nebeneinander, ohne den Konflikt zu erkennen.

### 7. OpenRouter-Key überlebt den Nutzerwechsel — Kosten-/Secret-Leck auf geteiltem Rechner (FR-7)
FR-7 löscht beim Nutzerwechsel die Datenschlüssel, lässt aber "gerätelokale Konfiguration (OpenRouter-Key/Modell)" **bewusst stehen**. Auf dem geteilten Praxis-Rechner (UJ-4) bedeutet das: Kollege B nutzt beim Foto-Import stillschweigend Kollege A's **kostenpflichtigen** API-Key. Das widerspricht dem Isolations-Versprechen ("jeder sieht/nutzt nur das Seine") für ein abrechnungsrelevantes Secret. Zumindest als bewusste Entscheidung + Risiko benennen, besser: auf geteilten Geräten auch mitlöschen oder gar nicht gerätelokal halten.

### 8. "last-write-wins bleibt korrekt" ist zu stark für Multi-Device bei 30-Tage-Sessions (§5 vs §9)
§5 behauptet definitiv, LWW "bleibt korrekt, weil ein Nutzer allein auf seinen Daten arbeitet". §9 relativiert: Nutzer arbeitet "**üblicherweise** von einem Gerät zugleich". Die harte Korrektheitsaussage steht auf einer zugegeben nur wahrscheinlichen Annahme. Mit 30-Tage-Sessions ist derselbe Nutzer plausibel auf Handy **und** Klinik-Rechner gleichzeitig eingeloggt; LWW auf ganzen Dokumenten kann dann still Änderungen überschreiben (Datenverlust). "Korrekt" durch "in der Praxis meist ausreichend, akzeptierter Datenverlust bei Parallel-Edit desselben Nutzers" ersetzen — oder das Risiko explizit als bekannt akzeptieren.

### 9. Fehl-konfigurierte ADMIN_EMAIL beim Erst-Boot ist permanent — bedroht "nahtlos übernommen" (FR-6)
FR-6 ordnet alle Alt-Daten dem `ADMIN_EMAIL`-Nutzer zu, und die Migration ist idempotent (läuft nie wieder). Ist die Env beim ersten Start falsch gesetzt (Tippfehler), landen sämtliche Bestandsdaten beim falschen/leeren Nutzer — **ohne im PRD genannten Wiederherstellungspfad**. Das Kern-Versprechen "die bisherige Datenbasis wurde nahtlos übernommen" (§1) hängt an einer einzigen, unumkehrbaren Env-Variable. Der PRD sollte einen Verifikations-/Rücksetz-Schritt fordern (Migration nur nach Bestätigung, oder umkehrbar bis Admin bestätigt hat).

### 10. Scope-Grabbag enthält undefinierte und unfertige Punkte (§6.1, §8.2)
- "**Bericht-Text-Splice-Bug fixen**" steht als In-Scope-Zeile ohne jede Beschreibung, ohne FR, ohne Akzeptanzkriterium. Was ist der Bug? Nicht spezifizierbar = nicht schätzbar = nicht testbar.
- §8.2: das **Deployment-Ziel/Orchestrierung ist offen** ("potctl? Portainer?"). Für ein v1.0-**Release** ist der unklare Ausliefermechanismus eine echte Lücke — der letzte Meter, an dem Releases sterben.
Beides in konkrete, geschätzte Arbeitspakete überführen oder aus dem MVP nehmen.

---

## Niedrig

### 11. Kein Schutz gegen Entfernen des letzten/eigenen Admins (FR-10/§8.5)
FR-10 lässt einen Admin Nutzer entfernen inkl. Sessions (CASCADE). Nichts hindert den (einzigen) Admin daran, sich selbst zu entfernen → sofortiger Verlust aller Verwaltungsfunktionen. Zwar via Neustart (seedAdmin idempotent) teilweise heilbar, aber der PRD sollte einen Guard "letzter Admin nicht entfernbar" fordern. §8.5 ("mehrere Admins später?") streift das Thema, adressiert die Selbst-Aussperrung aber nicht.

### 12. Session-Dauer gleichzeitig festgelegt und offen (FR-3 vs §8.4, SM-C1)
FR-3 setzt Default 30 Tage; §8.4 fragt, ob 30 Tage passen; SM-C1 verbietet, die Dauer für Komfort zu lockern. Kleiner Spannungsbogen: ein sicherheitsrelevanter Parameter ist zugleich verbindlich, offen und mit einer Counter-Metric eingezäunt. Vor Dev entscheiden und OQ4 schließen.

### 13. Formaler Nit: fehlerhafte Trace-Referenz (UJ-2)
UJ-2 trägt "**Realizes UJ-1**" im Kontext — eine Journey kann keine andere Journey "realisieren". Vermutlich Copy-Paste. Traceability-Sauberkeit leidet, wenn solche Marker nicht stimmen.

---

## Was gut ist (fairerweise)
- Auth-Sicherheitsmodell (Hash-only Speicherung, neutraler Endpunkt, kurzlebige Tokens, widerrufbare Server-Sessions, CASCADE) ist konsistent und durchdacht.
- FRs sind fast durchgängig mit testbaren "Consequences" hinterlegt — gute Vorlage für Stories.
- Non-Goals und Assumptions-Index sind explizit; DSGVO-Löschfrage ist ehrlich als offen markiert statt versteckt.
- Trennung PRD/Addendum ist sauber durchgehalten.
