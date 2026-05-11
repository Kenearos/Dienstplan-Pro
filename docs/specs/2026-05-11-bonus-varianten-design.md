# Design Spec: Bonus-Varianten (NRW Psychiatrie 2011) + Date-Stepper

- **Datum:** 2026-05-11
- **Status:** Draft
- **Autor:** Design-Phase, Dienstplan-Pro
- **Scope:** Feature "Bonus-Varianten" (V1/V2/V3 mit Auto-Selection und Urlaubsmodus) + UX-Add-on "Feature C: Date-Stepper"

---

## 1. Ziel / Problemstellung

Aktuell rechnet Dienstplan-Pro Bonuszahlungen nach einer einzigen, vereinfachten Regel (siehe `BonusCalculator.calculateMonthlyBonus` in `calculator.js`): 2 qualifizierende Tage als Schwelle, danach 2 Tage Abzug mit Freitag-Priorität. Diese Logik entspricht hier intern "Variante 3 loose".

Die NRW-Psychiatrie-Vereinbarung von 2011 kennt jedoch **drei alternative Schwellenmodelle**. Welches Modell für einen Arzt/eine Ärztin in einem konkreten Monat den höheren Bonus ergibt, hängt von der Verteilung der Dienste über Wochentage, Wochenende und Feiertage ab.

**Ziel:** Alle drei Varianten parallel berechnen und automatisch die für den Arzt **beste** auswählen. Zusätzlich: einen Urlaubsmodus einführen, der bei ≥14 Tagen Abwesenheit alle Schwellen und Abzüge halbiert.

**Nicht-Ziel** dieses Specs: Verbreiterung der Tag-Slots, Backend-Migration, Multi-User-Support, andere Bundesländer.

---

## 2. Out of Scope

- Bildbasierte Diensteingabe (OCR/Foto-Import) – separates Feature
- Server-/Cloud-Synchronisierung – bleibt clientseitig (`localStorage`)
- Andere Bundesländer als NRW – `HolidayProvider` bleibt unverändert
- Konfigurierbare Raten/Schwellen via UI – Konstanten bleiben hartkodiert
- Migrationspfad für Bestandsdaten mit historischen, abweichenden Berechnungsergebnissen – die neue Berechnung ist die aktuelle Wahrheit; alte Ergebnisse werden nicht "nachgeführt"
- Mehr als ein "Urlaubsmodus"-Toggle pro Mitarbeiter pro Monat (keine Teilurlaube)

---

## 3. Day Classification Rule (neu)

Jeder Dienst wird anhand seines Kalenderdatums **genau einem** Slot zugeordnet: `fr`, `sa`, `so` oder `weekday`.

### 3.1 Pseudo-Code

```
classify(date):
  wd = date.getDay()  // 0=So, 1=Mo, ..., 5=Fr, 6=Sa

  if wd === 5: return "fr"
  if wd === 6: return "sa"
  if wd === 0: return "so"

  // Mo-Do (wd 1..4)
  isFeiertag       = HolidayProvider.isHoliday(date)
  isTagVorFeiertag = HolidayProvider.isDayBeforeHoliday(date)

  if isFeiertag && isTagVorFeiertag: return "sa"    // Sandwich-Tag wie Samstag
  if isTagVorFeiertag:               return "fr"    // wie Freitag (Tag vor Feiertag)
  if isFeiertag:                     return "so"    // wie Sonntag (Feiertag selbst)
  return "weekday"
```

**Wichtig:** Die echten Wochentage Fr/Sa/So gewinnen **immer**, unabhängig von Feiertagsstatus. Ein Feiertag, der auf einen Samstag fällt, bleibt `sa`. Ein Feiertag, der auf einen Freitag fällt, bleibt `fr` (und ein hypothetischer Donnerstag-Feiertag davor wird zum Sandwich-`sa`, siehe Tabelle).

### 3.2 Beispiele

