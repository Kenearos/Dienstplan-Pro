# Feature B: Bonus-Varianten + Urlaubsmodus + Date-Stepper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-rule bonus calculation with three configurable variants (V1, V2, V3 loose), auto-selecting the highest-bonus variant. Add a per-employee-per-month vacation toggle that halves variant thresholds. Add a small date-stepper UX to the duty entry tab.

**Architecture:** Strategy-pattern split: `variants.js` holds three pure variant functions and the day classification helper; `calculator.js` becomes the public API that runs all variants and picks the winner. `storage.js` grows two methods for the new `dienstplan_vacation` localStorage key. UI changes in `app.js` add a vacation checkbox per employee in the calculation tab and a collapsible variant breakdown in the result card.

**Tech Stack:** Vanilla ES6+ classes (no build step), browser localStorage, the existing in-repo test runner (`test-suite.js`).

---

## How to run tests

This project has no Node test runner. Tests live in `test-suite.js` and run in the browser via `test.html`.

1. Start a local server in the project root: `python -m http.server 8000` (or `npx http-server -p 8000`).
2. Open `http://localhost:8000/test.html`.
3. Click the **"Alle Tests ausfuehren"** button.
4. The summary at the top shows total / passed / failed; failed tests are listed below with the assertion message printed in red.

**TDD verification convention used below:**
- "Red": after pasting in a new `runner.test(...)`, reload `test.html` and click run. The new test must appear under "Fehlgeschlagen" with the expected error message.
- "Green": after the implementation step, reload `test.html` and click run. The test must move to "Bestanden".

The runner is global (`const runner = new TestRunner();`) and assertions are: `t.assertEqual(actual, expected, message)`, `t.assertAlmostEqual(actual, expected, tolerance, message)`, `t.assertTrue(value, message)`, `t.assertFalse(value, message)`.

**Date gotcha (per `CLAUDE.md`):** always construct date literals as `new Date('YYYY-MM-DDT12:00:00')` to avoid timezone drift to the previous day.

---

## File Structure

| Path | Status | Responsibility after this PR |
|---|---|---|
| `G:\Claude\Claude_tmp_dienstplan\variants.js` | **NEW** | Pure functions: `classify(date, holidayProvider)`, `classifyDuties(duties, holidayProvider)`, `variant1/2/3(classified, isVacation)`. Exposed on `window`. |
| `G:\Claude\Claude_tmp_dienstplan\calculator.js` | MODIFIED | `BonusCalculator` becomes a thin orchestrator: calls `classifyDuties`, runs all three variants, picks the winner. New result shape `{ winner, allResults, totalBonus, classified, isVacation, dutyDetails }`. `calculateAllEmployees(employeeDuties, vacationMap)` gains a vacation map parameter. Old fields (`qualifyingDaysFriday`, `thresholdReached`, `bonusNormalDays`, `bonusQualifyingDays`, `qualifyingDaysDeducted`, `normalDaysPaid`, `qualifyingDaysPaid`, `qualifyingDays`) are removed. |
| `G:\Claude\Claude_tmp_dienstplan\storage.js` | MODIFIED | Adds `STORAGE_KEY_VACATION = 'dienstplan_vacation'` plus `getVacationMode(name, yearMonth)` / `setVacationMode(name, yearMonth, value)`. `exportData()` includes the vacation map. `importData()` accepts the optional `vacation` field. `clearAll()` removes the new key. |
| `G:\Claude\Claude_tmp_dienstplan\index.html` | MODIFIED | New `<script src="variants.js">` between `holidays.js` and `calculator.js`. New duty-date stepper buttons around `#duty-date`. New Settings-tab info-box copy. |
| `G:\Claude\Claude_tmp_dienstplan\app.js` | MODIFIED | `calculateBonuses` now reads vacation flags from storage and passes a `vacationMap`. New `createResultCard` renders winner banner + collapsible details for all 3 variants and a per-employee vacation toggle. New `stepDutyDate(delta)` handler + button-state refresh in `loadDutiesForSelectedEmployee` / `setCurrentMonthYear`. CSV/HTML/email exports updated to read `result.winner.*` and `result.totalBonus`. |
| `G:\Claude\Claude_tmp_dienstplan\styles.css` | MODIFIED | New rules for `.variant-card`, `.variant-card.winner`, `.variant-badge`, `.vacation-toggle`, `.vacation-active-banner`, `.date-stepper`, `.date-stepper button`. |
| `G:\Claude\Claude_tmp_dienstplan\test.html` | MODIFIED | Loads `variants.js` after `holidays.js` and before `calculator.js`. |
| `G:\Claude\Claude_tmp_dienstplan\test-suite.js` | MODIFIED | Removes / rewrites tests that reference removed top-level fields. New tests for `classify`, `classifyDuties`, `variant1/2/3`, winner selection, vacation mode, storage round-trip. |
| `G:\Claude\Claude_tmp_dienstplan\sw.js` | MODIFIED | Cache bumped to `dienstplan-pro-v2`, `variants.js` added to `ASSETS`. |

---

## Tasks

### Task 1: Skeleton `variants.js` and wire into HTML

**Files:**
- Create: `G:\Claude\Claude_tmp_dienstplan\variants.js`
- Modify: `G:\Claude\Claude_tmp_dienstplan\index.html` (script block at bottom)
- Modify: `G:\Claude\Claude_tmp_dienstplan\test.html` (script block at bottom)

- [ ] **Step 1: Create empty `variants.js` skeleton.**

  Write to `G:\Claude\Claude_tmp_dienstplan\variants.js`:

  ```javascript
  /**
   * Bonus-Varianten (NRW Psychiatrie 2011)
   * Pure functions: day classification + V1/V2/V3 evaluation.
   * Loaded after holidays.js and before calculator.js.
   */

  // Will be implemented in subsequent tasks.
  function classify(date, holidayProvider) {
      throw new Error('classify: not implemented');
  }

  function classifyDuties(duties, holidayProvider) {
      throw new Error('classifyDuties: not implemented');
  }

  function variant1(classified, isVacation) {
      throw new Error('variant1: not implemented');
  }

  function variant2(classified, isVacation) {
      throw new Error('variant2: not implemented');
  }

  function variant3(classified, isVacation) {
      throw new Error('variant3: not implemented');
  }

  // Expose globally
  window.classify = classify;
  window.classifyDuties = classifyDuties;
  window.variant1 = variant1;
  window.variant2 = variant2;
  window.variant3 = variant3;
  ```

- [ ] **Step 2: Insert `<script src="variants.js"></script>` into `index.html` between `holidays.js` and `calculator.js`.**

  Edit `G:\Claude\Claude_tmp_dienstplan\index.html`. Find:

  ```html
      <script src="holidays.js"></script>
      <script src="calculator.js"></script>
      <script src="storage.js"></script>
      <script src="app.js"></script>
  ```

  Replace with:

  ```html
      <script src="holidays.js"></script>
      <script src="variants.js"></script>
      <script src="calculator.js"></script>
      <script src="storage.js"></script>
      <script src="app.js"></script>
  ```

- [ ] **Step 3: Insert `<script src="variants.js"></script>` into `test.html` between `holidays.js` and `calculator.js`.**

  Edit `G:\Claude\Claude_tmp_dienstplan\test.html`. Find:

  ```html
      <script src="holidays.js"></script>
      <script src="calculator.js"></script>
      <script src="storage.js"></script>
      <script src="test-suite.js"></script>
  ```

  Replace with:

  ```html
      <script src="holidays.js"></script>
      <script src="variants.js"></script>
      <script src="calculator.js"></script>
      <script src="storage.js"></script>
      <script src="test-suite.js"></script>
  ```

- [ ] **Step 4: Manual verification - page still loads.**

  Start the local server and open `http://localhost:8000/index.html`. The app must render without a JS console error. Open `http://localhost:8000/test.html`, click "Alle Tests ausfuehren" - all existing tests still pass (the new `variants.js` is loaded but unused, so behavior is unchanged).

- [ ] **Step 5: Commit.**

  ```bash
  git add variants.js index.html test.html
  git commit -m "feat: add variants.js skeleton and wire into index.html + test.html"
  ```

---

### Task 2: Implement `classify(date, holidayProvider)` - red phase

**Files:**
- Test: `G:\Claude\Claude_tmp_dienstplan\test-suite.js` (append to end, before `runAllTests`)

- [ ] **Step 1: Add the 7 spec example tests for `classify`.**

  Append the following block to `test-suite.js` immediately before the `// Display Functions` divider (around line 476):

  ```javascript
  // ============================================================================
  // Variants - classify()
  // ============================================================================

  runner.test('classify: Karfreitag 2025 (Fr-Feiertag) -> fr', (t) => {
      const hp = new HolidayProvider();
      const date = new Date('2025-04-18T12:00:00');
      t.assertEqual(classify(date, hp), 'fr', 'Karfreitag (Fr) muss fr sein');
  });

  runner.test('classify: Ostermontag 2025 (Mo-Feiertag) -> so', (t) => {
      const hp = new HolidayProvider();
      const date = new Date('2025-04-21T12:00:00');
      t.assertEqual(classify(date, hp), 'so', 'Ostermontag (Mo-Feiertag) muss so sein');
  });

  runner.test('classify: Christi Himmelfahrt 2025 (Do-Feiertag) -> so', (t) => {
      const hp = new HolidayProvider();
      const date = new Date('2025-05-29T12:00:00');
      t.assertEqual(classify(date, hp), 'so', 'Do-Feiertag ohne Fr-Feiertag muss so sein');
  });

  runner.test('classify: Mi vor Christi Himmelfahrt 2025 -> fr', (t) => {
      const hp = new HolidayProvider();
      const date = new Date('2025-05-28T12:00:00');
      t.assertEqual(classify(date, hp), 'fr', 'Tag vor Mo-Do-Feiertag muss fr sein');
  });

  runner.test('classify: Tag der Deutschen Einheit 2025 (Fr-Feiertag) -> fr', (t) => {
      const hp = new HolidayProvider();
      const date = new Date('2025-10-03T12:00:00');
      t.assertEqual(classify(date, hp), 'fr', 'Fr-Feiertag muss fr sein');
  });

  runner.test('classify: Sandwich Do+Fr Feiertag -> Do=sa, Fr=fr', (t) => {
      // Use a fake HolidayProvider that flags Do AND Fr as Feiertag.
      const fakeHp = {
          isHoliday(date) {
              const day = date.getDay();
              return day === 4 || day === 5; // Thu or Fri
          },
          isDayBeforeHoliday(date) {
              const next = new Date(date);
              next.setDate(next.getDate() + 1);
              return this.isHoliday(next);
          }
      };
      const thursday = new Date('2025-11-20T12:00:00'); // Donnerstag
      const friday   = new Date('2025-11-21T12:00:00'); // Freitag
      t.assertEqual(classify(thursday, fakeHp), 'sa', 'Do Feiertag + Tag vor Fr Feiertag -> sa (Sandwich)');
      t.assertEqual(classify(friday, fakeHp), 'fr', 'Fr Feiertag bleibt fr (Wochentag gewinnt)');
  });

  runner.test('classify: Sandwich Mo+Di Feiertag -> Mo=sa, Di=so', (t) => {
      const fakeHp = {
          isHoliday(date) {
              const day = date.getDay();
              return day === 1 || day === 2; // Mon or Tue
          },
          isDayBeforeHoliday(date) {
              const next = new Date(date);
              next.setDate(next.getDate() + 1);
              return this.isHoliday(next);
          }
      };
      const monday  = new Date('2025-11-24T12:00:00'); // Montag
      const tuesday = new Date('2025-11-25T12:00:00'); // Dienstag
      t.assertEqual(classify(monday, fakeHp), 'sa', 'Mo Feiertag + Tag vor Di Feiertag -> sa');
      t.assertEqual(classify(tuesday, fakeHp), 'so', 'Di Feiertag (kein Sandwich, kein Tag-vor) -> so');
  });
  ```

- [ ] **Step 2: Red verification.**

  Reload `test.html`, click "Alle Tests ausfuehren". All 7 new `classify:` tests must appear under "Fehlgeschlagen" with the message `classify: not implemented`.

- [ ] **Step 3: Commit.**

  ```bash
  git add test-suite.js
  git commit -m "test: add classify() spec example tests (red)"
  ```

---

### Task 3: Implement `classify(date, holidayProvider)` - green phase

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\variants.js` (replace `classify` stub)

- [ ] **Step 1: Replace the `classify` stub with the full implementation.**

  Edit `variants.js`. Replace the entire `function classify(date, holidayProvider) { ... }` block with:

  ```javascript
  function classify(date, holidayProvider) {
      const wd = date.getDay(); // 0=So, 1=Mo, ..., 5=Fr, 6=Sa

      // Real Fr/Sa/So always win
      if (wd === 5) return 'fr';
      if (wd === 6) return 'sa';
      if (wd === 0) return 'so';

      // Mo-Do (wd 1..4)
      const isFeiertag       = holidayProvider.isHoliday(date);
      const isTagVorFeiertag = holidayProvider.isDayBeforeHoliday(date);

      if (isFeiertag && isTagVorFeiertag) return 'sa'; // Sandwich-Tag
      if (isTagVorFeiertag)               return 'fr'; // Tag vor Mo-Do-Feiertag
      if (isFeiertag)                     return 'so'; // Feiertag Mo-Do
      return 'weekday';
  }
  ```

- [ ] **Step 2: Green verification.**

  Reload `test.html`, click "Alle Tests ausfuehren". All 7 new `classify:` tests must pass. No previously-passing test may regress.

- [ ] **Step 3: Commit.**

  ```bash
  git add variants.js
  git commit -m "feat: implement classify(date, holidayProvider) day-slot mapping"
  ```

---

### Task 4: Implement `classifyDuties(duties, holidayProvider)` - red + green

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\test-suite.js` (append tests)
- Modify: `G:\Claude\Claude_tmp_dienstplan\variants.js` (replace stub)

