# Team-Dienstplan: Dienste werden Datensätze (Teilprojekt 1)

Stand: 2026-08-08 · Status: **Entwurf, wartet auf Freigabe** · Methode: DEV-METHOD v1.15

## Warum

Der Wunsch war eine Darstellung: „eine Art Tabelle, wo man nur reinklickt und den Namen
von sich reinklickt, und der Admin macht die Kontrolle." Aus den Klärungsfragen wurde
daraus etwas Größeres als eine Oberfläche — das Bedienkonzept setzt ein anderes
Datenmodell und ein anderes Rechtemodell voraus.

## Entscheidungen des Benutzers (2026-08-08)

| Frage | Entscheidung |
|---|---|
| Wer trägt ein? | **Jeder mit eigenem Login.** Die acht Kollegen bekommen Konten, tragen ihre eigenen Dienste ein |
| Was sieht ein Kollege? | **Den ganzen Dienstplan des Teams** — wie ein Aushang. Eintragen darf jeder nur für sich |
| Was heißt Kontrolle? | **Torwächter pro Dienst**: jeder einzelne Dienst braucht die Freigabe des Admins, erst dann zählt er für den Bonus |
| Wer sieht Beträge? | **Jeder nur seinen eigenen.** Der Admin sieht alle |
| Architektur | **Ansatz A — Server ist die Wahrheit.** Eintragen braucht Verbindung; offline bleibt der Plan lesbar |

**Aufgelöster Widerspruch:** Zwischenzeitlich fielen die Antworten „Freigeben müssen" und
„nur Ausnahmen prüfen" — das eine ist ein Torwächter, das andere ein Rauchmelder. Auf
Nachfrage und nach Nennung des Preises (40–50 Entscheidungen im Monat, drei Zustände je
Tabellenzelle) fiel die Wahl bewusst auf den **Torwächter pro Dienst**.

**Verworfene Alternativen:** Ansatz B (Offline-Eintragen mit Konfliktauflösung) — baut
Synchronisation pro Datensatz für einen Fall, den das Fachkonzept nicht will: ein
genehmigungspflichtiger Eintrag ist ohnehin erst gültig, wenn er beim Server war.
Ansatz C (zwei Welten nebeneinander) — zwei Datenhaltungen und am Monatsende die Frage,
welche Zahl gilt.

## Zuschnitt

**Teilprojekt 1 baut:** das Datenmodell, die Endpunkte, die Autorisierung und die
Migration. Am Ende kann der Server Dienste mit Besitzer und Status speichern, ausliefern
und entscheiden.

**Teilprojekt 1 baut nicht:** die Team-Tabelle, die Freigabe-Oberfläche, die Umstellung
der Bonusberechnung. Die bestehende Oberfläche läuft während TP1 unverändert weiter, weil
die alten Blobs unangetastet liegen bleiben.

**Folge-Teilprojekte, je eigene Spec:** (2) Konten für die acht samt Namenszuordnung ·
(3) die Team-Tabelle als Eingabe · (4) Freigabe-Ansicht und Bonus auf freigegebene Dienste.

## Datenmodell

```sql
CREATE TABLE IF NOT EXISTS duties (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  -- KEIN CASCADE: freigegebene Dienste sind die Grundlage gezahlter Verguetung
  -- und duerfen nicht verschwinden, wenn ein Konto entfernt wird (Gate-Finding S1).
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  date       TEXT NOT NULL,              -- 'YYYY-MM-DD', reiner Kalendertag
  share      REAL NOT NULL,              -- 1.0 oder 0.5
  status     TEXT NOT NULL,              -- pending | approved | rejected
  note       TEXT,                       -- Begründung bei Ablehnung
  created_at TEXT NOT NULL,
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT
);
-- Ein GUELTIGER Dienst pro Person und Tag. Abgelehnte zaehlen NICHT mit,
-- sonst blockiert eine Ablehnung den Tag fuer immer (Gate-Finding 1).
CREATE UNIQUE INDEX IF NOT EXISTS idx_duties_person_tag
  ON duties(user_id, date) WHERE status <> 'rejected';
CREATE INDEX IF NOT EXISTS idx_duties_date ON duties(date);

-- Spalten nur anlegen, wenn sie fehlen (PRAGMA table_info pruefen) — genau das
-- Muster, das server/auth.js fuer die Multi-User-Migration schon verwendet.
ALTER TABLE users ADD COLUMN display_name TEXT;
-- Ausscheiden heisst deaktivieren, nicht loeschen (Gate-Finding S1).
ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS vacation_months (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month   TEXT NOT NULL,                 -- 'YYYY-MM'
  PRIMARY KEY (user_id, month)
);
```