| Datum | Wochentag | Feiertag? | Tag-vor-Feiertag? | Slot | Begründung |
|---|---|---|---|---|---|
| Karfreitag (z. B. 2025-04-18) | Fr | ja | nein | `fr` | Fr gewinnt immer |
| Ostermontag (z. B. 2025-04-21) | Mo | ja | nein | `so` | Feiertag Mo-Do → wie Sonntag |
| Christi Himmelfahrt (z. B. 2025-05-29) | Do | ja | nein (Fr kein Feiertag) | `so` | Feiertag Mo-Do, kein Sandwich → wie Sonntag |
| Mi vor Christi Himmelfahrt (z. B. 2025-05-28) | Mi | nein | ja | `fr` | Tag vor Feiertag Mo-Do → wie Freitag |
| Tag der Dt. Einheit 2025 (2025-10-03) | Fr | ja | nein | `fr` | Fr gewinnt immer |
| Hypothetisch: Do Feiertag + Fr Feiertag | Do | ja | ja | `sa` | Sandwich-Tag → wie Samstag |
| Hypothetisch: Mo Feiertag + Di Feiertag | Mo | ja | ja | `sa` | Sandwich-Tag → wie Samstag |
| Hypothetisch: Mo Feiertag + Di Feiertag | Di | ja | nein | `so` | Folge-Feiertag → wie Sonntag |

### 3.3 Aggregations-Output

Nach Klassifikation aller Dienste eines Monats entsteht ein In-Memory-Objekt mit kumulierten **Shares** (Halbdienste zählen 0.5):

```javascript
{ fr: 2.0, sa: 1.0, so: 1.5, weekday: 3.0 }
```

Dieses Objekt heißt im Folgenden **`classified`**.

---

## 4. Variant Definitions

Alle drei Varianten nehmen denselben `classified`-Input und liefern dasselbe Result-Shape (siehe Abschnitt 7). Eingangsgrößen:

- `classified = { fr, sa, so, weekday }` (Shares, Float)
- `isVacation: boolean` – aus Urlaubsmodus

**Konstanten** (bleiben aus `BonusCalculator`):
- `RATE_NORMAL = 250` (für `weekday`)
- `RATE_WEEKEND = 450` (für `fr`, `sa`, `so`)

### 4.1 Variante 1 (V1) – "1 (Fr/So) + 3 Weekday"

- **Schwelle:** `fr + so >= 1` UND `weekday >= 3`
- **Abzug bei Erfüllung:**
  - vom `fr+so`-Pool: 1 (Friday-Priority: zuerst `fr`, dann `so`)
  - von `weekday`: 3
  - `sa` wird **nicht** abgezogen
- **Bezahlte Shares:**
  - `fr_paid = fr - fr_deduction`
  - `so_paid = so - so_deduction`
  - `sa_paid = sa` (immer voll bezahlt)
  - `weekday_paid = weekday - 3`
- **Bonus:**
  - `(fr_paid + so_paid + sa_paid) * 450 + weekday_paid * 250`

**Beispiel V1:** classified = `{ fr: 2, sa: 1, so: 0, weekday: 4 }`, `isVacation=false`.
- Schwelle: `2 + 0 = 2 >= 1` ✓ und `4 >= 3` ✓ → eligible
- Abzug: 1 vom `fr` (Fr-Prio), 3 von `weekday`
- Paid: `fr=1, sa=1, so=0, weekday=1` → `(1+1+0)*450 + 1*250 = 900 + 250 = 1150 €`

### 4.2 Variante 2 (V2) – "1 Sa + 2 Weekday"

- **Schwelle:** `sa >= 1` UND `weekday >= 2`
- **Abzug bei Erfüllung:**
  - von `sa`: 1
  - von `weekday`: 2
  - `fr` und `so` werden **nicht** abgezogen
- **Bezahlte Shares:**
  - `sa_paid = sa - 1`
  - `weekday_paid = weekday - 2`
  - `fr_paid = fr`
  - `so_paid = so`
