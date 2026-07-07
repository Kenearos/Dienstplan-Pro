# PRD-Review — Edge-Case-Hunter

**Dokument:** `prd.md` (Team-Release v1.0) + `addendum.md`
**Linse:** Unbehandelte Randfälle in den Auth-/Datentrennungs-/Migrations-/Nutzerwechsel-/Offline-Anforderungen.
**Datum:** 2026-07-07
**Verdict:** revise

Methodik: Jeder Flow (Login anfordern → einlösen → Sitzung → Datentrennung → Admin → Migration → Nutzerwechsel → Offline) wurde Schritt für Schritt abgegangen und an jedem Verzweigungs-/Grenzpunkt gefragt „was, wenn hier das Unerwartete passiert?". Kritisiert werden nur Lücken in den **Anforderungen**, nicht im (noch nicht existenten) Code. Technisches „Wie" gehört ins Addendum und wird nicht bemängelt, wo es dort steht.

---

## Kritisch

### K1 — Letzter Admin / Admin entfernt sich selbst → Aussperrung (FR-10, FR-11)
FR-10 erlaubt „Ein Admin kann einen Nutzer entfernen" ohne Ausnahme. Nichts hindert den (einzigen) Admin daran, **sich selbst** oder den **letzten verbliebenen Admin** zu entfernen. Folge: sofortiger Zugangsentzug (CASCADE löscht die eigenen Sitzungen, FR-10) und danach **existiert kein Admin mehr** — die Allowlist kann von niemandem mehr verwaltet werden, kein neuer Nutzer freigeschaltet, kein Admin nachbenannt (Beförderung ist Non-Goal §6.2). Das Team-Tool ist unwiederbringlich verwaltungslos, Wiederherstellung nur per DB-Eingriff.
**Fehlt:** Invariante „mindestens ein Admin muss immer existieren" + Verbot der Selbst-/Letzter-Admin-Entfernung mit definierter Fehlermeldung. §8 Q5 („mehrere Admins später?") berührt das, deckt es aber nicht ab.