**Partieller Index statt `UNIQUE`-Constraint (Gate-Finding 1, kritisch).** Ein klassisches
`UNIQUE (user_id, date)` hätte eine Sackgasse erzeugt: Ein abgelehnter Dienst bleibt als
Zeile stehen (Löschen ist nur im Zustand `pending` erlaubt), und der Kollege könnte für
denselben Tag **nichts Neues** eintragen — der Constraint schlägt an, obwohl gar kein
gültiger Dienst existiert. Der partielle Index lässt beliebig viele abgelehnte Zeilen zu
und schützt trotzdem genau das, was geschützt gehört: einen gültigen Dienst pro Tag.

**`display_name` bleibt technisch NULL-bar** — SQLite kann einer bestehenden Tabelle keine
`NOT NULL`-Spalte ohne Default hinzufügen. Die Pflicht wird deshalb in der Anwendung
erzwungen: Der Migrationslauf bricht bei fehlendem Namen ab, und `/api/roster` fällt im
Notfall auf den lokalen Teil der E-Mail zurück, statt `null` auszuliefern.

### Begründungen

**`date` als reiner Kalendertag statt Zeitstempel.** Die Bestandsdaten stehen als
`2026-06-03T10:00:00.000Z` in der DB; CLAUDE.md warnt an zwei Stellen vor der
Zeitzonenfalle und schreibt den `T12:00:00`-Trick vor. Ein Datum ohne Uhrzeit macht die
Fehlerklasse gegenstandslos. Umgerechnet wird einmalig bei der Migration.

**`UNIQUE (user_id, date)` — empirisch belegt.** Prüfung der 26 Bestandsdienste
(2026-08-08, Skript gegen die Produktions-DB): **kein einziger Fall**, in dem dieselbe
Person am selben Tag zweimal auftaucht. Ein ganzer Tag ist `share = 1.0` in **einer**
Zeile, kein Bedarf für zwei Zeilen pro Person und Tag.

**Die Tagessumme wird NICHT in der Datenbank erzwungen.** Dieselbe Prüfung zeigt: kein Tag
liegt über 1,0 und keiner darunter — die vier halben Dienste bilden paarweise genau zwei
volle Tage (06.06. Günes+Cabrera, 20.06. Günes+Elsharawy). Ein Tag ist also stets
vollständig besetzt. Diese Regel gehört aber als **Auffälligkeit** in die Kontrolle des
Admins (TP4), nicht als Constraint: sonst blockiert ein abgelehnter Eintrag einen neuen.

**`users.display_name` ist Pflicht, kein Komfort.** Im Aushang steht „Alsholi", nicht
`alsholi@…`. Konten haben heute nur eine E-Mail; ohne Anzeigename gibt es keine lesbare
Tabelle.

**`vacation_months` muss mit.** Der Urlaubsmodus halbiert alle Schwellen und Abzüge
(`variants.js`). Bleibt er im alten Blob, rechnet die Bonusberechnung für die neuen Konten
falsch.

## Endpunkte

```
TP1  GET    /api/roster?month=YYYY-MM   Aushang: alle Dienste des Monats,
                                        display_name + Tag + Anteil + Status.
                                        KEINE Beträge, KEINE Urlaubsflags.
TP1  POST   /api/duties                 {date, share} → eigener Eintrag, status=pending
TP1  DELETE /api/duties/:id             nur eigener Eintrag, nur solange pending
TP1  POST   /api/duties/:id/decision    Admin: {status: approved|rejected, note?}
TP1  GET    /api/duties/pending         Admin: offene Vormerkungen
TP4  GET    /api/bonus?month=YYYY-MM    eigener Bonus; Admin zusätzlich ?user=<id>
```