- **Bonus:**
  - `(fr_paid + sa_paid + so_paid) * 450 + weekday_paid * 250`

**Beispiel V2:** classified = `{ fr: 1, sa: 2, so: 0, weekday: 3 }`, `isVacation=false`.
- Schwelle: `2 >= 1` ✓ und `3 >= 2` ✓ → eligible
- Abzug: 1 von `sa`, 2 von `weekday`
- Paid: `fr=1, sa=1, so=0, weekday=1` → `2*450 + 1*250 = 900 + 250 = 1150 €`

### 4.3 Variante 3 (V3 loose) – "2 qualifying Days (Pool)"

Dies entspricht der **aktuell implementierten Logik** in `BonusCalculator`.

- **Schwelle:** `fr + sa + so >= 2`
- **Abzug bei Erfüllung:**
  - aus dem Pool `fr + sa + so`: insgesamt 2, mit Priorität **`fr` → `so` → `sa`**
  - `weekday` wird **nicht** abgezogen
- **Bezahlte Shares:**
  - aus dem qualifying-Pool: jeweils Rest nach Abzug
  - `weekday_paid = weekday` (immer voll)
- **Bonus:**
  - `(fr_paid + sa_paid + so_paid) * 450 + weekday_paid * 250`

**Beispiel V3:** classified = `{ fr: 0, sa: 2, so: 0, weekday: 0 }`, `isVacation=false`.
- Schwelle: `0 + 2 + 0 = 2 >= 2` ✓ → eligible
- Abzug: `fr` leer → `so` leer → 2 von `sa`
- Paid: alle 0 → Bonus `0 €`

**Beispiel V3 mit Fr-Prio:** classified = `{ fr: 2, sa: 1, so: 1, weekday: 0 }`, `isVacation=false`.
- Schwelle: `4 >= 2` ✓ → eligible
- Abzug: 2 von `fr` (Fr-Prio erschöpft)
- Paid: `fr=0, sa=1, so=1, weekday=0` → `2*450 = 900 €`

### 4.4 Friday-Priority – formale Regel

Innerhalb eines Abzugspools wird in dieser Reihenfolge entleert, bis die Abzugsmenge erreicht ist:

| Variante | Pool | Reihenfolge |
|---|---|---|
| V1 | `fr + so` | `fr` → `so` |
| V2 | `sa` | (nur `sa`, keine Wahl) |
| V3 | `fr + sa + so` | `fr` → `so` → `sa` |

Algorithmus (generisch):

```
function deductFromPool(amounts, order, total):
  remaining = total
  result = { ...amounts }   // shallow copy
  for slot in order:
    take = min(remaining, result[slot])
    result[slot] -= take
    remaining   -= take
    if remaining <= 0: break
  return result   // paid shares per slot
```

**Hinweis:** Wegen der Eligibility-Checks (siehe oben) ist `remaining` am Ende stets `0`; sollte ein Floating-Point-Rest verbleiben (z. B. `1e-12`), wird dieser ignoriert. Für UI-Anzeige wird auf 2 Nachkommastellen gerundet.

### 4.5 No-Bonus-Case

Wenn eine Variante ihre Schwelle nicht erreicht:

```javascript
{
  variantId: <id>,
  eligible: false,
  threshold: null,
  deduction: null,
  paidShares: { fr: 0, sa: 0, so: 0, weekday: 0 },
  bonus: 0,
  isWinner: false  // wird ggf. später noch true gesetzt (siehe 5)
}
```

Wenn **keine** Variante triggert, ist `totalBonus = 0 €` (wie heute).

---

## 5. Variant Selection & Tie-Breaker