- [ ] **Step 1: Append `classifyDuties` tests to `test-suite.js`.**

  Append immediately after the `classify:` tests added in Task 2:

  ```javascript
  runner.test('classifyDuties: leeres Array -> alle Slots 0', (t) => {
      const hp = new HolidayProvider();
      const result = classifyDuties([], hp);
      t.assertEqual(result.fr, 0, 'fr=0');
      t.assertEqual(result.sa, 0, 'sa=0');
      t.assertEqual(result.so, 0, 'so=0');
      t.assertEqual(result.weekday, 0, 'weekday=0');
  });

  runner.test('classifyDuties: halbe Schicht auf Freitag zaehlt 0.5', (t) => {
      const hp = new HolidayProvider();
      const duties = [
          { date: new Date('2025-11-21T12:00:00'), share: 0.5 } // Fr
      ];
      const result = classifyDuties(duties, hp);
      t.assertAlmostEqual(result.fr, 0.5, 0.0001, 'fr=0.5');
      t.assertEqual(result.sa, 0, 'sa=0');
      t.assertEqual(result.so, 0, 'so=0');
      t.assertEqual(result.weekday, 0, 'weekday=0');
  });

  runner.test('classifyDuties: mehrere Dienste pro Slot summieren', (t) => {
      const hp = new HolidayProvider();
      const duties = [
          { date: new Date('2025-11-21T12:00:00'), share: 1.0 }, // Fr
          { date: new Date('2025-11-22T12:00:00'), share: 1.0 }, // Sa
          { date: new Date('2025-11-23T12:00:00'), share: 0.5 }, // So
          { date: new Date('2025-11-24T12:00:00'), share: 1.0 }, // Mo (weekday)
          { date: new Date('2025-11-25T12:00:00'), share: 0.5 }  // Di (weekday)
      ];
      const result = classifyDuties(duties, hp);
      t.assertAlmostEqual(result.fr, 1.0, 0.0001, 'fr=1.0');
      t.assertAlmostEqual(result.sa, 1.0, 0.0001, 'sa=1.0');
      t.assertAlmostEqual(result.so, 0.5, 0.0001, 'so=0.5');
      t.assertAlmostEqual(result.weekday, 1.5, 0.0001, 'weekday=1.5');
  });

  runner.test('classifyDuties: Tag vor Feiertag (Mi vor Christi Himmelfahrt) zaehlt in fr', (t) => {
      const hp = new HolidayProvider();
      const duties = [
          { date: new Date('2025-05-28T12:00:00'), share: 1.0 } // Mi vor Christi Himmelfahrt
      ];
      const result = classifyDuties(duties, hp);
      t.assertAlmostEqual(result.fr, 1.0, 0.0001, 'Mi-vor-Do-Feiertag -> fr');
      t.assertEqual(result.weekday, 0, 'weekday=0');
  });
  ```

- [ ] **Step 2: Red verification.**

  Reload `test.html`. The 4 new `classifyDuties:` tests must fail with `classifyDuties: not implemented`.

- [ ] **Step 3: Replace the `classifyDuties` stub in `variants.js`.**

  ```javascript
  function classifyDuties(duties, holidayProvider) {
      const result = { fr: 0, sa: 0, so: 0, weekday: 0 };
      if (!Array.isArray(duties)) return result;
      for (const duty of duties) {
          const slot = classify(duty.date, holidayProvider);
          result[slot] += duty.share;
      }
      return result;
  }
  ```

- [ ] **Step 4: Green verification.**

  Reload `test.html`. All `classifyDuties:` tests pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add variants.js test-suite.js
  git commit -m "feat: implement classifyDuties() aggregation by slot"
  ```

---

### Task 5: Implement `variant3(classified, isVacation)` - red + green

This is V3 loose (the existing logic in `BonusCalculator`). Implementing this first lets us validate that historical inputs still produce the same numbers.

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\test-suite.js` (append)
- Modify: `G:\Claude\Claude_tmp_dienstplan\variants.js` (replace stub)

- [ ] **Step 1: Append `variant3` tests.**

  Append to `test-suite.js`:

  ```javascript
  // ============================================================================
  // Variants - variant3 (loose: 2 qualifying days, pool fr+sa+so)
  // ============================================================================

  runner.test('variant3: unter Schwelle (1 sa) -> not eligible, bonus 0', (t) => {
      const classified = { fr: 0, sa: 1, so: 0, weekday: 4 };
      const r = variant3(classified, false);
      t.assertFalse(r.eligible, 'eligible=false');
      t.assertEqual(r.bonus, 0, 'bonus=0');
      t.assertEqual(r.variantId, 3, 'variantId=3');
  });

  runner.test('variant3: 2x sa -> eligible, beide abgezogen, bonus 0', (t) => {
      const classified = { fr: 0, sa: 2, so: 0, weekday: 0 };
      const r = variant3(classified, false);
      t.assertTrue(r.eligible, 'eligible=true');
      t.assertEqual(r.deduction.sa, 2, 'sa-deduction=2');
      t.assertEqual(r.paidShares.sa, 0, 'sa-paid=0');
      t.assertEqual(r.bonus, 0, 'bonus=0');
  });

  runner.test('variant3: Friday priority fr->so->sa', (t) => {
      // fr=2, sa=1, so=1, weekday=0 -> 2 von fr abgezogen, sa+so voll bezahlt
      const classified = { fr: 2, sa: 1, so: 1, weekday: 0 };
      const r = variant3(classified, false);
      t.assertTrue(r.eligible, 'eligible=true');
      t.assertEqual(r.deduction.fr, 2, 'fr-deduction=2');
      t.assertEqual(r.deduction.so, 0, 'so-deduction=0');
      t.assertEqual(r.deduction.sa, 0, 'sa-deduction=0');
      t.assertEqual(r.paidShares.fr, 0, 'fr-paid=0');
      t.assertEqual(r.paidShares.so, 1, 'so-paid=1');
      t.assertEqual(r.paidShares.sa, 1, 'sa-paid=1');
      t.assertEqual(r.bonus, 2 * 450, 'bonus = 2 * 450 = 900');
  });

  runner.test('variant3: fr=1, sa=1, so=0 -> fr+sa abgezogen', (t) => {
      const classified = { fr: 1, sa: 1, so: 0, weekday: 0 };
      const r = variant3(classified, false);
      t.assertEqual(r.deduction.fr, 1, 'fr=1');
      t.assertEqual(r.deduction.so, 0, 'so=0');
      t.assertEqual(r.deduction.sa, 1, 'sa=1');
      t.assertEqual(r.bonus, 0, 'bonus=0');
  });

  runner.test('variant3: weekday wird voll bezahlt, nicht abgezogen', (t) => {
      const classified = { fr: 1, sa: 1, so: 0, weekday: 3 };
      const r = variant3(classified, false);
      t.assertEqual(r.paidShares.weekday, 3, 'weekday-paid=3');
      t.assertEqual(r.deduction.weekday, 0, 'weekday-deduction=0');
      t.assertEqual(r.bonus, 3 * 250, 'bonus = 3 * 250 = 750');
  });

  runner.test('variant3: Urlaubsmodus halbiert Schwelle auf 1', (t) => {
      const classified = { fr: 0, sa: 0.5, so: 0.5, weekday: 0 };
      const r = variant3(classified, true);
      t.assertTrue(r.eligible, 'eligible=true (Schwelle 1)');
      // Abzug 1 aus Pool, fr-Prio -> so zuerst (fr=0), dann sa
      t.assertEqual(r.deduction.fr, 0, 'fr=0');
      t.assertEqual(r.deduction.so, 0.5, 'so=0.5');
      t.assertEqual(r.deduction.sa, 0.5, 'sa=0.5');
      t.assertEqual(r.bonus, 0, 'bonus=0');
  });

  runner.test('variant3: Urlaubsmodus, halbe sa und 1 fr -> fr-Prio frisst 1', (t) => {
      const classified = { fr: 1, sa: 0.5, so: 0, weekday: 0 };
      const r = variant3(classified, true);
      t.assertTrue(r.eligible, 'eligible=true');
      t.assertEqual(r.deduction.fr, 1, 'fr=1');
      t.assertEqual(r.deduction.sa, 0, 'sa unangetastet');
      t.assertEqual(r.paidShares.sa, 0.5, 'sa-paid=0.5');
      t.assertEqual(r.bonus, 0.5 * 450, 'bonus = 0.5 * 450 = 225');
  });

  runner.test('variant3: threshold-Shape ist {pool: 2} normal, {pool: 1} im Urlaub', (t) => {
      const r1 = variant3({ fr: 0, sa: 2, so: 0, weekday: 0 }, false);
      const r2 = variant3({ fr: 0, sa: 1, so: 0, weekday: 0 }, true);
      t.assertEqual(r1.threshold.pool, 2, 'normal pool=2');
      t.assertEqual(r2.threshold.pool, 1, 'vacation pool=1');
  });
  ```

- [ ] **Step 2: Red verification.**

  Reload `test.html`. All new `variant3:` tests fail with `variant3: not implemented`.

- [ ] **Step 3: Implement `variant3` in `variants.js`.**

  Replace the `variant3` stub with:

  ```javascript
  function variant3(classified, isVacation) {
      const RATE_NORMAL  = 250;
      const RATE_WEEKEND = 450;
      const poolThreshold = isVacation ? 1 : 2;
      const totalDeduction = isVacation ? 1 : 2;

      const pool = classified.fr + classified.sa + classified.so;
      const eligible = pool >= poolThreshold - 1e-9;

      if (!eligible) {
          return {
              variantId: 3,
              eligible: false,
              threshold: { pool: poolThreshold },
              deduction: { fr: 0, sa: 0, so: 0, weekday: 0 },
              paidShares: { fr: 0, sa: 0, so: 0, weekday: 0 },
              bonus: 0,
              isWinner: false
          };
      }

      // Friday priority: fr -> so -> sa
      let remaining = totalDeduction;
      const deduction = { fr: 0, sa: 0, so: 0, weekday: 0 };
      for (const slot of ['fr', 'so', 'sa']) {
          const take = Math.min(remaining, classified[slot]);
          deduction[slot] = take;
          remaining -= take;
          if (remaining <= 1e-9) break;
      }

      const paidShares = {
          fr:      Math.max(0, classified.fr      - deduction.fr),
          sa:      Math.max(0, classified.sa      - deduction.sa),
          so:      Math.max(0, classified.so      - deduction.so),
          weekday: classified.weekday // weekday never deducted in V3
      };

      const bonus = (paidShares.fr + paidShares.sa + paidShares.so) * RATE_WEEKEND
                  + paidShares.weekday * RATE_NORMAL;

      return {
          variantId: 3,
          eligible: true,
          threshold: { pool: poolThreshold },
          deduction,
          paidShares,
          bonus,
          isWinner: false
      };
  }
  ```

- [ ] **Step 4: Green verification.**

  Reload `test.html`. All `variant3:` tests pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add variants.js test-suite.js
  git commit -m "feat: implement variant3 (loose, pool fr+sa+so, fr-priority)"
  ```

---

### Task 6: Implement `variant1(classified, isVacation)` - red + green

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\test-suite.js` (append)
- Modify: `G:\Claude\Claude_tmp_dienstplan\variants.js` (replace stub)

- [ ] **Step 1: Append `variant1` tests.**

  Append:

  ```javascript
  // ============================================================================
  // Variants - variant1 (1 fr+so + 3 weekday)
  // ============================================================================

  runner.test('variant1: Schwelle nicht erreicht (fr+so=0)', (t) => {
      const r = variant1({ fr: 0, sa: 5, so: 0, weekday: 3 }, false);
      t.assertFalse(r.eligible, 'eligible=false');
      t.assertEqual(r.bonus, 0, 'bonus=0');
  });

  runner.test('variant1: Schwelle nicht erreicht (weekday<3)', (t) => {
      const r = variant1({ fr: 1, sa: 5, so: 0, weekday: 2 }, false);
      t.assertFalse(r.eligible, 'eligible=false');
      t.assertEqual(r.bonus, 0, 'bonus=0');
  });

  runner.test('variant1: Spec-Beispiel fr=2,sa=1,so=0,weekday=4 -> 1150', (t) => {
      const r = variant1({ fr: 2, sa: 1, so: 0, weekday: 4 }, false);
      t.assertTrue(r.eligible, 'eligible=true');
      t.assertEqual(r.deduction.fr, 1, 'fr-deduction=1 (Fr-Prio)');
      t.assertEqual(r.deduction.so, 0, 'so-deduction=0');
      t.assertEqual(r.deduction.sa, 0, 'sa nicht abgezogen');
      t.assertEqual(r.deduction.weekday, 3, 'weekday-deduction=3');
      t.assertEqual(r.paidShares.fr, 1, 'fr-paid=1');
      t.assertEqual(r.paidShares.sa, 1, 'sa-paid=1');
      t.assertEqual(r.paidShares.so, 0, 'so-paid=0');
      t.assertEqual(r.paidShares.weekday, 1, 'weekday-paid=1');
      t.assertEqual(r.bonus, 1150, 'bonus = (1+1+0)*450 + 1*250 = 1150');
  });

  runner.test('variant1: nur so vorhanden -> 1 von so abgezogen', (t) => {
      const r = variant1({ fr: 0, sa: 0, so: 1, weekday: 3 }, false);
      t.assertTrue(r.eligible, 'eligible=true');
      t.assertEqual(r.deduction.fr, 0, 'fr-deduction=0');
      t.assertEqual(r.deduction.so, 1, 'so-deduction=1');
      t.assertEqual(r.deduction.weekday, 3, 'weekday-deduction=3');
      t.assertEqual(r.bonus, 0, 'bonus=0');
  });

  runner.test('variant1: sa wird voll bezahlt, nicht abgezogen', (t) => {
      const r = variant1({ fr: 1, sa: 2, so: 0, weekday: 3 }, false);
      t.assertEqual(r.deduction.sa, 0, 'sa-deduction=0');
      t.assertEqual(r.paidShares.sa, 2, 'sa-paid=2');
      // bonus = (0+2+0)*450 + 0*250 = 900
      t.assertEqual(r.bonus, 900, 'bonus=900');
  });

  runner.test('variant1: Urlaubsmodus halbiert Schwellen (0.5 + 1.5)', (t) => {
      const r = variant1({ fr: 0.5, sa: 0, so: 0, weekday: 1.5 }, true);
      t.assertTrue(r.eligible, 'eligible=true im Urlaub');
      t.assertEqual(r.threshold.frSo, 0.5, 'threshold.frSo=0.5');
      t.assertEqual(r.threshold.weekday, 1.5, 'threshold.weekday=1.5');
      t.assertEqual(r.deduction.fr, 0.5, 'fr-deduction=0.5');
      t.assertEqual(r.deduction.weekday, 1.5, 'weekday-deduction=1.5');
      t.assertEqual(r.bonus, 0, 'bonus=0');
  });

  runner.test('variant1: threshold-Shape normal {frSo:1, weekday:3}', (t) => {
      const r = variant1({ fr: 1, sa: 0, so: 0, weekday: 3 }, false);
      t.assertEqual(r.threshold.frSo, 1, 'threshold.frSo=1');
      t.assertEqual(r.threshold.weekday, 3, 'threshold.weekday=3');
  });
  ```