`/api/bonus` ist **nicht** Teil von TP1 und steht hier nur, damit die Endpunkt-Landschaft
vollständig ist — die Bonusberechnung stellt TP4 auf freigegebene Dienste um. TP1 endet
mit einem Server, der Dienste verwaltet; gerechnet wird weiterhin im Client aus den alten
Blobs.

## Autorisierung — die Invariante wird verengt, nicht abgeschafft

Die v1.0-Invariante lautet: „Datentrennung server-erzwungen, `user_id` nur aus der
Session." Sie bleibt in Kraft, bekommt aber eine benannte, begründete Ausnahme:

1. **Schreiben:** `user_id` kommt weiterhin ausschließlich aus der Session, nie aus dem
   Client. Ein Eintrag in fremdem Namen ist strukturell unmöglich, nicht bloß verboten.
2. **Lesen:** genau ein Endpunkt (`/api/roster`) liest kontoübergreifend — und liefert
   ausdrücklich **keine Beträge und keine Urlaubsflags**. Geld bleibt hinter der alten
   Trennung.
3. **Entscheiden:** nur `is_admin`. Jede Entscheidung wird in `audit_log` geschrieben
   (Tabelle existiert), mit entscheidendem Nutzer und Zeitpunkt.

**Wer den Aushang sehen darf (Gate-Finding 2):** jedes angemeldete Konto — und zwar
deshalb, weil die Kontoliste eine vom Admin gepflegte Allowlist ist (`POST
/api/admin/users`). Ein Konto zu haben *bedeutet* in diesem System, zum Team zu gehören.
Es gibt bewusst kein zweites Rollenkonzept neben `is_admin`. Wer jemanden aufnimmt, gibt
ihm damit den Aushang frei; wer das nicht will, nimmt ihn nicht auf.

**Der Admin entscheidet auch über eigene Dienste (Gate-Finding 6).** Bei acht Personen
gibt es keinen zweiten Freigeber, und `audit_log` hält jede Entscheidung samt Entscheider
fest. Das ist eine bewusste Entscheidung, kein Versehen — wer ein Vier-Augen-Prinzip
will, braucht einen zweiten Admin, und dann fehlt die Regel „nicht über sich selbst".

**`GET /api/roster` filtert** auf `date LIKE '<month>-%'` und liefert nach Tag und Name
sortiert. Ohne `month`-Parameter antwortet er `400` statt den gesamten Bestand auszugeben.

## Migration der Bestandsdaten

**Reihenfolge, wichtig:** TP1 **baut** den Migrationslauf, **ausgeführt** wird er erst,
wenn TP2 die Konten und Anzeigenamen geliefert hat — vorher gibt es nichts, worauf man
zuordnen könnte. Der Lauf ist also Teil von TP1, sein Einsatz gehört ans Ende von TP2.

**Kein automatischer Startup-Lauf** wie bei v1.0. Die Zuordnung „Name → Konto" kennt nur
ein Mensch; ein Server darf sie nicht raten.

1. Der Admin legt je Kollege ein Konto an (`POST /api/admin/users`, existiert) und trägt
   den Anzeigenamen ein.
2. Ein **ausdrücklich angestoßener** Migrationslauf verschiebt die Dienste aus dem
   Blob des Admins auf die Konten: `share` übernommen, Status **`approved`** — Altdaten
   gelten als bereits genehmigt, sonst müsste der Admin 26 historische Dienste
   nachträglich freigeben.
3. **Der Urlaubsmodus wandert mit (Gate-Finding 4).** Das `vacation`-Dokument enthält die
   Flags pro Mitarbeiter und Monat; sie werden zu Zeilen in `vacation_months`. Ohne
   diesen Schritt rechnet TP4 für jeden migrierten Kollegen ohne Urlaubshalbierung —
   also falsch, und zwar zu seinen Ungunsten.