```
function pickWinner(results):
  // results = [r1, r2, r3] (immer 3 Einträge, auch nicht-eligible)
  let winner = results[0]
  for r in results[1..]:
    if r.bonus > winner.bonus: winner = r
    // Tie-Breaker: niedrigere variantId gewinnt → kein Update bei gleichem Bonus
  winner.isWinner = true
  return { winner, allResults: results, totalBonus: winner.bonus }
```

- Sieger = Variante mit dem höchsten `bonus`.
- **Tie-Breaker:** Bei Gleichstand gewinnt die niedrigere `variantId` (V1 < V2 < V3).
- Wenn alle drei `bonus === 0`: V1 ist nominell Winner (`isWinner=true` auf V1), aber `totalBonus = 0 €` und die UI zeigt "Keine Variante triggert".

---

## 6. Vacation Mode ("Urlaubsmodus")

### 6.1 Trigger

- Pro Mitarbeiter pro Monat: ein Boolean-Flag.
- UI-Label: **"Urlaub gehabt (≥14 Tage frei)"**
  - Fachliche Begründung: 10 Werktage Urlaub + zwei Wochenenden ≈ 14 Kalendertage Abwesenheit.

### 6.2 Effekt

**Alle** Schwellen **und** Abzüge der drei Varianten werden halbiert. Halbe Werte sind explizit erlaubt:

| | Normal | Urlaubsmodus |
|---|---|---|
| V1-Schwelle | `fr+so >= 1` ∧ `weekday >= 3` | `fr+so >= 0.5` ∧ `weekday >= 1.5` |
| V1-Abzug | 1 von `fr+so`, 3 von `weekday` | 0.5 von `fr+so`, 1.5 von `weekday` |
| V2-Schwelle | `sa >= 1` ∧ `weekday >= 2` | `sa >= 0.5` ∧ `weekday >= 1` |
| V2-Abzug | 1 von `sa`, 2 von `weekday` | 0.5 von `sa`, 1 von `weekday` |
| V3-Schwelle | `fr+sa+so >= 2` | `fr+sa+so >= 1` |
| V3-Abzug | 2 aus Pool | 1 aus Pool |

Raten bleiben unverändert (250 / 450).

### 6.3 Persistenz

Neuer `localStorage`-Key: **`dienstplan_vacation`**.

```javascript
{
  "Max Mustermann": {
    "2025-11": true,
    "2025-12": false
  },
  "Anna Schmidt": {
    "2025-11": true
  }
}
```

- Fehlender Eintrag → `false`.
- Toggle in der UI schreibt sofort durch (kein "Speichern"-Button).

---

## 7. Data Model

### 7.1 In-Memory während Berechnung

```javascript
// Klassifizierte Shares pro Slot
const classified = { fr: 2.0, sa: 1.0, so: 1.5, weekday: 3.0 };

// Result einer Variante
const variantResult = {
  variantId: 1,                                          // 1 | 2 | 3
  eligible: true,                                        // Schwelle erfüllt?
  threshold: { frSo: 1, weekday: 3 } /* o. ä. */ ,        // halbiert wenn Urlaub
  deduction: { fr: 1, so: 0, sa: 0, weekday: 3 },         // tatsächlich abgezogen
  paidShares: { fr: 1.0, sa: 1.0, so: 1.5, weekday: 0 },  // nach Abzug
  bonus: 1825,                                            // 0 wenn not eligible
  isWinner: true
};

// Gesamt-Output von BonusCalculator
const finalResult = {
  winner: variantResult,           // Referenz auf das gewinnende variantResult
  allResults: [v1Result, v2Result, v3Result],
  totalBonus: 1825,
  // Plus die Felder, die die UI/Reports heute schon erwarten:
  classified,
  isVacation: false,
  dutyDetails: [/* unverändert wie heute */]
};
```

**Threshold-Shape pro Variante** (für `threshold`-Feld):

| Variante | Shape |
|---|---|
| V1 | `{ frSo: 1, weekday: 3 }` (im Urlaub `0.5` / `1.5`) |
| V2 | `{ sa: 1, weekday: 2 }` (im Urlaub `0.5` / `1` ) |
| V3 | `{ pool: 2 }` (im Urlaub `1`) |

