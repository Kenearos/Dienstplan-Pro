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
CREATE TABLE duties (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,              -- 'YYYY-MM-DD', reiner Kalendertag
  share      REAL NOT NULL,              -- 1.0 oder 0.5
  status     TEXT NOT NULL,              -- pending | approved | rejected
  note       TEXT,                       -- Begründung bei Ablehnung
  created_at TEXT NOT NULL,
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  UNIQUE (user_id, date)
);
CREATE INDEX idx_duties_date ON duties(date);

ALTER TABLE users ADD COLUMN display_name TEXT;

CREATE TABLE vacation_months (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month   TEXT NOT NULL,                 -- 'YYYY-MM'
  PRIMARY KEY (user_id, month)
);
```

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

## Migration der Bestandsdaten

**Reihenfolge, wichtig:** TP1 **baut** den Migrationslauf, **ausgeführt** wird er erst,
wenn TP2 die Konten und Anzeigenamen geliefert hat — vorher gibt es nichts, worauf man
zuordnen könnte. Der Lauf ist also Teil von TP1, sein Einsatz gehört ans Ende von TP2.

**Kein automatischer Startup-Lauf** wie bei v1.0. Die Zuordnung „Name → Konto" kennt nur
ein Mensch; ein Server darf sie nicht raten.

1. Der Admin legt je Kollege ein Konto an (`POST /api/admin/users`, existiert) und trägt
   den Anzeigenamen ein.
2. Ein **ausdrücklich angestoßener** Migrationslauf verschiebt die Dienste aus dem
   Blob des Admins auf die Konten: Datum auf `YYYY-MM-DD` gekürzt, `share` übernommen,
   Status **`approved`** — Altdaten gelten als bereits genehmigt, sonst müsste der Admin
   26 historische Dienste nachträglich freigeben.
3. Namen ohne zugeordnetes Konto brechen den Lauf ab und werden gemeldet; es wird nichts
   halb migriert.

**Rückweg:** TP1 fasst die alten Blobs nicht an. Der Lauf ist wiederholbar und
verwerfbar — `duties` leeren und erneut migrieren.

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
- `user_id` aus dem Request-Body wird ignoriert (Anti-IDOR, analog zum bestehenden Test)
- `/api/roster` enthält keine Beträge und keine Urlaubsflags
- Nicht-Admin bekommt `403` auf `/decision`, Admin `200` und ein `audit_log`-Eintrag
- Löschen nach Freigabe → `409`, vor Freigabe → `200`
- Migration: Datumskonvertierung, Idempotenz, Abbruch bei fehlender Zuordnung
- Urlaubsmonat halbiert die Schwellen weiterhin (Regressionsfall aus `variants.test.js`)

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