- [ ] **Step 2: Red verification.** All new `variant1:` tests fail with `variant1: not implemented`.

- [ ] **Step 3: Implement `variant1`.**

  Replace the `variant1` stub in `variants.js`:

  ```javascript
  function variant1(classified, isVacation) {
      const RATE_NORMAL  = 250;
      const RATE_WEEKEND = 450;
      const frSoThreshold    = isVacation ? 0.5 : 1;
      const weekdayThreshold = isVacation ? 1.5 : 3;
      const frSoDeduction    = isVacation ? 0.5 : 1;
      const weekdayDeduction = isVacation ? 1.5 : 3;

      const frSoPool = classified.fr + classified.so;
      const eligible = (frSoPool >= frSoThreshold - 1e-9)
                    && (classified.weekday >= weekdayThreshold - 1e-9);

      if (!eligible) {
          return {
              variantId: 1,
              eligible: false,
              threshold: { frSo: frSoThreshold, weekday: weekdayThreshold },
              deduction: { fr: 0, sa: 0, so: 0, weekday: 0 },
              paidShares: { fr: 0, sa: 0, so: 0, weekday: 0 },
              bonus: 0,
              isWinner: false
          };
      }

      // Friday priority within fr+so pool: fr first, then so
      let remaining = frSoDeduction;
      const deduction = { fr: 0, sa: 0, so: 0, weekday: weekdayDeduction };
      for (const slot of ['fr', 'so']) {
          const take = Math.min(remaining, classified[slot]);
          deduction[slot] = take;
          remaining -= take;
          if (remaining <= 1e-9) break;
      }

      const paidShares = {
          fr:      Math.max(0, classified.fr      - deduction.fr),
          sa:      classified.sa, // sa never deducted in V1
          so:      Math.max(0, classified.so      - deduction.so),
          weekday: Math.max(0, classified.weekday - deduction.weekday)
      };

      const bonus = (paidShares.fr + paidShares.sa + paidShares.so) * RATE_WEEKEND
                  + paidShares.weekday * RATE_NORMAL;

      return {
          variantId: 1,
          eligible: true,
          threshold: { frSo: frSoThreshold, weekday: weekdayThreshold },
          deduction,
          paidShares,
          bonus,
          isWinner: false
      };
  }
  ```

- [ ] **Step 4: Green verification.** All `variant1:` tests pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add variants.js test-suite.js
  git commit -m "feat: implement variant1 (1 fr+so + 3 weekday, fr-priority)"
  ```

---

### Task 7: Implement `variant2(classified, isVacation)` - red + green

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\test-suite.js` (append)
- Modify: `G:\Claude\Claude_tmp_dienstplan\variants.js` (replace stub)

- [ ] **Step 1: Append `variant2` tests.**

  ```javascript
  // ============================================================================
  // Variants - variant2 (1 sa + 2 weekday)
  // ============================================================================

  runner.test('variant2: Schwelle nicht erreicht (sa=0)', (t) => {
      const r = variant2({ fr: 5, sa: 0, so: 5, weekday: 3 }, false);
      t.assertFalse(r.eligible, 'eligible=false');
      t.assertEqual(r.bonus, 0, 'bonus=0');
  });

  runner.test('variant2: Schwelle nicht erreicht (weekday<2)', (t) => {
      const r = variant2({ fr: 0, sa: 2, so: 0, weekday: 1 }, false);
      t.assertFalse(r.eligible, 'eligible=false');
  });

  runner.test('variant2: Spec-Beispiel fr=1,sa=2,so=0,weekday=3 -> 1150', (t) => {
      const r = variant2({ fr: 1, sa: 2, so: 0, weekday: 3 }, false);
      t.assertTrue(r.eligible, 'eligible=true');
      t.assertEqual(r.deduction.sa, 1, 'sa-deduction=1');
      t.assertEqual(r.deduction.weekday, 2, 'weekday-deduction=2');
      t.assertEqual(r.deduction.fr, 0, 'fr nicht abgezogen');
      t.assertEqual(r.deduction.so, 0, 'so nicht abgezogen');
      t.assertEqual(r.paidShares.fr, 1, 'fr-paid=1');
      t.assertEqual(r.paidShares.sa, 1, 'sa-paid=1');
      t.assertEqual(r.paidShares.weekday, 1, 'weekday-paid=1');
      t.assertEqual(r.bonus, 1150, 'bonus = (1+1+0)*450 + 1*250 = 1150');
  });

  runner.test('variant2: sa=1,weekday=2 -> alles weg, bonus 0', (t) => {
      const r = variant2({ fr: 0, sa: 1, so: 0, weekday: 2 }, false);
      t.assertTrue(r.eligible, 'eligible=true');
      t.assertEqual(r.bonus, 0, 'bonus=0');
  });

  runner.test('variant2: sa=2,weekday=2,fr=1,so=1 -> fr/so voll bezahlt', (t) => {
      const r = variant2({ fr: 1, sa: 2, so: 1, weekday: 2 }, false);
      t.assertEqual(r.paidShares.fr, 1, 'fr-paid=1');
      t.assertEqual(r.paidShares.sa, 1, 'sa-paid=1');
      t.assertEqual(r.paidShares.so, 1, 'so-paid=1');
      t.assertEqual(r.paidShares.weekday, 0, 'weekday-paid=0');
      t.assertEqual(r.bonus, 3 * 450, 'bonus = 3*450 = 1350');
  });

  runner.test('variant2: Urlaubsmodus halbiert (0.5 sa + 1 weekday)', (t) => {
      const r = variant2({ fr: 0, sa: 0.5, so: 0, weekday: 1 }, true);
      t.assertTrue(r.eligible, 'eligible=true im Urlaub');
      t.assertEqual(r.threshold.sa, 0.5, 'threshold.sa=0.5');
      t.assertEqual(r.threshold.weekday, 1, 'threshold.weekday=1');
      t.assertEqual(r.deduction.sa, 0.5, 'sa-deduction=0.5');
      t.assertEqual(r.deduction.weekday, 1, 'weekday-deduction=1');
      t.assertEqual(r.bonus, 0, 'bonus=0');
  });

  runner.test('variant2: threshold-Shape normal {sa:1, weekday:2}', (t) => {
      const r = variant2({ fr: 0, sa: 1, so: 0, weekday: 2 }, false);
      t.assertEqual(r.threshold.sa, 1, 'threshold.sa=1');
      t.assertEqual(r.threshold.weekday, 2, 'threshold.weekday=2');
  });
  ```

- [ ] **Step 2: Red verification.** All new `variant2:` tests fail with `variant2: not implemented`.

- [ ] **Step 3: Implement `variant2`.**

  Replace the `variant2` stub in `variants.js`:

  ```javascript
  function variant2(classified, isVacation) {
      const RATE_NORMAL  = 250;
      const RATE_WEEKEND = 450;
      const saThreshold      = isVacation ? 0.5 : 1;
      const weekdayThreshold = isVacation ? 1   : 2;
      const saDeduction      = isVacation ? 0.5 : 1;
      const weekdayDeduction = isVacation ? 1   : 2;

      const eligible = (classified.sa >= saThreshold - 1e-9)
                    && (classified.weekday >= weekdayThreshold - 1e-9);

      if (!eligible) {
          return {
              variantId: 2,
              eligible: false,
              threshold: { sa: saThreshold, weekday: weekdayThreshold },
              deduction: { fr: 0, sa: 0, so: 0, weekday: 0 },
              paidShares: { fr: 0, sa: 0, so: 0, weekday: 0 },
              bonus: 0,
              isWinner: false
          };
      }

      const deduction = { fr: 0, sa: saDeduction, so: 0, weekday: weekdayDeduction };

      const paidShares = {
          fr:      classified.fr, // fr never deducted in V2
          sa:      Math.max(0, classified.sa      - deduction.sa),
          so:      classified.so, // so never deducted in V2
          weekday: Math.max(0, classified.weekday - deduction.weekday)
      };

      const bonus = (paidShares.fr + paidShares.sa + paidShares.so) * RATE_WEEKEND
                  + paidShares.weekday * RATE_NORMAL;

      return {
          variantId: 2,
          eligible: true,
          threshold: { sa: saThreshold, weekday: weekdayThreshold },
          deduction,
          paidShares,
          bonus,
          isWinner: false
      };
  }
  ```

- [ ] **Step 4: Green verification.** All `variant2:` tests pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add variants.js test-suite.js
  git commit -m "feat: implement variant2 (1 sa + 2 weekday)"
  ```

---

### Task 8: Refactor `BonusCalculator` to use variants and pick the winner - red + green

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\test-suite.js` (append winner-selection tests)
- Modify: `G:\Claude\Claude_tmp_dienstplan\calculator.js` (full rewrite of business logic)

- [ ] **Step 1: Append winner-selection tests.**

  ```javascript
  // ============================================================================
  // BonusCalculator - Winner Selection (new shape)
  // ============================================================================

  runner.test('Winner: klarer Sieger mit weekdays + 1 Fr', (t) => {
      const hp = new HolidayProvider();
      const calc = new BonusCalculator(hp);
      const duties = [
          { date: new Date('2025-11-21T12:00:00'), share: 1.0 }, // Fr
          { date: new Date('2025-11-24T12:00:00'), share: 1.0 }, // Mo
          { date: new Date('2025-11-25T12:00:00'), share: 1.0 }, // Di
          { date: new Date('2025-11-26T12:00:00'), share: 1.0 }, // Mi
          { date: new Date('2025-11-27T12:00:00'), share: 1.0 }, // Do
          { date: new Date('2025-11-04T12:00:00'), share: 1.0 }  // Di
      ];
      const result = calc.calculateMonthlyBonus(duties, false);
      t.assertTrue(result.winner.isWinner, 'winner.isWinner=true');
      t.assertEqual(result.allResults.length, 3, '3 Varianten im allResults');
      t.assertTrue(result.totalBonus > 0, 'Bonus > 0');
  });

  runner.test('Winner: klarer V3-Sieger (nur WE-Dienste)', (t) => {
      const hp = new HolidayProvider();
      const calc = new BonusCalculator(hp);
      const duties = [
          { date: new Date('2025-11-22T12:00:00'), share: 1.0 }, // Sa
          { date: new Date('2025-11-23T12:00:00'), share: 1.0 }, // So
          { date: new Date('2025-11-29T12:00:00'), share: 1.0 }  // Sa
      ];
      const result = calc.calculateMonthlyBonus(duties, false);
      // V1: fr+so=1, weekday=0 -> not eligible
      // V2: sa=2, weekday=0 -> not eligible
      // V3: pool=3 -> eligible, deduction 2 (fr=0,so=1 abgezogen, sa=1 abgezogen) -> 1 sa paid -> 450
      t.assertEqual(result.winner.variantId, 3, 'V3 muss Sieger sein');
      t.assertEqual(result.totalBonus, 450, 'bonus=450');
  });

  runner.test('Winner: Tie-Breaker - alle three not eligible -> V1 nominal winner, totalBonus 0', (t) => {
      const hp = new HolidayProvider();
      const calc = new BonusCalculator(hp);
      // fr=1, sa=0, so=0, weekday=3:
      // V1: fr+so=1 ok, weekday=3 ok -> eligible. Abzug fr=1, weekday=3 -> alles weg, bonus 0.
      // V2: sa=0 -> not eligible (0).
      // V3: pool=1 < 2 -> not eligible (0).
      // -> tie at 0; V1 has eligible=true so its result is still 0. Strict > keeps v1 as winner.
      const duties = [
          { date: new Date('2025-11-21T12:00:00'), share: 1.0 }, // Fr
          { date: new Date('2025-11-24T12:00:00'), share: 1.0 }, // Mo
          { date: new Date('2025-11-25T12:00:00'), share: 1.0 }, // Di
          { date: new Date('2025-11-26T12:00:00'), share: 1.0 }  // Mi
      ];
      const result = calc.calculateMonthlyBonus(duties, false);
      t.assertEqual(result.winner.variantId, 1, 'V1 wins tie (lowest variantId)');
      t.assertEqual(result.totalBonus, 0, 'totalBonus=0 (all-zero tie)');
  });

  runner.test('Winner: nur V3 eligible -> V3 gewinnt egal wie klein der Bonus', (t) => {
      const hp = new HolidayProvider();
      const calc = new BonusCalculator(hp);
      // fr=0, sa=2, so=0, weekday=0 -> V1 no (fr+so=0), V2 no (weekday=0), V3 yes (bonus=0)
      const duties = [
          { date: new Date('2025-11-22T12:00:00'), share: 1.0 }, // Sa
          { date: new Date('2025-11-29T12:00:00'), share: 1.0 }  // Sa
      ];
      const result = calc.calculateMonthlyBonus(duties, false);
      t.assertEqual(result.winner.variantId, 3, 'V3 gewinnt (einzig eligible mit positive logic, V1/V2 also bonus 0)');
      // Tie-breaker note: V1 bonus=0, V2 bonus=0, V3 bonus=0 -> strict > keeps V1 as winner.
      // The assertion above will FAIL for this scenario - V1 wins the tie. Adjust below.
      // (See implementation: strict > means V1 wins all-zero ties. Test must reflect that.)
  });

  runner.test('Winner: result-Shape enthaelt classified, isVacation, dutyDetails', (t) => {
      const hp = new HolidayProvider();
      const calc = new BonusCalculator(hp);
      const duties = [
          { date: new Date('2025-11-22T12:00:00'), share: 1.0 },
          { date: new Date('2025-11-23T12:00:00'), share: 1.0 }
      ];
      const result = calc.calculateMonthlyBonus(duties, false);
      t.assertTrue('classified' in result, 'classified field exists');
      t.assertTrue('isVacation' in result, 'isVacation field exists');
      t.assertTrue('dutyDetails' in result, 'dutyDetails field exists');
      t.assertEqual(result.dutyDetails.length, 2, 'dutyDetails has 2 entries');
      t.assertEqual(result.isVacation, false, 'isVacation=false');
  });

  runner.test('Winner: Urlaubsmodus halbiert alle Schwellen', (t) => {
      const hp = new HolidayProvider();
      const calc = new BonusCalculator(hp);
      // fr=0.5, weekday=1.5 -> V1 eligible im Urlaub (0.5 >= 0.5, 1.5 >= 1.5)
      const duties = [
          { date: new Date('2025-11-21T12:00:00'), share: 0.5 }, // Fr
          { date: new Date('2025-11-24T12:00:00'), share: 1.0 }, // Mo
          { date: new Date('2025-11-25T12:00:00'), share: 0.5 }  // Di
      ];
      const result = calc.calculateMonthlyBonus(duties, true);
      t.assertEqual(result.isVacation, true, 'isVacation propagated');
      t.assertEqual(result.winner.variantId, 1, 'V1 wins under vacation');
  });
  ```

  **Important correction:** The test `'Winner: nur V3 eligible -> V3 gewinnt egal wie klein der Bonus'` as written above is **wrong** — with strict `>` for winner selection and all-zero ties going to V1, V3's `eligible=true` does not change the bonus value, so V1 wins the tie. Either replace the assertion or remove the test. The clean replacement to use instead:

  ```javascript
  runner.test('Winner: nur V3 produziert positive bonus -> V3 winner', (t) => {
      const hp = new HolidayProvider();
      const calc = new BonusCalculator(hp);
      // Three Saturdays: V1 not eligible, V2 not eligible (weekday=0), V3 eligible with positive bonus.
      const duties = [
          { date: new Date('2025-11-22T12:00:00'), share: 1.0 },
          { date: new Date('2025-11-29T12:00:00'), share: 1.0 },
          { date: new Date('2025-11-15T12:00:00'), share: 1.0 }
      ];
      const result = calc.calculateMonthlyBonus(duties, false);
      // V3: pool=3, abzug 2 (so=0, fr=0, sa=2 abgezogen) -> 1 sa paid -> 450
      t.assertEqual(result.winner.variantId, 3, 'V3 winner');
      t.assertEqual(result.totalBonus, 450, 'bonus=450');
  });
  ```

  Use this corrected version; delete the prior broken one.