**Deduction-Shape pro Variante** (immer 4 Felder, nicht genutzte = 0):

```javascript
{ fr: <num>, sa: <num>, so: <num>, weekday: <num> }
```

### 7.2 Persistenz

| Key | Verwendung | Status |
|---|---|---|
| `dienstplan_employees` | Mitarbeiterliste | **unverändert** |
| `dienstplan_duties` | Dienste pro MA pro Monat | **unverändert** |
| `dienstplan_vacation` | Urlaubsflag pro MA pro Monat | **NEU** |

Kein Migrationsschritt nötig – beim ersten Lesen liefert ein fehlender Key `{}`/`false`.

---

## 8. Architecture & File Changes

### 8.1 Übersicht

| Datei | Änderung |
|---|---|
| `calculator.js` | Refactor: `BonusCalculator` bleibt als öffentliche API, ruft intern `variants.js` auf und wählt Sieger |
| `variants.js` | **NEU** – enthält `classifyDuties(duties, holidayProvider)` und `variant1/2/3(classified, isVacation)` |
| `storage.js` | **+** `setVacationMode(name, yearMonth, bool)` und `getVacationMode(name, yearMonth)`, neuer Key `dienstplan_vacation` |
| `app.js` | UI-Logik: Urlaubs-Checkbox pro MA, Result-Card mit Sieger + `<details>` für alle Varianten, Date-Stepper |
| `index.html` | Markup-Ergänzungen + Script-Reihenfolge |
| `styles.css` | Variant-Badges, Stepper-Buttons, `<details>` |
| `test-suite.js` | Neue Test-Kategorien (siehe Abschnitt 11) |

### 8.2 Script-Load-Reihenfolge in `index.html`

```
holidays.js → variants.js → calculator.js → storage.js → app.js
```

`variants.js` **muss vor** `calculator.js` geladen werden, da `BonusCalculator` die Variant-Funktionen aufruft.

### 8.3 `variants.js` – Public API

```javascript
// classifyDuties: gruppiert Dienste in Slots, summiert Shares
//   duties = [{ date: Date, share: number }, ...]
//   holidayProvider = instance von HolidayProvider
//   returns { fr, sa, so, weekday }
function classifyDuties(duties, holidayProvider) { ... }

// variant1/2/3: berechnen eine Variante
//   classified = { fr, sa, so, weekday }
//   isVacation = boolean
//   returns variantResult (siehe 7.1)
function variant1(classified, isVacation) { ... }
function variant2(classified, isVacation) { ... }
function variant3(classified, isVacation) { ... }

window.classifyDuties = classifyDuties;
window.variant1 = variant1;
window.variant2 = variant2;
window.variant3 = variant3;
```

### 8.4 `calculator.js` – neue interne Struktur

```javascript
class BonusCalculator {
  constructor(holidayProvider) {
    this.holidayProvider = holidayProvider;
    this.RATE_NORMAL = 250;
    this.RATE_WEEKEND = 450;
  }

  calculateMonthlyBonus(duties, isVacation = false) {
    if (!duties || duties.length === 0) return this.getEmptyResult();

    const classified = classifyDuties(duties, this.holidayProvider);
    const v1 = variant1(classified, isVacation);
    const v2 = variant2(classified, isVacation);
    const v3 = variant3(classified, isVacation);

    const results = [v1, v2, v3];
    let winner = results[0];
    for (let i = 1; i < results.length; i++) {
      if (results[i].bonus > winner.bonus) winner = results[i];
    }
    winner.isWinner = true;

    return {
      classified,
      isVacation,
      winner,
      allResults: results,
      totalBonus: winner.bonus,
      dutyDetails: this.buildDutyDetails(duties)  // wie bisher
    };
  }

  // calculateAllEmployees: zusätzlicher Parameter vacationMap : { [name]: boolean }
  calculateAllEmployees(employeeDuties, vacationMap = {}) { ... }

  // Helfer wie getDayTypeLabel, formatCurrency, getEmptyResult bleiben
}
```