### K2 — `ADMIN_EMAIL` fehlt/leer/ungültig beim ersten Boot → kein Admin + verwaiste Alt-Daten (FR-6, Glossar §3, Constraints)
Das Addendum ordnet richtig `seedAdmin` vor `migrateToMultiUser` an. Der PRD sagt aber nirgends, was gilt, wenn `ADMIN_EMAIL` **nicht gesetzt oder leer** ist. Dann legt `seedAdmin` keinen Admin an, `migrateToMultiUser` bekommt keine `adminUserId` → die globalen Alt-Daten werden einer undefinierten/keiner `user_id` zugeordnet (verwaist, für niemanden sichtbar) **und** es existiert kein Admin, der die Allowlist öffnen könnte → Totalaussperrung ab Deploy 1. Die Constraints listen `ADMIN_EMAIL` als Env-Variable, fordern aber kein **Fail-Fast** („Server startet nicht ohne gültige `ADMIN_EMAIL`").
**Fehlt:** Anforderung, dass der Server bei fehlender/leerer `ADMIN_EMAIL` laut und ohne Migration abbricht.

---

## Hoch

### H1 — Offline-Start vs. Auth-Gate: 401 nicht von „Netz nicht erreichbar" unterschieden → NFR-8-Widerspruch
Addendum-Bootstrap: `GET /api/auth/me` **vor** App-Start; „401 → Overlay". NFR-8 verspricht aber, die Kernapp (Erfassen/Rechnen) funktioniert **offline weiter**. Öffnet ein bereits eingeloggter Nutzer die App **ohne Netz** (oder bei kurzem Serverausfall), schlägt `auth/me` mit *Netzwerkfehler* fehl — **nicht** mit 401. Der PRD/Addendum behandelt nur den 401-Fall. Wird jeder Fehlschlag wie „keine Sitzung" behandelt, sperrt das Login-Overlay den Nutzer aus der offline-fähigen Kernapp aus — direkter Widerspruch zu NFR-8. Wird er ignoriert, drohen Stale-Data-Fälle.
**Fehlt:** Anforderung, die „kein Netz / Serverfehler" (App offline weiterlaufen, letzte bekannte Sitzung annehmen) klar von „Sitzung ungültig/401" (Overlay) trennt.

### H2 — E-Mail-Sicherheitsscanner verbrauchen den Einmal-Token vor dem Nutzer (FR-2, NFR-3)
FR-2/NFR-3: Token ist **einmalig** (`used_at`) und wird per `GET /auth?token=` eingelöst. Firmen-/Klinik-Postfächer (Microsoft Safe Links, Proofpoint, Virenscanner) **rufen Links in E-Mails automatisch vorab auf**. Ein solcher GET löst den Token ein und markiert ihn als verbraucht — **bevor** der Mensch klickt. Ergebnis: der Nutzer bekommt „Link ungültig/verbraucht" (FR-2) und kommt nie rein; ein per Design offline-taugliches Team-Tool wird für Corporate-Mail unbrauchbar. Das ist ein bekannter, hochwahrscheinlicher Fall gerade im Zielumfeld (Assistenzärzte mit Klinik-E-Mail).
**Fehlt:** Anforderung, die Scanner-Prefetch toleriert (z. B. Einlösung erfordert menschliche Bestätigung/POST auf der Landing-Page statt reinem GET-Verbrauch).

### H3 — Re-Login nach Sitzungsablauf + offene Offline-Änderungen → Datenverlust (FR-3, FR-7, FR-14)
FR-14 verspricht „Offline getätigte Änderungen gehen nicht verloren" (pending-Flag). Kollidiert aber mit Ablauf/Nutzerwechsel: Läuft die Sitzung ab (401), während lokale `pending`-Änderungen ungeflusht sind, erscheint das Overlay. Loggt sich dann (a) derselbe Nutzer neu ein → `boot()` zieht Server-Stand; ob die pending-Änderungen den Pull überleben oder überschrieben werden, ist **nicht spezifiziert**. Loggt sich (b) am geteilten Praxis-Rechner ein **anderer** Nutzer ein (genau UJ-4), löscht `clearUserData` (FR-7) die pending-Änderungen von Nutzer A **unwiederbringlich**. FR-14 und FR-7 widersprechen sich in diesem Pfad.
**Fehlt:** Anforderung, wie pending-Änderungen bei Re-Login (gleicher Nutzer) erhalten bleiben und was mit ungeflushten Änderungen passiert, wenn am selben Gerät ein anderer Nutzer einloggt (Warnung? Verwerfen? Blockieren?).

### H4 — `ADMIN_EMAIL`-Änderung nach erfolgter Migration → neuer Admin leer, Alt-Daten gestrandet (FR-6)
Die Migration ist idempotent, geschützt durch „nur wenn `documents` noch keine `user_id`-Spalte hat" (Addendum). Wird `ADMIN_EMAIL` bei einem **späteren** Deploy geändert (Tippfehler-Korrektur, Personenwechsel), legt `seedAdmin` einen **zweiten** Admin an, aber die Migration läuft nicht erneut → die Alt-Daten bleiben beim **alten** Admin, der neue Admin startet leer. Es existieren nun zwei Admins mit unklarer Datenzuordnung. FR-6 behandelt nur den Erst-Migrationsfall.
**Fehlt:** Anforderung/Annahme zum Umgang mit einer `ADMIN_EMAIL`-Änderung nach der Migration (bzw. explizites „`ADMIN_EMAIL` ist nach Erst-Boot unveränderlich").

---

## Mittel

### M1 — Gleichzeitige Sitzungen desselben Nutzers auf zwei Geräten → stiller Datenverlust (§4.6, Assumptions §9)
Assumption §9 nimmt an, „ein Nutzer arbeitet üblicherweise von einem Gerät/Session zugleich; last-write-wins ist ausreichend". „Üblicherweise" ist kein Rand. Handy + Stationsrechner gleichzeitig offen (realistisch im Klinikalltag) → last-write-wins auf ganzen Dokumenten überschreibt die Dienste-Eingabe des einen Geräts komplett mit dem Stand des anderen — **ohne Warnung**. Nichts in den Anforderungen begrenzt die Zahl aktiver Sitzungen pro Nutzer oder erkennt konkurrierende Schreibvorgänge. SM-2 zählt nur *fremde* Daten als Leck, deckt diesen Eigen-Datenverlust nicht ab.
**Fehlt:** Bewusste Entscheidung — entweder als Risiko akzeptieren (im PRD benennen) oder eine Erkennungs-/Warn-Anforderung.

### M2 — Geteilte Klinik-IP (NAT) + Pro-IP-Rate-Limit → legitime Kollegen ausgesperrt (FR-1, NFR-4)
NFR-4 rate-limitiert „pro E-Mail **+ IP**". Im Addendum ist nur `RATE_LIMIT_EMAIL=5` konfiguriert — ein separater Pro-IP-Wert fehlt/ist unbenannt. Genau das Zielszenario (mehrere Ärzte hinter **einer** Klinik-NAT-IP, UJ-4 geteilter Rechner) bedeutet: viele Login-Anfragen aus derselben IP. Ist das IP-Limit ähnlich niedrig (5/15 min), wird der 6. Kollege, der in einem Fenster einen Link anfordert, mit 429 abgewiesen, obwohl legitim. Das kollidiert mit SM-1 (≥3 Kollegen im ersten Monat) und SM-3 (reibungsloser Zugang).
**Fehlt:** Getrennte, an geteilte IPs angepasste Dimensionierung des Pro-IP-Limits (oder explizit „Pro-IP-Limit großzügig, Enforcement primär per E-Mail").

### M3 — Nutzerwechsel-Erkennung bei „noch kein gemerkter Nutzer" undefiniert → Stale-Data/Leck-Risiko (FR-7)
FR-7 cleart, wenn der eingeloggte Nutzer „vom zuletzt lokal gemerkten **abweicht**". Der Erstfall (nichts gemerkt, `dienstplan_current_user` leer) ist nicht spezifiziert. Kritisch: Der bisherige Browser des Admins enthält aus der Login-losen Ära bereits globale Daten unter `dienstplan_employees|_duties|_vacation`. Loggt sich dort als **erster** ein *Nicht-Admin* ein, ist kein Vor-Nutzer gemerkt → je nach Auslegung wird **nicht** gecleart → die Alt-Daten des Admins blitzen kurz beim Nicht-Admin auf, bevor der Server-Pull greift. Das ist ein potenzielles Datentrennungs-Leck (SM-2 = 0 Vorfälle).
**Fehlt:** Explizit „bei Login clearen, wenn kein Nutzer gemerkt ODER ein anderer gemerkt ist".

### M4 — Kein Pfad für E-Mail-Änderung eines Nutzers (Glossar §3 „eine E-Mail = ein Nutzer")
Identität = E-Mail. Ändert sich die Arbeits-E-Mail eines Kollegen (Namenswechsel, Domänenwechsel der Klinik), gibt es keinen Anforderungspfad: Der Admin kann nur die neue E-Mail freischalten → das erzeugt einen **brandneuen, leeren** Nutzer; die gesamte Datenbasis unter der alten E-Mail ist gestrandet (und die alte E-Mail bleibt aktiv, bis manuell entfernt). Weder in Features, Non-Goals noch Open Questions erwähnt.
**Fehlt:** Entweder als expliziter Non-Goal deklarieren („E-Mail-Änderung = neuer Nutzer, Alt-Daten manuell") oder als Open Question aufnehmen.

### M5 — Teil-/abgebrochene Migration nicht abgedeckt; „idempotent" ≠ crash-sicher (FR-6)
FR-6 fordert „ein zweiter Serverstart wiederholt die Migration nicht (idempotent)". Der Idempotenz-Guard hängt (Addendum) an der `user_id`-Spalte in `documents`. Bricht der Prozess **zwischen** dem `documents`-Rebuild und dem `history`-Update ab, ist beim Neustart der Guard bereits erfüllt (documents hat user_id) → die Migration wird übersprungen, während `history`-Zeilen dauerhaft `user_id IS NULL` behalten (verwaiste Historie). „Idempotent" laut FR-6 deckt Wiederholung ab, nicht **partiellen Abbruch**.
**Fehlt:** Anforderung, dass die Migration atomar (eine Transaktion) oder wiederaufsetzbar ist, sodass ein Absturz keinen halb-migrierten Zustand hinterlässt.

---

## Niedrig

### N1 — Mehrere offene Login-Tokens gleichzeitig (FR-1, NFR-3)
Fordert ein Nutzer mehrere Links an (erste Mail kam nicht), erzeugt jede Anfrage laut FR-1 einen Token. Nichts sagt, ob eine neue Anfrage ältere unverbrauchte Tokens invalidiert. Ergebnis: bis zu `RATE_LIMIT_EMAIL` gleichzeitig gültige Login-Tokens im 15-Min-Fenster. Meist harmlos (alle einmalig/kurzlebig), aber vergrößert das Zeitfenster für Token-Diebstahl leicht.
**Fehlt (optional):** „Neue Anfrage invalidiert vorherige offene Tokens desselben Nutzers."

### N2 — Lokale Daten eines entfernten Nutzers verbleiben auf dessen Gerät (FR-10, FR-7)
FR-10 entzieht serverseitig sofort den Zugang (CASCADE). Die zuletzt gesyncten Daten liegen aber weiter im LocalStorage des Geräts des entfernten Nutzers (`clearUserData` läuft nur beim *Wechsel*). Auf dem Eigengerät akzeptabel, aber der Vollständigkeit halber im Löschkonzept (§8.1) mitzudenken.
**Fehlt (optional):** Erwähnung im Löschkonzept.

---

## Positiv abgedeckt (kein Handlungsbedarf)
- Token-Reuse / abgelaufener Token (FR-2) — klar behandelt.
- Sofortiger Zugangsentzug bei Nutzerlöschung serverseitig via CASCADE (FR-10, NFR-5).
- Login-Token eines zwischenzeitlich entfernten Nutzers wird durch CASCADE ungültig — implizit gedeckt.
- Neutralität des Request-Endpunkts (FR-1, NFR-4) gegen Allowlist-Enumeration.
- Gerätelokale Config (OpenRouter-Key) überlebt Nutzerwechsel (FR-7).
- SameSite=Lax erlaubt Cookie-Set bei Top-Level-Navigation aus der Mail (FR-2).