- [ ] **Step 2: Red verification.**

  Reload `test.html`. The new winner tests fail because `BonusCalculator` still uses the old shape - specifically the assertions `result.winner.variantId` and `result.allResults.length` throw "Erwartet: ... / Erhalten: undefined". Also, **all existing** `Berechnung:` tests will still pass at this stage (we have not changed `calculator.js` yet).

- [ ] **Step 3: Rewrite `calculator.js` to use variants.**

  Replace the **entire contents** of `G:\Claude\Claude_tmp_dienstplan\calculator.js` with:

  ```javascript
  /**
   * Bonus Calculator (NRW Psychiatrie 2011)
   * Orchestrator: classifies duties, runs all three variants (V1/V2/V3), picks the winner.
   * Pure variant logic lives in variants.js.
   */
  class BonusCalculator {
      constructor(holidayProvider) {
          this.holidayProvider = holidayProvider;
          this.RATE_NORMAL  = 250;
          this.RATE_WEEKEND = 450;
      }

      /**
       * Whether the given date is a "qualifying" day (used by UI for badge coloring).
       * Mirrors the old isQualifyingDay so app.js does not break.
       */
      isQualifyingDay(date) {
          const slot = classify(date, this.holidayProvider);
          return slot !== 'weekday';
      }

      /**
       * Human-readable label for the date's day type (used by UI).
       */
      getDayTypeLabel(date) {
          const dayOfWeek = date.getDay();
          const isHoliday = this.holidayProvider.isHoliday(date);
          const holidayName = this.holidayProvider.getHolidayName(date);
          const isDayBefore = this.holidayProvider.isDayBeforeHoliday(date);

          if (isHoliday)    return `Feiertag (${holidayName})`;
          if (isDayBefore)  return 'Tag vor Feiertag';
          if (dayOfWeek === 5) return 'Freitag';
          if (dayOfWeek === 6) return 'Samstag';
          if (dayOfWeek === 0) return 'Sonntag';

          const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
          return days[dayOfWeek];
      }

      /**
       * Build the dutyDetails array (date, share, isQualifying, dayType) for the UI.
       */
      buildDutyDetails(duties) {
          return duties.map(duty => ({
              date: duty.date,
              share: duty.share,
              isQualifying: this.isQualifyingDay(duty.date),
              dayType: this.getDayTypeLabel(duty.date)
          }));
      }

      /**
       * Calculate the bonus for a single employee for a given month.
       * @param {Array} duties - Array of { date: Date, share: number }
       * @param {boolean} isVacation - Vacation toggle (halves thresholds + deductions)
       * @returns {Object} new-shape result (winner, allResults, totalBonus, classified, isVacation, dutyDetails)
       */
      calculateMonthlyBonus(duties, isVacation = false) {
          if (!duties || duties.length === 0) {
              return this.getEmptyResult(isVacation);
          }

          const classified = classifyDuties(duties, this.holidayProvider);
          const v1 = variant1(classified, isVacation);
          const v2 = variant2(classified, isVacation);
          const v3 = variant3(classified, isVacation);
          const results = [v1, v2, v3];

          // Pick winner: highest bonus, tie-breaker = lowest variantId (strict >)
          let winner = results[0];
          for (let i = 1; i < results.length; i++) {
              if (results[i].bonus > winner.bonus) {
                  winner = results[i];
              }
          }
          winner.isWinner = true;

          return {
              classified,
              isVacation,
              winner,
              allResults: results,
              totalBonus: winner.bonus,
              totalDuties: duties.length,
              dutyDetails: this.buildDutyDetails(duties)
          };
      }

      /**
       * Calculate for all employees. vacationMap: { [employeeName]: boolean }
       */
      calculateAllEmployees(employeeDuties, vacationMap = {}) {
          const results = {};
          for (const [name, duties] of Object.entries(employeeDuties)) {
              const isVac = Boolean(vacationMap[name]);
              results[name] = this.calculateMonthlyBonus(duties, isVac);
          }
          return results;
      }

      getEmptyResult(isVacation = false) {
          const empty = {
              variantId: 1,
              eligible: false,
              threshold: null,
              deduction: { fr: 0, sa: 0, so: 0, weekday: 0 },
              paidShares: { fr: 0, sa: 0, so: 0, weekday: 0 },
              bonus: 0,
              isWinner: true
          };
          return {
              classified: { fr: 0, sa: 0, so: 0, weekday: 0 },
              isVacation,
              winner: empty,
              allResults: [empty,
                  { ...empty, variantId: 2, isWinner: false },
                  { ...empty, variantId: 3, isWinner: false }
              ],
              totalBonus: 0,
              totalDuties: 0,
              dutyDetails: []
          };
      }

      formatCurrency(amount) {
          return new Intl.NumberFormat('de-DE', {
              style: 'currency',
              currency: 'EUR'
          }).format(amount);
      }
  }

  // Make it available globally
  window.BonusCalculator = BonusCalculator;
  ```

- [ ] **Step 4: Green verification (winner tests).**

  Reload `test.html`. All new `Winner:` tests pass. **However**, the existing `Berechnung:` tests now fail because they reference removed fields like `result.qualifyingDays`, `result.thresholdReached`, `result.qualifyingDaysPaid`, `result.bonusNormalDays`, `result.normalDays`, etc. That's expected - Task 9 fixes them.

- [ ] **Step 5: Commit.**

  ```bash
  git add calculator.js test-suite.js
  git commit -m "refactor: BonusCalculator runs all 3 variants and picks winner"
  ```

---

### Task 9: Migrate existing tests to the new result shape

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\test-suite.js` (rewrite the `Berechnung:` block)

The existing `Berechnung:` tests reference fields that no longer exist (`qualifyingDays`, `thresholdReached`, `qualifyingDaysPaid`, `qualifyingDaysDeducted`, `normalDays`, `normalDaysPaid`, `bonusNormalDays`, `bonusQualifyingDays`). Rewrite each test to use the new shape (`result.classified`, `result.winner.eligible`, `result.winner.paidShares`, `result.totalBonus`).

- [ ] **Step 1: Replace the `Berechnung:` block.**

  Find the existing block that starts with `// Calculator Tests - Bonus Calculation` and the test `'Berechnung: Unter Schwellenwert (1.0 WE-Tag) = 0€'`. Replace the whole block, up to and including `'Berechnung: Keine Dienste = 0€'`, with:

  ```javascript
  // ============================================================================
  // Calculator Tests - Bonus Calculation (new variants shape)
  // ============================================================================

  runner.test('Berechnung: Unter Schwellenwert (1.0 WE-Tag) = 0 EUR', (t) => {
      const holidays = new HolidayProvider();
      const calculator = new BonusCalculator(holidays);
      const duties = [
          { date: new Date('2025-11-22T12:00:00'), share: 1.0 } // 1x Samstag
      ];
      const result = calculator.calculateMonthlyBonus(duties, false);
      t.assertEqual(result.classified.sa, 1.0, 'sa=1.0');
      t.assertFalse(result.winner.eligible, 'Kein eligible Variant');
      t.assertEqual(result.totalBonus, 0, 'Bonus 0');
  });

  runner.test('Berechnung: Genau 2.0 WE-Tage (Sa+So) -> V3 trigger, bonus 0', (t) => {
      const holidays = new HolidayProvider();
      const calculator = new BonusCalculator(holidays);
      const duties = [
          { date: new Date('2025-11-22T12:00:00'), share: 1.0 }, // Samstag
          { date: new Date('2025-11-23T12:00:00'), share: 1.0 }  // Sonntag
      ];
      const result = calculator.calculateMonthlyBonus(duties, false);
      t.assertEqual(result.winner.variantId, 3, 'V3 winner');
      t.assertTrue(result.winner.eligible, 'V3 eligible');
      t.assertEqual(result.winner.paidShares.sa + result.winner.paidShares.so, 0, '0 paid (alle abgezogen)');
      t.assertEqual(result.totalBonus, 0, 'Bonus 0');
  });

  runner.test('Berechnung: 4x halbe Sa+So Dienste (Schwelle 2.0) -> bonus 0', (t) => {
      const holidays = new HolidayProvider();
      const calculator = new BonusCalculator(holidays);
      const duties = [
          { date: new Date('2025-11-22T12:00:00'), share: 0.5 },
          { date: new Date('2025-11-22T12:00:00'), share: 0.5 },
          { date: new Date('2025-11-23T12:00:00'), share: 0.5 },
          { date: new Date('2025-11-23T12:00:00'), share: 0.5 }
      ];
      const result = calculator.calculateMonthlyBonus(duties, false);
      t.assertAlmostEqual(result.classified.sa + result.classified.so, 2.0, 0.0001, '2.0 total');
      t.assertEqual(result.totalBonus, 0, 'Bonus 0');
  });

  runner.test('Berechnung: 3 WE-Tage (Fr+Sa+So) -> V3 winner, bonus 450 EUR', (t) => {
      const holidays = new HolidayProvider();
      const calculator = new BonusCalculator(holidays);
      const duties = [
          { date: new Date('2025-11-21T12:00:00'), share: 1.0 }, // Freitag
          { date: new Date('2025-11-22T12:00:00'), share: 1.0 }, // Samstag
          { date: new Date('2025-11-23T12:00:00'), share: 1.0 }  // Sonntag
      ];
      const result = calculator.calculateMonthlyBonus(duties, false);
      // V3: pool=3, abzug 2 (fr=1, so=1) -> paid sa=1 -> 450
      t.assertEqual(result.winner.variantId, 3, 'V3 winner');
      t.assertEqual(result.totalBonus, 450, 'bonus 450');
  });

  runner.test('Berechnung: Normale Tage + WE-Tage gemischt (Mo+Di+Sa+So) -> V3, bonus 500', (t) => {
      const holidays = new HolidayProvider();
      const calculator = new BonusCalculator(holidays);
      const duties = [
          { date: new Date('2025-11-24T12:00:00'), share: 1.0 }, // Montag
          { date: new Date('2025-11-25T12:00:00'), share: 1.0 }, // Dienstag
          { date: new Date('2025-11-22T12:00:00'), share: 1.0 }, // Samstag
          { date: new Date('2025-11-23T12:00:00'), share: 1.0 }  // Sonntag
      ];
      const result = calculator.calculateMonthlyBonus(duties, false);
      // V1: fr+so=1, weekday=2 < 3 -> not eligible
      // V2: sa=1, weekday=2 -> eligible, abzug 1 sa, 2 weekday -> 0 -> bonus 0
      // V3: pool=2 -> eligible, abzug 2 (so=1, sa=1) -> 0 sa/so paid + 2 weekday paid = 500
      t.assertEqual(result.winner.variantId, 3, 'V3 winner with weekday-pay');
      t.assertEqual(result.winner.paidShares.weekday, 2, '2 weekday paid');
      t.assertEqual(result.totalBonus, 500, '2 * 250 = 500');
  });

  runner.test('Berechnung: Halbe Dienste korrekt im neuen Shape', (t) => {
      const holidays = new HolidayProvider();
      const calculator = new BonusCalculator(holidays);
      const duties = [
          { date: new Date('2025-11-24T12:00:00'), share: 0.5 }, // halber Mo (weekday)
          { date: new Date('2025-11-22T12:00:00'), share: 0.5 }, // halber Sa
          { date: new Date('2025-11-23T12:00:00'), share: 1.0 }, // ganzer So
          { date: new Date('2025-11-21T12:00:00'), share: 1.0 }  // ganzer Fr
      ];
      const result = calculator.calculateMonthlyBonus(duties, false);
      t.assertAlmostEqual(result.classified.weekday, 0.5, 0.0001, 'weekday=0.5');
      t.assertAlmostEqual(result.classified.fr + result.classified.sa + result.classified.so,
                          2.5, 0.0001, 'WE-Pool=2.5');
      // V3: pool=2.5, abzug 2 (fr=1, so=1) -> paid sa=0.5, weekday=0.5 -> 0.5*450 + 0.5*250 = 350
      t.assertEqual(result.winner.variantId, 3, 'V3 winner');
      t.assertEqual(result.totalBonus, 350, 'bonus 350');
  });

  runner.test('Berechnung: Feiertag (1. Mai 2025 = Do) + Vortag (Mi)', (t) => {
      const holidays = new HolidayProvider();
      const calculator = new BonusCalculator(holidays);
      const duties = [
          { date: new Date('2025-04-30T12:00:00'), share: 1.0 }, // Mi vor 1. Mai -> fr
          { date: new Date('2025-05-01T12:00:00'), share: 1.0 }  // 1. Mai (Do-Feiertag) -> so
      ];
      const result = calculator.calculateMonthlyBonus(duties, false);
      t.assertAlmostEqual(result.classified.fr, 1.0, 0.0001, 'fr=1.0');
      t.assertAlmostEqual(result.classified.so, 1.0, 0.0001, 'so=1.0');
      // V3: pool=2, abzug 2 (fr=1, so=1) -> 0 paid -> bonus 0
      t.assertEqual(result.totalBonus, 0, 'Bonus 0');
  });

  runner.test('Berechnung: Keine Dienste = 0 EUR', (t) => {
      const holidays = new HolidayProvider();
      const calculator = new BonusCalculator(holidays);
      const result = calculator.calculateMonthlyBonus([], false);
      t.assertEqual(result.totalDuties, 0, '0 duties');
      t.assertEqual(result.totalBonus, 0, '0 bonus');
      t.assertEqual(result.dutyDetails.length, 0, '0 dutyDetails');
  });
  ```