**Bestehende Felder im Result, die durch den Umbau wegfallen** (heute: `qualifyingDaysFriday`, `qualifyingDaysOther`, `thresholdReached`, `bonusNormalDays` etc.): Die UI muss auf das neue Shape (`winner.*`, `allResults`) umgestellt werden. Da `app.js` ohnehin angefasst wird, ist das Teil dieses PRs und es entsteht **kein** Parallelpfad.

### 8.5 `storage.js` – Erweiterung

```javascript
class DataStorage {
  constructor() {
    this.STORAGE_KEY_EMPLOYEES = 'dienstplan_employees';
    this.STORAGE_KEY_DUTIES    = 'dienstplan_duties';
    this.STORAGE_KEY_VACATION  = 'dienstplan_vacation';   // NEU
  }

  // ---- bestehende Methoden unverändert ----

  getVacationMode(employeeName, yearMonth) {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY_VACATION);
      if (!raw) return false;
      const map = JSON.parse(raw);
      return Boolean(map?.[employeeName]?.[yearMonth]);
    } catch (e) {
      console.error('Fehler beim Laden des Urlaubsmodus:', e);
      return false;
    }
  }

  setVacationMode(employeeName, yearMonth, value) {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY_VACATION);
      const map = raw ? JSON.parse(raw) : {};
      if (!map[employeeName]) map[employeeName] = {};
      map[employeeName][yearMonth] = Boolean(value);
      localStorage.setItem(this.STORAGE_KEY_VACATION, JSON.stringify(map));
    } catch (e) {
      console.error('Fehler beim Speichern des Urlaubsmodus:', e);
      throw e;
    }
  }

  // exportData / importData: dienstplan_vacation in JSON aufnehmen.
  // clearAll: dienstplan_vacation ebenfalls entfernen.
}
```

`exportData()` und `importData()` werden um den Vacation-Key erweitert. `clearAll()` löscht ihn mit. Fehlt der Key im Import-JSON: kein Fehler, Standard ist `false`.

---

## 9. UI Changes

### 9.1 Tab "Berechnung"

- Pro Mitarbeiter eine **Urlaubs-Checkbox** direkt neben dem Namen:

  ```html
  <label class="vacation-toggle">
    <input type="checkbox" id="vacation-{employeeId}-{yearMonth}">
    Urlaub gehabt (≥14 Tage frei)
  </label>
  ```

  Bei Toggle: sofort `storage.setVacationMode(name, ym, checked)` aufrufen und Berechnung neu rendern.

- **Result-Card pro Mitarbeiter:**
  - Prominenter Header: **"Variante {1|2|3} → {bonus} €"** mit Stern-Badge ⭐
  - Klappbares `<details>`-Element mit Label **"Alle Varianten anzeigen"**:
    - Pro Variante eine Zeile / kleines Sub-Panel mit:
      - Variantennummer und Kurzbeschreibung
      - Schwelle (Soll-Wert, halbiert bei Urlaub)
      - Eligibility-Check (✓ / ✗)
      - Abzug pro Slot
      - Paid Shares pro Slot
      - Berechneter Bonus
      - ⭐ neben dem Sieger
  - Wenn `isVacation === true`: dezenter Hinweisbadge "Urlaubsmodus aktiv – Schwellen halbiert".

### 9.2 Tab "Einstellungen"

Info-Box mit den Berechnungsregeln aktualisieren:

- Beschreibung aller drei Varianten (V1/V2/V3) inkl. Schwellen und Abzügen
- Hinweis auf Auto-Selection ("die Variante mit dem höchsten Bonus gewinnt; bei Gleichstand gewinnt die niedrigste Variante")
- Erklärung Urlaubsmodus (Auslöser ≥14 Tage frei, Effekt Halbierung)
- Tabelle der Day-Classification-Regeln (mind. die 5 echten Beispiele aus 3.2)