4. Namen ohne zugeordnetes Konto brechen den Lauf ab und werden gemeldet; es wird nichts
   halb migriert.

**Datumskonvertierung, ausbuchstabiert (Gate-Finding 9).** Die Altdaten stehen als
UTC-Zeitstempel (`2026-06-03T10:00:00.000Z`), weil die App lokale Mittagszeit erzeugt und
`toISOString()` speichert. Maßgeblich ist der **lokale Kalendertag in Europe/Berlin**,
nicht der UTC-Tag: Es wird nach Europe/Berlin umgerechnet und davon `YYYY-MM-DD`
genommen. Beim aktuellen Bestand (alle Stempel 10:00/11:00 UTC) liefern beide Wege
dasselbe Ergebnis — die Regel greift für Grenzfälle nahe Mitternacht, die entstehen
können, sobald jemand spätabends einträgt. Der Migrationslauf gibt die Zuordnung
`alt → neu` zeilenweise aus, damit die 26 Fälle einmal von Hand gegengelesen werden können.

**Rückweg:** TP1 fasst die alten Blobs nicht an. Der Lauf ist wiederholbar und
verwerfbar — `duties` leeren und erneut migrieren. Das Schema-DDL ist idempotent
(`IF NOT EXISTS`, Spaltenprüfung per `PRAGMA table_info` wie in `server/auth.js`).

## Übergangszeit: wer ist wann die Wahrheit (Gate-Finding 3 und 11)

Zwischen TP1 und TP3 existieren zwei Datenspeicher nebeneinander. Ohne klare Regel laufen
sie auseinander — der Admin trägt im alten Formular ein, während die neue Tabelle schon
Zeilen hat. Deshalb gilt ausdrücklich:

| Zeitraum | Wahrheit | Neue `duties`-Tabelle |
|---|---|---|
| TP1 und TP2 | die alten Blobs. Die bestehende Oberfläche arbeitet unverändert weiter | existiert, wird über die neuen Endpunkte befüllt und getestet, aber von **keiner** Oberfläche gelesen |
| Umstellungspunkt (Ende TP3) | einmaliger Migrationslauf, danach die Tabelle | ab jetzt alleinige Wahrheit |
| Nach der Umstellung | die Tabelle | die alten Blobs werden **eingefroren** (nicht gelöscht): `PUT /api/state` antwortet `410 Gone` |

Gelöscht werden die Blobs erst nach einer Beobachtungszeit und in einem eigenen,
ausdrücklichen Schritt — sie sind bis dahin der Rückweg, wenn die Migration etwas
verschluckt hat. Ein Doppelschreiben in beide Modelle gibt es zu keinem Zeitpunkt.

## Ausscheiden, Aufbewahrung, Löschung (Gate-Linse Sicherheit/DSGVO)

**Das Problem, das die Sicherheitslinse aufgedeckt hat:** Der bestehende Endpunkt
`DELETE /api/admin/users/:id` löscht ein Konto, und `ON DELETE CASCADE` räumt alles
Zugehörige weg. Mit Diensten als Datensätzen hätte das bedeutet: Wenn jemand das Team
verlässt und du sein Konto entfernst, **verschwinden alle seine freigegebenen Dienste** —
also die Grundlage bereits gezahlter Vergütung. Still, ohne Warnung, unwiederbringlich.
Das passiert nicht theoretisch, sondern beim ersten Personalwechsel.

Deshalb:

- `duties.user_id` verweist mit **`ON DELETE RESTRICT`** auf `users`. Ein Konto mit
  Diensten lässt sich nicht löschen — der Versuch scheitert sichtbar statt still zu wirken.
- Ausscheiden heißt **deaktivieren, nicht löschen**: `users.active = 0`. Der Kollege kann
  sich nicht mehr anmelden, erscheint nicht mehr im Aushang kommender Monate, seine
  Historie bleibt vollständig.
- Echtes Löschen (Art. 17 DSGVO) bleibt möglich, ist aber ein **eigener, bewusster
  Vorgang**: erst die Dienste archivieren oder exportieren, dann löschen. Kein Nebeneffekt
  eines Klicks in der Nutzerverwaltung.