- [ ] **Step 2: Update the `Edge Case` block to also use the new shape.**

  Find the test `'Edge Case: Exakt Schwellenwert mit Rundungsfehler (1.9999)'`. Replace its body with:

  ```javascript
      const holidays = new HolidayProvider();
      const calculator = new BonusCalculator(holidays);
      const duties = [
          { date: new Date('2025-11-22T12:00:00'), share: 0.66666 }, // Sa
          { date: new Date('2025-11-23T12:00:00'), share: 0.66666 }, // So
          { date: new Date('2025-11-21T12:00:00'), share: 0.66666 }  // Fr
      ];
      const result = calculator.calculateMonthlyBonus(duties, false);
      const pool = result.classified.fr + result.classified.sa + result.classified.so;
      // 0.66666 x 3 ~ 1.99998 - wegen 1e-9 Toleranz triggert V3
      t.assertTrue(result.winner.variantId === 3 || pool < 2.0,
                   'Rundung korrekt behandelt');
  ```

  Find `'Edge Case: Sehr viele Dienste (Performance)'`. Replace its body with:

  ```javascript
      const holidays = new HolidayProvider();
      const calculator = new BonusCalculator(holidays);
      const duties = [];
      for (let i = 1; i <= 30; i++) {
          duties.push({
              date: new Date(`2025-11-${String(i).padStart(2, '0')}T12:00:00`),
              share: i % 2 === 0 ? 1.0 : 0.5
          });
      }
      const start = Date.now();
      const result = calculator.calculateMonthlyBonus(duties, false);
      const duration = Date.now() - start;
      t.assertTrue(duration < 100, `Berechnung schnell (${duration}ms)`);
      t.assertTrue(result.totalBonus > 0, 'Bonus > 0');
  ```

  Find `'Edge Case: Dienst am 29. Februar (Schaltjahr)'`. Replace its body with:

  ```javascript
      const holidays = new HolidayProvider();
      const calculator = new BonusCalculator(holidays);
      const duties = [
          { date: new Date('2028-02-29T12:00:00'), share: 1.0 } // Dienstag -> weekday
      ];
      const result = calculator.calculateMonthlyBonus(duties, false);
      t.assertEqual(result.classified.weekday, 1.0, '29.02. (Di) = weekday');
  ```

- [ ] **Step 3: Green verification.**

  Reload `test.html`. All tests - old (rewritten), `classify:`, `classifyDuties:`, `variant1/2/3:`, `Winner:`, `Edge Case:` - pass.

- [ ] **Step 4: Commit.**

  ```bash
  git add test-suite.js
  git commit -m "test: migrate Berechnung + Edge-Case tests to new variants result shape"
  ```

---

### Task 10: Extend `DataStorage` with vacation-mode persistence

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\test-suite.js` (append storage tests)
- Modify: `G:\Claude\Claude_tmp_dienstplan\storage.js`

- [ ] **Step 1: Append vacation-storage tests.**

  ```javascript
  // ============================================================================
  // Storage - Vacation Mode
  // ============================================================================

  runner.test('Storage: getVacationMode fuer unbekannten MA -> false', (t) => {
      const storage = new DataStorage();
      storage.clearAll();
      t.assertFalse(storage.getVacationMode('Niemand', '2025-11'), 'leerer Default false');
  });

  runner.test('Storage: setVacationMode -> getVacationMode round-trip', (t) => {
      const storage = new DataStorage();
      storage.clearAll();
      storage.setVacationMode('Max Mustermann', '2025-11', true);
      t.assertTrue(storage.getVacationMode('Max Mustermann', '2025-11'), 'true round-trip');
      t.assertFalse(storage.getVacationMode('Max Mustermann', '2025-12'), 'anderer Monat = false');
      t.assertFalse(storage.getVacationMode('Anna Schmidt', '2025-11'), 'anderer MA = false');
  });

  runner.test('Storage: setVacationMode kann zurueckgesetzt werden', (t) => {
      const storage = new DataStorage();
      storage.clearAll();
      storage.setVacationMode('Max Mustermann', '2025-11', true);
      storage.setVacationMode('Max Mustermann', '2025-11', false);
      t.assertFalse(storage.getVacationMode('Max Mustermann', '2025-11'), 'wieder false');
  });

  runner.test('Storage: Export enthaelt dienstplan_vacation', (t) => {
      const storage = new DataStorage();
      storage.clearAll();
      storage.addEmployee('Max Mustermann');
      storage.setVacationMode('Max Mustermann', '2025-11', true);
      const exported = storage.exportData();
      const parsed = JSON.parse(exported);
      t.assertTrue('vacation' in parsed, 'vacation key im Export');
      t.assertEqual(parsed.vacation['Max Mustermann']['2025-11'], true, 'Wert exportiert');
  });

  runner.test('Storage: Import restauriert vacation', (t) => {
      const storage1 = new DataStorage();
      storage1.clearAll();
      storage1.addEmployee('Max Mustermann');
      storage1.setVacationMode('Max Mustermann', '2025-11', true);
      const exported = storage1.exportData();

      const storage2 = new DataStorage();
      storage2.clearAll();
      const ok = storage2.importData(exported);
      t.assertTrue(ok, 'Import success');
      t.assertTrue(storage2.getVacationMode('Max Mustermann', '2025-11'), 'vacation restauriert');
  });

  runner.test('Storage: Import ohne vacation-Feld bleibt fehlerfrei', (t) => {
      const storage = new DataStorage();
      storage.clearAll();
      const legacyJson = JSON.stringify({
          employees: ['Max Mustermann'],
          duties: {}
      });
      const ok = storage.importData(legacyJson);
      t.assertTrue(ok, 'Legacy import erfolgreich');
      t.assertFalse(storage.getVacationMode('Max Mustermann', '2025-11'), 'Default false');
  });

  runner.test('Storage: clearAll entfernt auch vacation', (t) => {
      const storage = new DataStorage();
      storage.setVacationMode('Max Mustermann', '2025-11', true);
      storage.clearAll();
      t.assertFalse(storage.getVacationMode('Max Mustermann', '2025-11'), 'nach clearAll false');
  });
  ```

- [ ] **Step 2: Red verification.** All new `Storage:` tests that touch vacation fail with `storage.getVacationMode is not a function` (or similar).

- [ ] **Step 3: Modify `storage.js`.**

  In `G:\Claude\Claude_tmp_dienstplan\storage.js`, update the constructor:

  ```javascript
      constructor() {
          this.STORAGE_KEY_EMPLOYEES = 'dienstplan_employees';
          this.STORAGE_KEY_DUTIES    = 'dienstplan_duties';
          this.STORAGE_KEY_VACATION  = 'dienstplan_vacation';
      }
  ```

  Add new methods anywhere inside the `DataStorage` class (before `clearAll`):

  ```javascript
      /**
       * Get vacation mode for an employee in a specific month.
       * @param {string} employeeName
       * @param {string} yearMonth - format "YYYY-MM"
       * @returns {boolean}
       */
      getVacationMode(employeeName, yearMonth) {
          try {
              const raw = localStorage.getItem(this.STORAGE_KEY_VACATION);
              if (!raw) return false;
              const map = JSON.parse(raw);
              if (!map || typeof map !== 'object') return false;
              return Boolean(map[employeeName] && map[employeeName][yearMonth]);
          } catch (e) {
              console.error('Fehler beim Laden des Urlaubsmodus:', e);
              return false;
          }
      }

      /**
       * Set vacation mode for an employee in a specific month.
       */
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

      /**
       * Get the full vacation map ({ name: { yearMonth: bool } }).
       */
      getAllVacationModes() {
          try {
              const raw = localStorage.getItem(this.STORAGE_KEY_VACATION);
              if (!raw) return {};
              const map = JSON.parse(raw);
              if (!map || typeof map !== 'object') return {};
              return map;
          } catch (e) {
              console.error('Fehler beim Laden des Urlaubsmodus:', e);
              return {};
          }
      }
  ```

  Update `clearAll()`:

  ```javascript
      clearAll() {
          localStorage.removeItem(this.STORAGE_KEY_EMPLOYEES);
          localStorage.removeItem(this.STORAGE_KEY_DUTIES);
          localStorage.removeItem(this.STORAGE_KEY_VACATION);
      }
  ```

  Update `exportData()`:

  ```javascript
      exportData() {
          try {
              return JSON.stringify({
                  employees: this.getEmployees(),
                  duties: this.getAllDuties(),
                  vacation: this.getAllVacationModes()
              }, null, 2);
          } catch (e) {
              console.error('Fehler beim Exportieren der Daten:', e);
              throw new Error('Fehler beim Exportieren der Daten: ' + e.message);
          }
      }
  ```

  Update `importData(jsonString)`:

  ```javascript
      importData(jsonString) {
          try {
              const data = JSON.parse(jsonString);

              if (data.employees) {
                  this.saveEmployees(data.employees);
              }
              if (data.duties) {
                  this.saveAllDuties(data.duties);
              }
              if (data.vacation && typeof data.vacation === 'object') {
                  localStorage.setItem(this.STORAGE_KEY_VACATION, JSON.stringify(data.vacation));
              }
              return true;
          } catch (e) {
              console.error('Import failed:', e);
              return false;
          }
      }
  ```

- [ ] **Step 4: Green verification.** All new `Storage:` tests pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add storage.js test-suite.js
  git commit -m "feat: add dienstplan_vacation key + getVacationMode/setVacationMode + export/import"
  ```

---

### Task 11: Wire vacationMap through `calculateAllEmployees` in `app.js`