### 9.3 Toast-Verhalten

Beim Toggle der Urlaubs-Checkbox: kein Toast (zu häufig). Bei Fehler beim Schreiben: `app.showToast('Urlaubsmodus konnte nicht gespeichert werden', 'error')`.

---

## 10. Feature C – Date-Stepper (UX-Add-on)

### 10.1 Ziel

Schnelleres Eintragen aufeinanderfolgender Dienste im Tab **"Dienste eintragen"** ohne den nativen Datepicker zu öffnen.

### 10.2 Verhalten

- Zwei Buttons **`‹`** und **`›`** direkt neben dem Datums-Input.
- `‹` → setzt Datum auf vorherigen Tag.
- `›` → setzt Datum auf nächsten Tag.
- **Clamp:** Datum darf den **aktuell ausgewählten Monat** (aus dem Monatsauswahl-Dropdown des Tabs) nicht verlassen.
  - Ist das Datum bereits der 1. des Monats: `‹` ist disabled.
  - Ist das Datum bereits der letzte Tag des Monats: `›` ist disabled.
- Initialer State der Buttons wird beim Tab-Wechsel und beim Monatswechsel aktualisiert.

### 10.3 Implementation Notes

- Reine `app.js`-Änderung; keine Anpassung in `calculator.js` oder `storage.js`.
- Berechnung des letzten Tages des Monats: `new Date(year, month, 0).getDate()` (mit `month` 1-basiert).
- Datumsobjekt analog zur bestehenden Konvention mit `T12:00:00` setzen, um Timezone-Edge-Cases zu vermeiden.

---

## 11. Backwards Compatibility

- **Storage-Keys:** `dienstplan_employees` und `dienstplan_duties` bleiben in Shape und Inhalt **unverändert**. Nur `dienstplan_vacation` kommt hinzu (keine Migration nötig).
- **Berechnungslogik:** Die alte Single-Path-Logik wird **ersetzt**, nicht parallel geführt. V3 loose entspricht funktional der bisherigen Berechnung, daher bleiben für die überwiegende Mehrheit der historischen Eingaben die Ergebnisse identisch (V3 ist in diesen Fällen der Winner).
- **Mögliche Unterschiede zu vorher:** Wenn V1 oder V2 in einem historischen Monat einen höheren Bonus liefern würden als V3, wird ab sofort dieser höhere Bonus angezeigt. Das ist gewünscht.
- **Export/Import:** Alte Backup-JSONs ohne `dienstplan_vacation` werden weiter akzeptiert; der Modus startet dann auf `false`.
- **PWA-Cache:** `sw.js` muss bei Release die Cache-Version inkrementieren, damit `variants.js` und die neuen Assets ausgeliefert werden.

---

## 12. Test Plan (nur Kategorien, keine Implementierung)

Neue Tests in `test-suite.js`. Keine Code-Implementierung in diesem Spec.

### 12.1 `classifyDuties` / `classify(date)`

Abdeckung aller 7 Fälle aus Abschnitt 3.2:

1. Fr-Feiertag → `fr`
2. Mo-Feiertag (Ostermontag) → `so`
3. Do-Feiertag ohne Fr-Feiertag → `so`
4. Mi vor Do-Feiertag → `fr`
5. Tag der Deutschen Einheit 2025 (Fr) → `fr`
6. Hypothetisch: Do = Feiertag UND Fr = Feiertag → Do = `sa` (Sandwich), Fr = `fr`
7. Hypothetisch: Mo = Feiertag UND Di = Feiertag → Mo = `sa`, Di = `so`

Plus:
- Halbschicht (0.5) auf einen `fr` zählt korrekt mit `+0.5` im Slot.
- Mehrere Dienste pro Slot summieren.
- Leeres Duty-Array → `{ fr:0, sa:0, so:0, weekday:0 }`.