- **Aufbewahrung:** vergütungsrelevante Daten unterliegen steuerlichen Fristen. Die Spec
  legt keine Frist fest — das ist eine Entscheidung des Betreibers, keine des Entwicklers;
  sie gehört ins Verarbeitungsverzeichnis. Festgehalten wird nur, dass es sie braucht.
- Die `history`-Tabelle (jede Vorversion eines Blobs) hört mit dem Umstellungspunkt auf zu
  wachsen, weil `PUT /api/state` dann `410` antwortet. Ihre Altbestände fallen unter
  dieselbe Aufbewahrungsentscheidung.

**Rechtsgrundlage der Team-Sichtbarkeit.** Dass jeder den vollen Plan mit Klarnamen sieht,
ist eine Verarbeitung personenbezogener Daten über die eigene Person hinaus. Sie ist
fachlich begründbar — ein Dienstplan ist ein gemeinsames Arbeitsmittel, man muss sehen,
wer wann steht — aber sie braucht eine dokumentierte Grundlage (berechtigtes Interesse,
Art. 6 Abs. 1 lit. f, oder eine Betriebsvereinbarung) und einen Eintrag im
Verarbeitungsverzeichnis. **Das ist kein Code-Thema, sondern eine Hausaufgabe für den
Betreiber** — sie steht hier, damit sie nicht vergessen wird.

**Bekannte Grenze: der Admin kann sich als jeder anmelden.** `POST /api/admin/login-link`
erzeugt einen gültigen Anmeldelink für **jedes** Konto (v1.0-Funktion, audit-geloggt als
`emergency_link`). Die strukturelle Zusage „niemand schreibt in fremdem Namen" gilt damit
auf API-Ebene, nicht gegen einen Admin, der sich als Kollege anmeldet. Das ist der Preis
für den Notzugang ohne Mailversand. Es bleibt so, wird aber hier benannt — und jede
Selbstentscheidung des Admins über eigene Dienste wird als eigenes Audit-Ereignis
(`self_decision`) geschrieben, damit sie in der Historie auffällt.

## Fehlerfälle

| Fall | Antwort |
|---|---|
| Zweiter Eintrag derselben Person am selben Tag | `409` mit klarer Meldung, kein SQL-Fehler nach außen |
| Löschen eines bereits freigegebenen Dienstes | `409` „freigegebene Dienste ändert nur der Admin" |
| Entscheidung durch Nicht-Admin | `403` |
| Fremde Dienst-ID bei Löschen/Ändern | `404` (nicht `403` — verrät nicht, ob die ID existiert) |
| `share` weder `1.0` noch `0.5`; `date` nicht als `YYYY-MM-DD` parsebar oder kein realer Kalendertag (z. B. `2026-02-30`) | `400` |
| Migration mit unzugeordnetem Namen | Abbruch mit Liste der fehlenden Zuordnungen, nichts geschrieben |

## Tests

Bordmittel wie in der bestehenden Suite (`node:test`, temporäres `DATA_DIR`, 61 Tests
grün). Neue Fälle, jeder rot vor der Umsetzung:

- Doppelter Tag → `409`; Datensatz bleibt einer
- **Nach Ablehnung wieder eintragbar**: Eintrag → `rejected` → neuer Eintrag am selben Tag
  gelingt, und beide Zeilen existieren. Der Fall, der ohne den partiellen Index eine
  Sackgasse wäre — dieser Test ist der Wächter über Gate-Finding 1
- `user_id` aus dem Request-Body wird ignoriert (Anti-IDOR, analog zum bestehenden Test)
- `/api/roster` enthält keine Beträge und keine Urlaubsflags; ohne `month` → `400`
- Nicht-Admin bekommt `403` auf `/decision`, Admin `200` und ein `audit_log`-Eintrag
- Löschen nach Freigabe → `409`, vor Freigabe → `200`
- Migration: Datumskonvertierung **inklusive eines Grenzfalls nahe Mitternacht**,
  Urlaubsflags landen in `vacation_months`, Idempotenz, Abbruch bei fehlender Zuordnung