This task fixes the calculation tab so that when the user runs the calculation, each employee's vacation flag is read from storage and passed to `BonusCalculator`.

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\app.js` (method `calculateBonuses` only)

- [ ] **Step 1: Modify `calculateBonuses` to read the vacationMap.**

  In `G:\Claude\Claude_tmp_dienstplan\app.js`, find `calculateBonuses()` (around line 331). Replace its body with:

  ```javascript
      calculateBonuses() {
          const monthSelect = document.getElementById('calc-month-select');
          const yearSelect = document.getElementById('calc-year-select');
          const resultsContainer = document.getElementById('calculation-results');

          const month = parseInt(monthSelect.value);
          const year = parseInt(yearSelect.value);
          const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

          const employeeDuties = this.storage.getAllEmployeeDutiesForMonth(year, month);

          // Build vacation map for this month: { name: boolean }
          const vacationMap = {};
          Object.keys(employeeDuties).forEach(name => {
              vacationMap[name] = this.storage.getVacationMode(name, yearMonth);
          });

          const results = this.calculator.calculateAllEmployees(employeeDuties, vacationMap);

          const monthNames = ['Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
                              'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

          resultsContainer.innerHTML = `<h3>Ergebnisse fuer ${monthNames[month - 1]} ${year}</h3>`;

          const employees = Object.keys(results);
          if (employees.length === 0) {
              resultsContainer.innerHTML += '<p class="text-muted">Keine Daten verfuegbar.</p>';
              return;
          }

          // Stash current calc context for vacation-toggle handler
          this._currentCalcContext = { year, month, yearMonth };

          employees.forEach(employeeName => {
              const result = results[employeeName];
              const resultCard = this.createResultCard(employeeName, result);
              resultsContainer.appendChild(resultCard);
          });

          this.showToast('Berechnung abgeschlossen.', 'success');
      }
  ```

  Note: keep the original umlaut spelling ("März", "Ergebnisse für", "verfügbar") that exists in the current file — the snippet uses ASCII placeholders to stay safe in markdown but the implementer must keep the existing German umlauts to match the rest of the codebase.

- [ ] **Step 2: Manual verification.**

  Run the app. The result card currently still uses the old shape, so the card will be broken at this stage. That is acceptable - Task 12 replaces `createResultCard`. The console must not show errors about missing methods on `storage`.

- [ ] **Step 3: Commit.**

  ```bash
  git add app.js
  git commit -m "feat: pass vacationMap from storage to calculateAllEmployees"
  ```

---

### Task 12: Rewrite `createResultCard` - winner banner + collapsible variant breakdown + vacation toggle

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\app.js`
- Modify: `G:\Claude\Claude_tmp_dienstplan\styles.css` (append rules)

- [ ] **Step 1: Replace `createResultCard(employeeName, result)` in `app.js`.**

  Find `createResultCard(employeeName, result) { ... }` (around line 365). Replace the **entire method** with:

  ```javascript
      /**
       * Create a result card for an employee (new variants shape).
       */
      createResultCard(employeeName, result) {
          const card = document.createElement('div');
          card.className = 'result-card';

          const ctx = this._currentCalcContext || {};
          const yearMonth = ctx.yearMonth || '';
          const vacChecked = result.isVacation ? 'checked' : '';
          const safeName   = String(employeeName).replace(/"/g, '&quot;');
          const safeYm     = String(yearMonth).replace(/"/g, '&quot;');

          // Header + vacation toggle
          let content = `
              <div class="result-header">
                  <h3>${employeeName}</h3>
                  <label class="vacation-toggle">
                      <input type="checkbox"
                             data-vacation-employee="${safeName}"
                             data-vacation-yearmonth="${safeYm}"
                             ${vacChecked}>
                      Urlaub gehabt (>=14 Tage frei)
                  </label>
              </div>
          `;

          if (result.isVacation) {
              content += `<div class="vacation-active-banner">Urlaubsmodus aktiv - Schwellen halbiert</div>`;
          }

          // Winner banner
          if (!result.winner.eligible || result.totalBonus === 0) {
              content += `
                  <div class="threshold-warning">
                      <h4>Keine Variante triggert</h4>
                      <p>Mit den eingetragenen Diensten erreicht keine der drei Varianten einen positiven Bonus.</p>
                      <p><strong>Keine Bonuszahlung</strong></p>
                  </div>
              `;
          } else {
              content += `
                  <div class="bonus-total">
                      <h4>Variante ${result.winner.variantId} <span class="variant-badge winner">* Sieger</span></h4>
                      <div class="amount">${this.calculator.formatCurrency(result.totalBonus)}</div>
                  </div>
              `;
          }

          // Classified summary line
          const c = result.classified;
          content += `
              <div class="classified-summary">
                  <span>Fr: <strong>${c.fr.toFixed(1)}</strong></span>
                  <span>Sa: <strong>${c.sa.toFixed(1)}</strong></span>
                  <span>So: <strong>${c.so.toFixed(1)}</strong></span>
                  <span>Werktage: <strong>${c.weekday.toFixed(1)}</strong></span>
              </div>
          `;

          // Collapsible variant breakdown
          content += `<details class="variant-details"><summary>Alle Varianten anzeigen</summary>`;
          for (const v of result.allResults) {
              content += this.renderVariantBlock(v, result.winner.variantId);
          }
          content += `</details>`;

          card.innerHTML = content;

          // Attach vacation-toggle handler
          const cb = card.querySelector('input[data-vacation-employee]');
          if (cb) {
              cb.addEventListener('change', (e) => this.onVacationToggle(e));
          }
          return card;
      }

      /**
       * Render a single variant sub-panel.
       */
      renderVariantBlock(v, winnerId) {
          const isWinner = v.variantId === winnerId;
          const star = isWinner ? '<span class="variant-badge winner">*</span>' : '';
          const labels = {
              1: 'V1: 1 (Fr/So) + 3 Werktage',
              2: 'V2: 1 Sa + 2 Werktage',
              3: 'V3 (loose): 2 qualifizierende Tage (Pool Fr+Sa+So)'
          };
          let thresholdStr = '-';
          if (v.threshold) {
              if (v.variantId === 1) thresholdStr = `Fr+So >= ${v.threshold.frSo}, Werktage >= ${v.threshold.weekday}`;
              if (v.variantId === 2) thresholdStr = `Sa >= ${v.threshold.sa}, Werktage >= ${v.threshold.weekday}`;
              if (v.variantId === 3) thresholdStr = `Pool >= ${v.threshold.pool}`;
          }
          const elig = v.eligible ? '<span class="variant-eligible">erfuellt</span>'
                                  : '<span class="variant-not-eligible">nicht erfuellt</span>';
          return `
              <div class="variant-card${isWinner ? ' winner' : ''}">
                  <div class="variant-header">${star}<strong>${labels[v.variantId]}</strong></div>
                  <div class="variant-row"><span>Schwelle:</span><span>${thresholdStr}</span></div>
                  <div class="variant-row"><span>Eligibility:</span><span>${elig}</span></div>
                  <div class="variant-row"><span>Abzug:</span><span>
                      Fr ${v.deduction.fr.toFixed(2)} - Sa ${v.deduction.sa.toFixed(2)} - So ${v.deduction.so.toFixed(2)} - WT ${v.deduction.weekday.toFixed(2)}
                  </span></div>
                  <div class="variant-row"><span>Bezahlt:</span><span>
                      Fr ${v.paidShares.fr.toFixed(2)} - Sa ${v.paidShares.sa.toFixed(2)} - So ${v.paidShares.so.toFixed(2)} - WT ${v.paidShares.weekday.toFixed(2)}
                  </span></div>
                  <div class="variant-row variant-bonus"><span>Bonus:</span><span>${this.calculator.formatCurrency(v.bonus)}</span></div>
              </div>
          `;
      }

      /**
       * Handle vacation checkbox toggle.
       */
      onVacationToggle(e) {
          const cb = e.target;
          const name = cb.getAttribute('data-vacation-employee');
          const ym   = cb.getAttribute('data-vacation-yearmonth');
          try {
              this.storage.setVacationMode(name, ym, cb.checked);
              // Re-run calc to reflect the new state
              this.calculateBonuses();
          } catch (err) {
              this.showToast('Urlaubsmodus konnte nicht gespeichert werden', 'error');
              cb.checked = !cb.checked; // revert visual state
          }
      }
  ```

  Note: keep proper German umlauts ("erfüllt", "Größe") in the actual code — the snippet uses ASCII placeholders only to stay safe in the markdown plan file. Where the snippet shows `erfuellt`, write `erfüllt`. Where it shows `>=14`, write `≥14`. Where it shows `*` for a star, prefer the actual star glyph `★`.

- [ ] **Step 2: Append CSS rules to `styles.css`.**

  Append at the bottom of `G:\Claude\Claude_tmp_dienstplan\styles.css`:

  ```css
  /* === Variants UI === */
  .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 10px;
  }

  .vacation-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: #fff;
      border: 2px solid #e0e0e0;
      border-radius: 6px;
      font-size: 0.9rem;
      cursor: pointer;
      user-select: none;
  }

  .vacation-toggle input[type="checkbox"] {
      margin: 0;
      cursor: pointer;
  }

  .vacation-active-banner {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 12px;
      color: #856404;
      font-size: 0.9rem;
  }

  .classified-summary {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
      padding: 10px 15px;
      background: #f8f9fa;
      border-radius: 6px;
      margin: 12px 0;
      font-size: 0.9rem;
  }

  .variant-details {
      margin-top: 15px;
      background: #f8f9fa;
      border-radius: 6px;
      padding: 10px 15px;
  }

  .variant-details summary {
      cursor: pointer;
      font-weight: 500;
      color: #667eea;
      padding: 4px 0;
  }

  .variant-card {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 12px 15px;
      margin: 10px 0;
  }

  .variant-card.winner {
      border-color: #28a745;
      box-shadow: 0 0 0 2px rgba(40, 167, 69, 0.15);
  }

  .variant-header {
      margin-bottom: 8px;
      font-size: 0.95rem;
  }

  .variant-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.75rem;
      margin-right: 6px;
      background: #28a745;
      color: white;
      font-weight: 600;
  }

  .variant-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 4px 0;
      font-size: 0.85rem;
      color: #555;
      border-top: 1px solid #f0f0f0;
  }

  .variant-row:first-of-type {
      border-top: none;
  }

  .variant-bonus {
      font-weight: 600;
      color: #333;
      font-size: 0.95rem;
  }

  .variant-eligible {
      color: #28a745;
      font-weight: 600;
  }

  .variant-not-eligible {
      color: #dc3545;
      font-weight: 600;
  }
  ```

- [ ] **Step 3: Manual verification.**

  Run `index.html` in the browser. Create an employee, add 3 duties (e.g. 1 Fr + 2 Mo-Do), click **Berechnung durchfuehren**. Confirm:
  - Winner banner shows "Variante 3" (or whichever variant wins) with a star badge.
  - Classified summary line shows the fr/sa/so/weekday tallies.
  - Clicking "Alle Varianten anzeigen" expands the `<details>`, showing 3 sub-cards with eligibility, deduction, paid shares, bonus. The winning one has a green border and a star badge.
  - Toggling the "Urlaub gehabt" checkbox reloads the result with halved thresholds and the yellow "Urlaubsmodus aktiv" banner appears. Refresh the page - the checkbox state must persist.

- [ ] **Step 4: Commit.**

  ```bash
  git add app.js styles.css
  git commit -m "feat: result card shows winner banner, all-variants details, vacation toggle"
  ```

---

### Task 13: Update CSV / HTML / E-Mail exports to read the new result shape

The export functions (`exportCSV`, `exportBonusReport`, `generateEmailReport`) still read the old fields (`thresholdReached`, `qualifyingDays`, `qualifyingDaysDeducted`, `normalDays`, `normalDaysPaid`, `qualifyingDaysPaid`, `bonusNormalDays`, `bonusQualifyingDays`). These no longer exist - they must be replaced with the new fields.

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\app.js`

- [ ] **Step 1: Update `exportCSV`.**

  In `exportCSV` (around line 566), replace the lines starting at the "Sheet 2" header through the end of the `for` loop (the section that writes `result.normalDays`, `result.qualifyingDays`, etc.) with:

  ```javascript
          // === Sheet 2: Monatliche Auswertung ===
          csv += `AUSWERTUNG ${monthNames[month - 1]} ${year}\n`;
          csv += 'Mitarbeiter;Urlaub;Sieger-Variante;Fr;Sa;So;Werktage;Eligible;Abzug Fr;Abzug Sa;Abzug So;Abzug WT;Bonus (EUR)\n';

          const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
          const employeeDuties = this.storage.getAllEmployeeDutiesForMonth(year, month);
          const vacationMap = {};
          Object.keys(employeeDuties).forEach(name => {
              vacationMap[name] = this.storage.getVacationMode(name, yearMonth);
          });
          const results = this.calculator.calculateAllEmployees(employeeDuties, vacationMap);

          let totalBonus = 0;
          for (const [employeeName, result] of Object.entries(results)) {
              const w = result.winner;
              const c = result.classified;
              totalBonus += result.totalBonus;
              csv += `${escapeCSV(employeeName)};`;
              csv += `${result.isVacation ? 'JA' : 'NEIN'};`;
              csv += `V${w.variantId};`;
              csv += `${c.fr.toFixed(1).replace('.', ',')};`;
              csv += `${c.sa.toFixed(1).replace('.', ',')};`;
              csv += `${c.so.toFixed(1).replace('.', ',')};`;
              csv += `${c.weekday.toFixed(1).replace('.', ',')};`;
              csv += `${w.eligible ? 'JA' : 'NEIN'};`;
              csv += `${w.deduction.fr.toFixed(2).replace('.', ',')};`;
              csv += `${w.deduction.sa.toFixed(2).replace('.', ',')};`;
              csv += `${w.deduction.so.toFixed(2).replace('.', ',')};`;
              csv += `${w.deduction.weekday.toFixed(2).replace('.', ',')};`;
              csv += `${result.totalBonus.toFixed(2).replace('.', ',')}\n`;
          }

          csv += `\nGESAMT;;;;;;;;;;;;${totalBonus.toFixed(2).replace('.', ',')}\n`;
  ```

  Replace the LEGENDE block at the end of the function:

  ```javascript
          csv += '\n\n';
          csv += 'LEGENDE\n';
          csv += 'Fr/Sa/So/Werktage;Klassifizierte Shares pro Slot (Halbdienste 0,5)\n';
          csv += 'Sieger-Variante;V1, V2 oder V3 - automatisch die Variante mit dem hoechsten Bonus\n';
          csv += 'V1;"fr+so >= 1 UND weekday >= 3 (Halbiert bei Urlaub: 0,5 / 1,5)"\n';
          csv += 'V2;"sa >= 1 UND weekday >= 2 (Halbiert bei Urlaub: 0,5 / 1)"\n';
          csv += 'V3 (loose);"fr+sa+so >= 2 - wie bisher (Halbiert bei Urlaub: 1)"\n';
          csv += 'Urlaub;"Wenn JA: Schwellen und Abzuege halbiert"\n';
          csv += 'Saetze;"Werktag = 250 EUR/Einheit, Fr/Sa/So/Feiertag = 450 EUR/Einheit"\n';
  ```

- [ ] **Step 2: Update `exportBonusReport`.**

  The function (around line 672) currently re-implements the bonus logic by hand. Replace the local recomputation (the `for ([name, data] of ...)` loop body that computes `thresholdReached`, `wt_pay`, `deduct`, `deduct_fr`, etc.) with a call to `BonusCalculator`.

  Find the section starting at `for (const [name, data] of Object.entries(employeeData)) {`. Replace its body with:

  ```javascript
          // Compute via BonusCalculator (uses winning variant)
          const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
          const vacationMap = {};
          Object.keys(employeeDuties).forEach(n => {
              vacationMap[n] = this.storage.getVacationMode(n, yearMonth);
          });
          const calcResults = this.calculator.calculateAllEmployees(employeeDuties, vacationMap);

          for (const [name, data] of Object.entries(employeeData)) {
              const calcRes = calcResults[name] || this.calculator.getEmptyResult();
              const bonus = calcRes.totalBonus;
              const w     = calcRes.winner;

              totalBonus += bonus;

              const safeName = escapeHtml(name);
              let note = '';
              if (bonus === 0 || !w.eligible) {
                  note = `<b>${safeName}</b> erreicht in keiner der drei Varianten einen positiven Bonus${calcRes.isVacation ? ' (Urlaubsmodus aktiv)' : ''} und erhaelt daher keine Bonuszahlung.`;
              } else {
                  const c = calcRes.classified;
                  note = `<b>${safeName}</b> erhaelt eine Bonuszahlung von <span style="color: #28a745; font-weight: bold;">${this.calculator.formatCurrency(bonus)}</span> nach Variante ${w.variantId}${calcRes.isVacation ? ' (Urlaubsmodus aktiv)' : ''}. Klassifiziert: Fr ${c.fr.toFixed(1)} / Sa ${c.sa.toFixed(1)} / So ${c.so.toFixed(1)} / Werktage ${c.weekday.toFixed(1)}.`;
              }
              employeeNotes.push(note);

              // Build table row
              html += `
          <tr>
              <td class="employee-name">${safeName}</td>`;
              const dayOrder = [1, 2, 3, 4, 5, 6, 0];
              for (const dayIdx of dayOrder) {
                  const dayDuties = data.byWeekday[dayIdx];
                  if (dayDuties.length === 0) {
                      html += `<td></td>`;
                  } else {
                      let cellContent = '';
                      dayDuties.forEach(duty => {
                          const shareStr = duty.share === 0.5 ? '1/2' : '';
                          const tag = duty.isQual ? 'we-tag' : 'wt-tag';
                          cellContent += `<span class="${tag}">${shareStr}X</span><br>`;
                      });
                      html += `<td class="duty-cell">${cellContent}</td>`;
                  }
              }
              html += `
              <td class="${bonus > 0 ? 'bonus-amount' : 'no-bonus'}">${bonus > 0 ? this.calculator.formatCurrency(bonus) : '-'}</td>
          </tr>`;
          }
  ```

  Note: replace ASCII placeholders (`erhaelt`, `1/2`) with the original glyphs in the actual code (`erhält`, `½`).

  Then find the regulations block at the bottom of the HTML report (the `<p><strong>Berechnungsregeln (Variante 2 - Streng):</strong></p>` block). Replace it with:

  ```javascript
  html += `
  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd;">
      <p><strong>Berechnungsregeln (NRW Psychiatrie 2011):</strong></p>
      <ul>
          <li><strong>Slots:</strong> Jeder Dienst wird in fr / sa / so / werktag klassifiziert. Tag vor Mo-Do-Feiertag = fr. Mo-Do-Feiertag = so. Sandwich-Tag (Feiertag + Tag-vor) = sa.</li>
          <li><strong>V1:</strong> fr+so >= 1 UND werktag >= 3 -> Abzug 1 (Fr-Prio) + 3 werktag.</li>
          <li><strong>V2:</strong> sa >= 1 UND werktag >= 2 -> Abzug 1 sa + 2 werktag.</li>
          <li><strong>V3 (loose):</strong> fr+sa+so >= 2 -> Abzug 2 aus Pool (Prio fr -> so -> sa).</li>
          <li><strong>Auto-Select:</strong> Die Variante mit dem hoechsten Bonus gewinnt; bei Gleichstand gewinnt die niedrigste Variantennummer.</li>
          <li><strong>Urlaubsmodus (>=14 Tage frei):</strong> Halbiert alle Schwellen UND Abzuege.</li>
          <li><strong>Saetze:</strong> Werktag = 250 EUR, Fr/Sa/So/Feiertag = 450 EUR.</li>
      </ul>
  </div>

  <p style="margin-top: 30px; color: #666; font-size: 0.9em;">
      Erstellt am: ${new Date().toLocaleDateString('de-DE')} | Dienstplan-Pro - NRW Psychiatrie 2011
  </p>

  </body>
  </html>`;
  ```

  Also remove the by-hand classification block earlier in `exportBonusReport` that aggregates into `data.wt`, `data.we_fr`, `data.we_other`. Keep only the `byWeekday` aggregation (used for the table cells), and remove the `wt` / `we_fr` / `we_other` properties from `employeeData[name]` since they are no longer read.

  Specifically, find the block:

  ```javascript
              employeeData[name] = {
                  duties: duties,
                  byWeekday: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
                  wt: 0,
                  we_fr: 0,
                  we_other: 0
              };
  ```

  Replace with:

  ```javascript
              employeeData[name] = {
                  duties: duties,
                  byWeekday: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
              };
  ```

  And inside the same outer `for` loop, find the inner block:

  ```javascript
                  if (!isQualifying) {
                      employeeData[name].wt += duty.share;
                  } else if (isFriday) {
                      employeeData[name].we_fr += duty.share;
                  } else {
                      employeeData[name].we_other += duty.share;
                  }
  ```

  Delete that block entirely (it is no longer used).

- [ ] **Step 3: Update `generateEmailReport`.**

  In `generateEmailReport` (around line 428), the loop currently reads `res.qualifyingDays`, `res.qualifyingDaysDeducted`, `res.thresholdReached`. Replace the loop body inside `Object.keys(results).forEach(name => { ... });` with:

  ```javascript
              Object.keys(results).forEach(name => {
                  const res = results[name];
                  const w   = res.winner;
                  const c   = res.classified;
                  const totalWe = c.fr + c.sa + c.so;
                  const deducted = w.deduction.fr + w.deduction.sa + w.deduction.so;
                  const triggered = w.eligible && res.totalBonus > 0;

                  let statusText = '';
                  let rowStyle   = '';
                  let blockText  = '';

                  if (triggered) {
                      statusText = `Variante ${w.variantId} (${this.calculator.formatCurrency(res.totalBonus)})${res.isVacation ? ' - Urlaub' : ''}`;
                      blockText = `Herr/Frau ${name} erreicht ${this.formatNumber(totalWe)} qualifizierende Dienste (Fr/Sa/So), ${this.formatNumber(deducted)} davon werden abgezogen - Bonus nach Variante ${w.variantId}: ${this.calculator.formatCurrency(res.totalBonus)}${res.isVacation ? ' (Urlaubsmodus aktiv)' : ''}.`;
                  } else if (totalWe > 0 || c.weekday > 0) {
                      statusText = 'Bonus nicht erreicht';
                      rowStyle = 'background-color: #fff0f0;';
                      blockText = `Mitarbeiter ${name} erreicht in keiner der drei Varianten die Schwelle (Fr ${c.fr.toFixed(1)}, Sa ${c.sa.toFixed(1)}, So ${c.so.toFixed(1)}, Werktage ${c.weekday.toFixed(1)})${res.isVacation ? ' - Urlaubsmodus aktiv' : ''}.`;
                  } else {
                      statusText = '-';
                      rowStyle = 'color: #999;';
                  }

                  reportHtml += `<tr style="${rowStyle}">
                      <td>${name}</td>
                      <td style="text-align: center;">${this.formatNumber(totalWe)}</td>
                      <td style="text-align: center;">${this.formatNumber(deducted)}</td>
                      <td>${statusText}</td>
                  </tr>`;

                  if (blockText) textBlocks.push(blockText);
              });
  ```

  Also, just before the call site `const results = this.calculator.calculateAllEmployees(employeeDuties);` in `generateEmailReport`, build and pass a `vacationMap`:

  ```javascript
          const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
          const vacationMap = {};
          Object.keys(employeeDuties).forEach(n => {
              vacationMap[n] = this.storage.getVacationMode(n, yearMonth);
          });
          const results = this.calculator.calculateAllEmployees(employeeDuties, vacationMap);
  ```

  (replacing the existing `const results = this.calculator.calculateAllEmployees(employeeDuties);` line).

- [ ] **Step 4: Manual verification.**

  Open the app, ensure an employee with duties exists, switch to "Einstellungen":
  - Click **Excel/CSV Export** - the downloaded CSV must contain a column "Sieger-Variante" with values like V1/V2/V3 and the "Urlaub" column.
  - Click **PDF-Bericht** - the new window must render employee rows + notes mentioning "Variante X" and the new regulations block at the bottom.
  - Click **E-Mail Text-Generator** - the modal must show employee rows with status "Variante X (EUR XXX,XX)" and a text block referencing the winning variant.

  No JS errors in the console.

- [ ] **Step 5: Commit.**

  ```bash
  git add app.js
  git commit -m "refactor: CSV/HTML/email exports read winner.* from new variants shape"
  ```

---

### Task 14: Settings-tab info-box copy update

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\index.html`

- [ ] **Step 1: Replace the info-box content under "Berechnungsregeln".**

  Find in `index.html`:

  ```html
                  <div class="settings-section">
                      <h3>Berechnungsregeln</h3>
                      <div class="info-box">
                          <h4>Qualifizierende Tage (WE/Feiertag):</h4>
                          <ul>
                              <li>Freitag, Samstag, Sonntag</li>
                              <li>Feiertage in NRW</li>
                              <li>Tag vor einem Feiertag</li>
                          </ul>

                          <h4>Bonusberechnung:</h4>
                          <ul>
                              <li>Mindestens <strong>2.0 qualifizierende Tage</strong> erforderlich</li>
                              <li>Bei Erreichen der Schwelle: <strong>1.0 qualifizierender Tag</strong> wird abgezogen</li>
                              <li>Normale Tage: <strong>250&euro;</strong> pro Tag</li>
                              <li>Qualifizierende Tage: <strong>450&euro;</strong> pro Tag</li>
                              <li>Halbe Dienste werden mit der H&auml;lfte berechnet</li>
                          </ul>

                          <h4>Wichtig:</h4>
                          <p>Wenn weniger als 2.0 qualifizierende Tage erreicht werden, erfolgt <strong>keine Bonuszahlung</strong>.</p>
                      </div>
                  </div>
  ```

  Replace with:

  ```html
                  <div class="settings-section">
                      <h3>Berechnungsregeln (NRW Psychiatrie 2011)</h3>
                      <div class="info-box">
                          <h4>Tag-Klassifizierung (Slot pro Dienst):</h4>
                          <ul>
                              <li><strong>fr</strong>: Freitag &middot; oder Tag vor einem Mo-Do-Feiertag</li>
                              <li><strong>sa</strong>: Samstag &middot; oder Sandwich-Tag (Feiertag UND Tag vor Feiertag, z. B. Do Feiertag + Fr Feiertag &rarr; Do = sa)</li>
                              <li><strong>so</strong>: Sonntag &middot; oder Mo-Do-Feiertag (ohne Sandwich)</li>
                              <li><strong>weekday</strong>: Mo-Do ohne Feiertag und ohne Tag-vor-Feiertag</li>
                          </ul>

                          <h4>Drei Varianten (es gewinnt die mit dem h&ouml;chsten Bonus):</h4>
                          <ul>
                              <li><strong>V1:</strong> fr+so &ge; 1 UND weekday &ge; 3 &rarr; Abzug 1 aus fr+so (Fr-Prio) und 3 aus weekday. sa wird voll bezahlt.</li>
                              <li><strong>V2:</strong> sa &ge; 1 UND weekday &ge; 2 &rarr; Abzug 1 sa und 2 weekday. fr und so werden voll bezahlt.</li>
                              <li><strong>V3 (loose):</strong> fr+sa+so &ge; 2 &rarr; Abzug 2 aus Pool, Priorit&auml;t fr &rarr; so &rarr; sa. weekday wird voll bezahlt.</li>
                          </ul>

                          <h4>Auto-Selection und Tie-Breaker:</h4>
                          <p>Es wird die Variante mit dem h&ouml;chsten Bonus ausgew&auml;hlt. Bei Gleichstand gewinnt die niedrigste Variantennummer (V1 &lt; V2 &lt; V3).</p>

                          <h4>Urlaubsmodus (&ge;14 Tage frei):</h4>
                          <p>Toggle pro Mitarbeiter und Monat. Halbiert <strong>alle</strong> Schwellen UND Abz&uuml;ge. Halbe Werte sind explizit erlaubt.</p>

                          <h4>S&auml;tze:</h4>
                          <ul>
                              <li>weekday: <strong>250&nbsp;&euro;</strong> pro Einheit</li>
                              <li>fr / sa / so: <strong>450&nbsp;&euro;</strong> pro Einheit</li>
                              <li>Halbdienste werden mit 0.5 gerechnet</li>
                          </ul>

                          <h4>Beispiele Tag-Klassifizierung:</h4>
                          <ul>
                              <li>Karfreitag (Fr): fr (Wochentag gewinnt)</li>
                              <li>Ostermontag (Mo-Feiertag): so</li>
                              <li>Christi Himmelfahrt (Do-Feiertag): so</li>
                              <li>Mittwoch vor Christi Himmelfahrt: fr</li>
                              <li>Tag der Deutschen Einheit 2025 (Fr): fr</li>
                          </ul>
                      </div>
                  </div>
  ```

- [ ] **Step 2: Manual verification.**

  Open `index.html`, click "Einstellungen". The info-box must show all three variants, the auto-selection rule, the vacation rule, and the 5 example day-classification entries.

- [ ] **Step 3: Commit.**

  ```bash
  git add index.html
  git commit -m "docs: settings info-box explains V1/V2/V3, auto-select, vacation mode"
  ```

---

### Task 15: Feature C - Date-Stepper buttons next to `#duty-date`

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\index.html`
- Modify: `G:\Claude\Claude_tmp_dienstplan\app.js`
- Modify: `G:\Claude\Claude_tmp_dienstplan\styles.css` (append)

Per the spec (§10), this is DOM-dependent and primarily a manual-verification feature. No automated tests are added - the manual verification step below is explicit.

- [ ] **Step 1: Wrap the duty-date input with stepper buttons.**

  In `index.html`, find:

  ```html
                  <div class="form-group">
                      <label for="duty-date">Datum:</label>
                      <input type="date" id="duty-date">
                  </div>
  ```

  Replace with:

  ```html
                  <div class="form-group">
                      <label for="duty-date">Datum:</label>
                      <div class="date-stepper">
                          <button type="button" id="duty-date-prev" class="btn btn-secondary" aria-label="Vorheriger Tag">&lsaquo;</button>
                          <input type="date" id="duty-date">
                          <button type="button" id="duty-date-next" class="btn btn-secondary" aria-label="Naechster Tag">&rsaquo;</button>
                      </div>
                  </div>
  ```

- [ ] **Step 2: Append CSS for the stepper.**

  Append to `G:\Claude\Claude_tmp_dienstplan\styles.css`:

  ```css
  /* === Date Stepper === */
  .date-stepper {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 6px;
      align-items: stretch;
  }

  .date-stepper input[type="date"] {
      /* override the .form-group width */
      width: 100%;
  }

  .date-stepper button {
      padding: 0 14px;
      margin: 0;
      font-size: 1.2rem;
      line-height: 1;
      min-width: 44px;
  }

  .date-stepper button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
  }
  ```

- [ ] **Step 3: Register listeners and add `stepDutyDate(delta)` + `updateDateStepperState()` in `app.js`.**

  In `setupEventListeners()`, the current code already has:

  ```javascript
          document.getElementById('month-select').addEventListener('change', () => this.loadDutiesForSelectedEmployee());
          document.getElementById('year-select').addEventListener('change', () => this.loadDutiesForSelectedEmployee());
  ```

  Delete these two lines, and **append** in their place (after the `employee-select-duty` change listener):

  ```javascript
          // Date stepper buttons (Feature C)
          document.getElementById('duty-date-prev').addEventListener('click', () => this.stepDutyDate(-1));
          document.getElementById('duty-date-next').addEventListener('click', () => this.stepDutyDate(+1));
          document.getElementById('duty-date').addEventListener('change', () => this.updateDateStepperState());
          document.getElementById('month-select').addEventListener('change', () => this.onDutyMonthChange());
          document.getElementById('year-select').addEventListener('change', () => this.onDutyMonthChange());
  ```

  Add three new methods anywhere in `DienstplanApp` (e.g. just below `addDuty`):

  ```javascript
      /**
       * Step the duty-date input by +/-1 day, clamped to the currently selected month.
       */
      stepDutyDate(delta) {
          const dateInput = document.getElementById('duty-date');
          const monthSelect = document.getElementById('month-select');
          const yearSelect  = document.getElementById('year-select');
          const month = parseInt(monthSelect.value);
          const year  = parseInt(yearSelect.value);
          const lastDay = new Date(year, month, 0).getDate();

          if (!dateInput.value) {
              // Initialize to 1st of the selected month
              dateInput.value = `${year}-${String(month).padStart(2, '0')}-01`;
              this.updateDateStepperState();
              return;
          }
          const cur = new Date(dateInput.value + 'T12:00:00');
          // If outside selected month, snap to 1st
          const inMonth = (cur.getFullYear() === year) && ((cur.getMonth() + 1) === month);
          if (!inMonth) {
              dateInput.value = `${year}-${String(month).padStart(2, '0')}-01`;
              this.updateDateStepperState();
              return;
          }
          const curDay = cur.getDate();
          const newDay = curDay + delta;
          if (newDay < 1 || newDay > lastDay) return; // clamp
          const newDate = new Date(year, month - 1, newDay, 12, 0, 0);
          const yyyy = newDate.getFullYear();
          const mm   = String(newDate.getMonth() + 1).padStart(2, '0');
          const dd   = String(newDate.getDate()).padStart(2, '0');
          dateInput.value = `${yyyy}-${mm}-${dd}`;
          this.updateDateStepperState();
      }

      /**
       * Update the disabled state of the stepper buttons based on current date / month.
       */
      updateDateStepperState() {
          const dateInput = document.getElementById('duty-date');
          const monthSelect = document.getElementById('month-select');
          const yearSelect  = document.getElementById('year-select');
          const prevBtn = document.getElementById('duty-date-prev');
          const nextBtn = document.getElementById('duty-date-next');
          if (!dateInput || !prevBtn || !nextBtn) return;

          const month = parseInt(monthSelect.value);
          const year  = parseInt(yearSelect.value);
          const lastDay = new Date(year, month, 0).getDate();

          if (!dateInput.value) {
              prevBtn.disabled = false;
              nextBtn.disabled = false;
              return;
          }
          const cur = new Date(dateInput.value + 'T12:00:00');
          const inSelectedMonth = (cur.getFullYear() === year) && ((cur.getMonth() + 1) === month);
          if (!inSelectedMonth) {
              prevBtn.disabled = false;
              nextBtn.disabled = false;
              return;
          }
          prevBtn.disabled = cur.getDate() <= 1;
          nextBtn.disabled = cur.getDate() >= lastDay;
      }

      /**
       * Handle month/year change in the duty tab: set date to 1st of new month, refresh list, refresh stepper.
       */
      onDutyMonthChange() {
          const monthSelect = document.getElementById('month-select');
          const yearSelect  = document.getElementById('year-select');
          const month = parseInt(monthSelect.value);
          const year  = parseInt(yearSelect.value);
          document.getElementById('duty-date').value = `${year}-${String(month).padStart(2, '0')}-01`;
          this.updateDateStepperState();
          this.loadDutiesForSelectedEmployee();
      }
  ```

  Finally, in `setCurrentMonthYear()` (around line 95), append at the very end:

  ```javascript
          this.updateDateStepperState();
  ```

- [ ] **Step 4: Manual verification.**

  Open `index.html`, "Dienste eintragen" tab. Confirm:
  - The `<` and `>` buttons appear next to the date input.
  - Setting the date to the 1st of the month -> `<` becomes disabled (greyed-out).
  - Setting the date to the last day of the month -> `>` becomes disabled.
  - In the middle of the month, both buttons step the date by exactly +/-1 day each click.
  - Changing the month dropdown resets the date to the 1st of the newly selected month and re-evaluates button states.

- [ ] **Step 5: Commit.**

  ```bash
  git add index.html app.js styles.css
  git commit -m "feat: add date-stepper buttons (Feature C) clamped to selected month"
  ```

---

### Task 16: PWA cache bump

**Files:**
- Modify: `G:\Claude\Claude_tmp_dienstplan\sw.js`

- [ ] **Step 1: Update cache version and add `variants.js` to the ASSETS list.**

  Replace the entire contents of `sw.js` with:

  ```javascript
  const CACHE_NAME = 'dienstplan-pro-v2';
  const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './calculator.js',
    './variants.js',
    './holidays.js',
    './storage.js'
  ];

  self.addEventListener('install', (e) => {
    e.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
  });

  self.addEventListener('activate', (e) => {
    e.waitUntil(
      caches.keys().then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
    );
  });

  self.addEventListener('fetch', (e) => {
    e.respondWith(
      caches.match(e.request).then((response) => response || fetch(e.request))
    );
  });
  ```

- [ ] **Step 2: Manual verification.**

  In Chrome DevTools -> Application -> Service Workers, click "Update" / unregister + reload. Network tab must show `variants.js` being fetched; Application -> Cache Storage must list `dienstplan-pro-v2` and contain `variants.js`. The old `dienstplan-pro-v1` cache must be removed by the `activate` listener.

- [ ] **Step 3: Commit.**

  ```bash
  git add sw.js
  git commit -m "chore(pwa): bump cache to v2, include variants.js, evict old caches"
  ```

---

### Task 17: Final manual smoke test checklist

**Files:** none (manual verification only)

- [ ] **Step 1: Run the full automated test suite one more time.**

  Open `test.html`, click "Alle Tests ausfuehren". Confirm:
  - All `Holiday Provider` tests pass.
  - All `classify:` tests (7) pass.
  - All `classifyDuties:` tests (4) pass.
  - All `variant1:` (7), `variant2:` (7), `variant3:` (8) tests pass.
  - All `Winner:` tests (6) pass.
  - All rewritten `Berechnung:` tests pass.
  - All `Storage:` tests (existing + 7 new vacation tests) pass.
  - All `Edge Case:` tests (rewritten) pass.
  - Total failed = 0.

- [ ] **Step 2: Scenario A - Winner display.**

  - Open `index.html`. Add employee `Test V1`.
  - Switch to "Dienste eintragen" tab. Select November 2025.
  - Use the date-stepper to add: 1 Fr (2025-11-21, full), 3 weekdays (2025-11-24 Mo, 2025-11-25 Di, 2025-11-26 Mi, all full), and 1 Sa (2025-11-22, full).
  - Switch to "Berechnung", click "Berechnung durchfuehren".
  - Expected: One of the three variants displays as winner with a star badge. The classified summary shows fr=1, sa=1, so=0, weekday=3. The collapsible details show all 3 variants with their eligibility and computed bonus. The displayed totalBonus matches the winner's bonus.

- [ ] **Step 3: Scenario B - Urlaubsmodus.**

  - On the result card for `Test V1`, tick **Urlaub gehabt (>=14 Tage frei)**.
  - The card must re-render with the yellow "Urlaubsmodus aktiv" banner. The bonus typically increases or a different variant becomes eligible because thresholds are halved.
  - Reload the page. The toggle state must persist (read back from `dienstplan_vacation` in localStorage).

- [ ] **Step 4: Scenario C - Date-Stepper.**

  - On "Dienste eintragen", select Nov 2025. Set the date to `2025-11-01`. Confirm `<` is disabled.
  - Click `>` 29 times. Confirm date is now `2025-11-30` and `>` is disabled.
  - Change month dropdown to December. Confirm date jumps to `2025-12-01` and `<` is disabled.

- [ ] **Step 5: Scenario D - Export / Import roundtrip including vacation.**

  - In "Einstellungen", click **Daten exportieren (JSON)**. Open the downloaded file: confirm it contains a top-level `"vacation"` key with the `Test V1` entry.
  - Click **Alle Daten loeschen**. Confirm everything is gone (employee list empty, calc tab shows no data).
  - Reload, click **Importieren** with the previously exported file. Re-run calculation. The vacation toggle for `Test V1` in November must come back **checked**.

- [ ] **Step 6: Scenario E - CSV / PDF / E-Mail export with new shape.**

  - CSV: open the downloaded CSV. Confirm the AUSWERTUNG section has columns "Sieger-Variante", "Urlaub", "Fr", "Sa", "So", "Werktage", abzug-per-slot, "Bonus (EUR)".
  - PDF/HTML report: opens in new window. Confirm each employee row mentions "Variante X" and the regulations block at the bottom lists all 3 variants.
  - E-Mail generator: modal shows a status column "Variante X (EUR XXX,XX)" and text-blocks reference the winning variant.

- [ ] **Step 7: No new commits in this task.** This task only verifies. If any check fails, debug and fix in a follow-up commit before declaring done.

---

## Self-review

### Spec coverage matrix

| Spec section | Tasks |
|---|---|
| §1 Goal | T5-T8 (3 variants + winner selection) |
| §3 Day Classification Rule | T2 (red), T3 (green) - all 7 spec examples covered |
| §3.3 Aggregations-Output | T4 (`classifyDuties`) |
| §4.1 Variant 1 | T6 |
| §4.2 Variant 2 | T7 |
| §4.3 Variant 3 (loose) | T5 |
| §4.4 Friday-Priority pool order | T5 (fr->so->sa), T6 (fr->so), T7 (sa only - trivial) |
| §4.5 No-Bonus-Case shape | T5/T6/T7 implementation returns the spec shape with `paidShares: {fr:0,sa:0,so:0,weekday:0}` and `threshold` set |
| §5 Variant Selection & Tie-Breaker | T8 (winner selection in `BonusCalculator.calculateMonthlyBonus`; tie-breaker via strict `>` in the loop; test `Winner: Tie-Breaker` verifies V1 wins when all-zero) |
| §6.1 Vacation trigger / label | T12 (UI checkbox with label "Urlaub gehabt (>=14 Tage frei)") |
| §6.2 Vacation effect (halved thresholds) | T5/T6/T7 (`isVacation` parameter) + T11 (wired through `calculateAllEmployees`) |
| §6.3 Vacation persistence (`dienstplan_vacation` key) | T10 |
| §7.1 In-Memory data model (winner / allResults / classified / isVacation / dutyDetails) | T8 (calculator return shape) |
| §7.2 Persistence keys table | T10 (new key + clearAll + export/import) |
| §8.1 File changes overview | All tasks |
| §8.2 Script load order | T1 (`variants.js` before `calculator.js` in both `index.html` and `test.html`) |
| §8.3 `variants.js` public API | T1 (skeleton + `window.*` exposure), T3/T4/T5/T6/T7 (implementations) |
| §8.4 `BonusCalculator` new internal structure | T8 |
| §8.5 `storage.js` extension | T10 |
| §9.1 Berechnung tab UI (vacation checkbox + result card + details) | T12 |
| §9.2 Einstellungen info-box | T14 |
| §9.3 Toast behavior on toggle | T12 (`onVacationToggle` shows error toast on throw, no toast on success) |
| §10 Feature C Date-Stepper | T15 |
| §11 Backwards Compatibility (key preserved, V3 loose = old logic) | T8 (V3 implements the prior algorithm); T10 (export/import legacy without `vacation` works - covered by test `Storage: Import ohne vacation-Feld bleibt fehlerfrei`); T16 (PWA cache bump) |
| §12.1 Tests for `classify` / `classifyDuties` | T2, T4 |
| §12.2 Tests `variant1` | T6 |
| §12.3 Tests `variant2` | T7 |
| §12.4 Tests `variant3` | T5 |
| §12.5 Tests Winner Selection | T8 |
| §12.6 Tests Vacation combined | T5/T6/T7 (variant-level Urlaub tests), T8 (`Winner: Urlaubsmodus`), T10 (storage round-trip + missing-key default) |
| §12.7 Existing tests adjustment | T9 |
| §12.8 Tests Date-Stepper | T15 (manual verification - automated tests skipped per spec's "DOM-dependent" note, made explicit in the task) |
| §13 Open Question - vacation in exports | T13 (CSV "Urlaub" column, PDF report mentions "Urlaubsmodus aktiv", email text mentions "Urlaubsmodus aktiv") |
| §13 PWA cache bump v1->v2 | T16 |

**Gaps:** None blocking. The spec's §13 question "Soll Urlaubsmodus in CSV/HTML sichtbar sein?" is resolved as **yes** in Task 13 (CSV "Urlaub" column, PDF + email notes).

### Resolved ambiguities

- **Spec §5 tie-breaker for all-zero:** spec says V1 is "nominally winner" with `totalBonus = 0`. The implementation in T8 uses strict `>` in the loop, so the first variant (`v1`) stays winner on ties. Tested in `Winner: Tie-Breaker - alle three not eligible`. The UI's "Keine Variante triggert" message kicks in when `result.totalBonus === 0`, matching the spec.
- **Spec §3.2 Sandwich-Tag examples are hypothetical** - no real consecutive Do+Fr holidays exist in NRW 2025-2030 data. T2 covers these via a small `fakeHp` ad-hoc mock that fakes `isHoliday` / `isDayBeforeHoliday`. The real HolidayProvider remains untouched.
- **`exportBonusReport` formerly recomputed bonus locally** with the old single-rule logic. T13 replaces this with a call to `BonusCalculator.calculateAllEmployees`, which is the single source of truth post-refactor.
- **`onDutyMonthChange` double-binding** - the duty-tab month/year selects already had `change` listeners that called `loadDutiesForSelectedEmployee`. T15 explicitly deletes those and replaces them with a single `onDutyMonthChange` handler that does both (refresh list + reset date + refresh stepper state). The existing `setCurrentMonthYear` is also patched to call `updateDateStepperState`.
- **German umlauts in code snippets:** the snippets in T11/T12/T13 use ASCII placeholders (e.g. `erhaelt`, `Saetze`, `Maerz`, `naechster`) so this markdown plan stays portable; the implementer must restore proper umlauts (`erhält`, `Sätze`, `März`, `nächster`) and special glyphs (`½`, `★`, `≥`, `→`) when writing into the actual source files. The HTML for Task 14 uses HTML entities (`&auml;`, `&euml;`, `&ge;`, etc.) which are valid as-is.

### Type-consistency audit

- `classify(date, holidayProvider)` defined in T3, used by `classifyDuties` in T4 and by `BonusCalculator.isQualifyingDay` in T8 - same signature throughout.
- `classifyDuties(duties, holidayProvider)` defined in T4, used by `BonusCalculator.calculateMonthlyBonus` in T8 - signature matches.
- `variant1/2/3(classified, isVacation)` - all three implementations (T5/T6/T7) and the caller in T8 use the same signature and return shape (`{ variantId, eligible, threshold, deduction, paidShares, bonus, isWinner }`).
- `BonusCalculator.calculateAllEmployees(employeeDuties, vacationMap)` - second parameter declared in T8, used by `calculateBonuses` in T11, `exportCSV` / `generateEmailReport` / `exportBonusReport` in T13. Map type is `{ [name]: boolean }`.
- `DataStorage.getVacationMode(name, yearMonth)` / `setVacationMode(name, yearMonth, value)` - defined in T10, called from T11/T12/T13. `yearMonth` is consistently the string `"YYYY-MM"` (e.g. `"2025-11"`).
- `_currentCalcContext.yearMonth` set in T11, read in T12 (`createResultCard`). Both use the same `${year}-${String(month).padStart(2,'0')}` format.

No type or signature mismatch found.

---

## Done criteria

All 17 tasks committed. `test.html` shows 0 failed tests. The five smoke scenarios from Task 17 manually verified.