### 12.2 `variant1`

- Eligible / nicht eligible (Schwellen jeweils gerade über/unter Grenze).
- Mit und ohne Urlaubsmodus (Halbierung).
- Friday-Priority im `fr+so`-Pool (zuerst `fr`, dann `so`).
- Edge: nur `fr` vorhanden, ausreichend, `weekday=3` → triggert.
- Edge: nur `so` vorhanden, `weekday=3` → triggert (1 von `so` abgezogen).

### 12.3 `variant2`

- Eligible / nicht eligible.
- Mit und ohne Urlaubsmodus.
- Edge: `sa=1, weekday=2` → triggert, alles wird abgezogen, Bonus = 0.
- Edge: `sa=2, weekday=2, fr=1, so=1` → triggert, `fr`/`so` voll bezahlt.

### 12.4 `variant3` (loose)

- Loose Trigger: `sa=2` allein reicht.
- Friday-Priority im Pool (`fr` zuerst, dann `so`, dann `sa`).
- Mit und ohne Urlaubsmodus (Schwelle 1 statt 2).
- Verhalten identisch zu heutigem `BonusCalculator` für eine Stichprobe historischer Inputs.

### 12.5 Winner Selection

- Klarer Winner V1 (z. B. classified begünstigt `weekday`-haltige Variante).
- Klarer Winner V2.
- Klarer Winner V3.
- Tie V1=V2: V1 gewinnt.
- Tie V2=V3: V2 gewinnt.
- Tie V1=V2=V3 (alle 0 €): V1 ist nominell Winner, `totalBonus=0`.
- Eine Variante eligible, die anderen nicht → eligible gewinnt unabhängig vom Bonus-Wert (da nicht-eligible Bonus = 0).

### 12.6 Vacation Mode (kombiniert)

- V1 mit Urlaubsmodus: Schwelle `fr+so>=0.5`, `weekday>=1.5`, Abzüge halbiert.
- V3 mit Urlaubsmodus: `fr+sa+so>=1` triggert bereits mit einer Halbschicht auf `sa`.
- Toggle in Storage: `setVacationMode` → `getVacationMode` round-trip.
- Storage: fehlender Key → `false`; ungültiges JSON → `false` (kein Throw nach außen).

### 12.7 Bestehende Tests

- Tests, die heute "Variante 3"-Verhalten prüfen, sollten überwiegend grün bleiben, weil V3 loose = aktuelle Logik.
- Anzupassen: alle Tests, die auf Felder wie `qualifyingDaysFriday`/`thresholdReached`/`bonusNormalDays` zugreifen – diese sind im neuen Result-Shape nicht mehr Top-Level, sondern unter `winner.deduction` / `winner.paidShares` / `winner.eligible`.

### 12.8 Feature C – Date-Stepper

- `‹` am Monatsanfang ist disabled, ändert das Datum nicht.
- `›` am Monatsende ist disabled, ändert das Datum nicht.
- `‹` / `›` in der Monatsmitte ändern um genau ±1 Tag.
- Monatswechsel im Dropdown setzt Datum auf 1. des neuen Monats und aktualisiert Buttons-State.

---

## 13. Open Questions

Keine blockierenden offenen Punkte. Minor, zur Klärung in der Implementierungsphase:

- Soll der Urlaubsmodus-Status in der CSV/HTML-Exportausgabe sichtbar vermerkt werden? (Vorschlag: ja, als Zusatzspalte / Hinweis im Header.)
- Soll im Tab "Berechnung" eine Gesamt-Summe aller Mitarbeiter über alle Sieger-Varianten weiterhin angezeigt werden? (Vorschlag: ja, wie heute.)
- PWA-Cache-Version-Bump: separate Mini-Task im selben PR (Bumping `dienstplan-pro-v1` → `v2`).