- Schema-DDL zweimal ausgeführt → keine Fehler (Idempotenz)
- **Konto mit Diensten lässt sich nicht löschen**: `DELETE /api/admin/users/:id` scheitert
  sichtbar statt die Vergütungsgrundlage zu vernichten; Deaktivieren gelingt und die
  Dienste bleiben vollständig erhalten. Wächter über Gate-Finding S1
- Deaktiviertes Konto: keine Anmeldung mehr möglich, taucht im Aushang künftiger Monate
  nicht auf, historische Dienste bleiben sichtbar
- Urlaubsmonat halbiert die Schwellen weiterhin (Regressionsfall aus `variants.test.js`)

## Gate 1+2 (2026-08-08)

**Kritiker:** opencode `opencode/mimo-v2.5-free`, 94 s, Exit 0. Gegenstand: diese Spec,
zum Abgleich `server/db.js`, `server/index.js`, `server/auth.js`, `sync.js`, `variants.js`,
`calculator.js`, `app.js`. **12 Findings — 7 übernommen, 3 halb, 2 mit Evidenz verworfen.**

| Finding | Urteil | Evidenz / Einarbeitung |
|---|---|---|
| [KRITISCH] `UNIQUE` blockiert Wiedereintrag nach Ablehnung | **übernommen** | Echter Konstruktionsfehler: abgelehnte Zeile bleibt, Löschen nur bei `pending` → Tag dauerhaft dicht. Jetzt partieller Index `WHERE status <> 'rejected'` + eigener Testfall |
| [KRITISCH] Kein Cutover-Punkt zwischen Blob und Tabelle | **übernommen** | Neuer Abschnitt „Übergangszeit": wer wann die Wahrheit ist, kein Doppelschreiben, `410 Gone` nach der Umstellung |
| [HOCH] Urlaubsdaten werden nicht migriert | **übernommen** | Migrationsschritt 3 ergänzt — sonst rechnet TP4 ohne Urlaubshalbierung, zulasten der Kollegen |
| [HOCH] DDL nicht idempotent | **übernommen** | `IF NOT EXISTS` + Spaltenprüfung nach dem Muster aus `server/auth.js`, plus Testfall |
| [MITTEL] `display_name` NULL-bar trotz „Pflicht" | **übernommen** | SQLite kann keine `NOT NULL`-Spalte nachrüsten; Pflicht wird in der Anwendung erzwungen, Rückfall auf den lokalen Teil der E-Mail |
| [MITTEL] Zeitzonen-Regel der Konvertierung fehlt | **übernommen** | Maßgeblich ist der lokale Kalendertag in Europe/Berlin; beim Bestand identisch, die Regel greift für Grenzfälle nahe Mitternacht |
| [MITTEL] `roster`-Query nicht spezifiziert | **übernommen** | Filter, Sortierung und `400` ohne `month` festgeschrieben |
| [KRITISCH] `/api/roster` ohne Berechtigungskontrolle | **halb** | Kein Defekt, sondern die getroffene Entscheidung. Präzisiert: die Allowlist *ist* das Rechtemodell — ein Konto zu haben bedeutet, zum Team zu gehören |
| [HOCH] Admin gibt eigene Dienste frei | **halb** | Bei acht Personen gibt es keinen zweiten Freigeber; als bewusste Entscheidung dokumentiert, `audit_log` hält jede fest |
| [MITTEL] Kein Verfallsplan für Altdaten | **halb** | In den Übergangs-Abschnitt aufgenommen: einfrieren statt löschen, Löschung später als eigener Schritt |
| [HOCH] Kein `updated_at` | **verworfen** | Es gibt keine Änderungsoperation: ein `pending`-Dienst kann nur gelöscht werden, jede Entscheidung trägt `decided_at`. `created_at` + `decided_at` decken den Lebenszyklus vollständig ab |
| [MITTEL] Keine Paginierung für `/pending` | **verworfen** | Vorratsbau. Real sind es 26 Dienste in zwei Monaten; selbst ein theoretischer Vollmonat aller acht bliebe dreistellig — für SQLite und eine JSON-Antwort belanglos |

### Zweite Linse: Sicherheit und Datenschutz (2026-08-08)

Nach DEV-METHOD braucht ein Artefakt in Feature-Größe mehrere Linsen. Kritiker wie oben,
74 s, Exit 0, zusätzlich `server/audit.js` und `server/ratelimit.js` gelesen.
**8 Findings — 3 übernommen, 3 halb, 2 mit Evidenz verworfen.**

| Finding | Urteil | Evidenz / Einarbeitung |
|---|---|---|
| [KRITISCH] `ON DELETE CASCADE` löscht mit dem Konto die Vergütungsgrundlage | **übernommen** | Der schwerste Fund beider Linsen. `DELETE /api/admin/users/:id` existiert bereits; mit Diensten als Datensätzen hätte der erste Personalwechsel stillschweigend alle freigegebenen Dienste vernichtet. Jetzt `ON DELETE RESTRICT` + Deaktivieren statt Löschen, eigener Abschnitt |
| [MITTEL] Admin kann für jedes Konto einen Anmeldelink erzeugen | **übernommen** | Real: die Zusage „niemand schreibt in fremdem Namen" gilt nicht gegen einen Admin, der sich als Kollege anmeldet. Als bekannte Grenze benannt statt stillschweigend hingenommen |
| [HOCH] Verhältnismäßigkeit und Rechtsgrundlage der Team-Sicht | **übernommen** | Als Betreiber-Hausaufgabe dokumentiert: berechtigtes Interesse bzw. Betriebsvereinbarung, Eintrag ins Verarbeitungsverzeichnis. Kein Code-Thema, aber eines, das man nicht vergessen darf |
| [KRITISCH] `history` wächst unbegrenzt, kein Löschkonzept | **halb** | Das Wachstum endet von selbst am Umstellungspunkt (`PUT /api/state` → `410`). Die Aufbewahrungsfrist für Altbestände ist eine Betreiber-Entscheidung, nicht meine — als solche festgehalten |
| [HOCH] Admin genehmigt eigene Dienste ohne Gegenprobe | **halb** | Bleibt so (kein zweiter Freigeber bei acht Personen), bekommt aber ein eigenes Audit-Ereignis `self_decision`, damit es in der Historie sichtbar ist |
| [MITTEL] `history` ohne FK und ohne Löschrecht | **halb** | Deckungsgleich mit dem Punkt darüber, dort mitbehandelt |
| [HOCH] Admin-Rolle ohne 2FA, lange Sessions | **verworfen für TP1** | Bestandsverhalten aus v1.0 (`SESSION_TTL_DAYS`, `SESSION_IDLE_HOURS` in `server/auth.js`), nicht von dieser Spec eingeführt. Härtung ist eine eigene Story, kein Teil des Datenmodell-Umbaus |
| [MITTEL] `audit_log.user_id` ohne FK → Waisen nach Löschung | **verworfen** | Absichtlich ohne FK, damit das Audit eine Löschung überlebt. Mit „deaktivieren statt löschen" entfällt der Waisenfall ohnehin |

## Offene Annahmen — vor der Umsetzung zu bestätigen

1. **Verengung der Invariante** (Aushang für alle lesbar, Geld getrennt) ist tragbar.
   Falls nicht: Rückfall auf „Belegung ja, Namen nein", dann liefert `/api/roster`
   anonymisierte Belegung und nur der Admin sieht die Zuordnung.
2. **Altdaten gelten als freigegeben.** Alternative wäre `pending` — dann beginnt der
   Betrieb mit 26 offenen Vormerkungen.
3. **Ein Dienst pro Person und Tag** (`UNIQUE`). Für die Bestandsdaten belegt; falls es
   fachlich doch einen Fall gibt, fällt die Regel.
4. **Anzeigenamen** trägt der Admin ein. Alternative: der Kollege pflegt ihn selbst beim
   ersten Login.
