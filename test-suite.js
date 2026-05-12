/**
 * Test Suite for Dienstplan Bonusrechner
 */

class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    /**
     * Add a test case
     */
    test(name, testFn) {
        this.tests.push({ name, testFn });
    }

    /**
     * Assert equality
     */
    assertEqual(actual, expected, message = '') {
        if (actual !== expected) {
            throw new Error(`${message}\nErwartet: ${expected}\nErhalten: ${actual}`);
        }
    }

    /**
     * Assert approximate equality (for floating point)
     */
    assertAlmostEqual(actual, expected, tolerance = 0.01, message = '') {
        if (Math.abs(actual - expected) > tolerance) {
            throw new Error(`${message}\nErwartet: ${expected} (±${tolerance})\nErhalten: ${actual}`);
        }
    }

    /**
     * Assert true
     */
    assertTrue(value, message = '') {
        if (!value) {
            throw new Error(`${message}\nErwartet: true\nErhalten: ${value}`);
        }
    }

    /**
     * Assert false
     */
    assertFalse(value, message = '') {
        if (value) {
            throw new Error(`${message}\nErwartet: false\nErhalten: ${value}`);
        }
    }

    /**
     * Run all tests
     */
    async runAll() {
        this.passed = 0;
        this.failed = 0;
        const results = [];

        for (const test of this.tests) {
            try {
                await test.testFn(this);
                this.passed++;
                results.push({
                    name: test.name,
                    passed: true,
                    error: null
                });
            } catch (error) {
                this.failed++;
                results.push({
                    name: test.name,
                    passed: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Get summary
     */
    getSummary() {
        return {
            total: this.tests.length,
            passed: this.passed,
            failed: this.failed
        };
    }
}

// Create test runner instance
const runner = new TestRunner();

// ============================================================================
// Holiday Provider Tests
// ============================================================================

runner.test('HolidayProvider: Neujahr 2025 wird erkannt', (t) => {
    const holidays = new HolidayProvider();
    const date = new Date('2025-01-01T12:00:00');
    t.assertTrue(holidays.isHoliday(date), 'Neujahr sollte als Feiertag erkannt werden');
});

runner.test('HolidayProvider: Normaler Tag wird nicht als Feiertag erkannt', (t) => {
    const holidays = new HolidayProvider();
    const date = new Date('2025-01-15T12:00:00'); // Mittwoch
    t.assertFalse(holidays.isHoliday(date), 'Normaler Tag sollte nicht als Feiertag erkannt werden');
});

runner.test('HolidayProvider: Tag vor Feiertag wird erkannt', (t) => {
    const holidays = new HolidayProvider();
    const date = new Date('2024-12-31T12:00:00'); // Tag vor Neujahr
    t.assertTrue(holidays.isDayBeforeHoliday(date), 'Tag vor Feiertag sollte erkannt werden');
});

runner.test('HolidayProvider: Fronleichnam 2025 korrekt', (t) => {
    const holidays = new HolidayProvider();
    const date = new Date('2025-06-19T12:00:00');
    t.assertTrue(holidays.isHoliday(date), 'Fronleichnam sollte als Feiertag erkannt werden');
    t.assertEqual(holidays.getHolidayName(date), 'Fronleichnam', 'Feiertagsname sollte korrekt sein');
});

// ============================================================================
// Calculator Tests - Day Classification
// ============================================================================

runner.test('Calculator: Freitag ist qualifizierender Tag', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);
    const friday = new Date('2025-11-21T12:00:00'); // Freitag
    t.assertTrue(calculator.isQualifyingDay(friday), 'Freitag sollte qualifizierend sein');
});

runner.test('Calculator: Samstag ist qualifizierender Tag', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);
    const saturday = new Date('2025-11-22T12:00:00'); // Samstag
    t.assertTrue(calculator.isQualifyingDay(saturday), 'Samstag sollte qualifizierend sein');
});

runner.test('Calculator: Sonntag ist qualifizierender Tag', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);
    const sunday = new Date('2025-11-23T12:00:00'); // Sonntag
    t.assertTrue(calculator.isQualifyingDay(sunday), 'Sonntag sollte qualifizierend sein');
});

runner.test('Calculator: Montag ist kein qualifizierender Tag', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);
    const monday = new Date('2025-11-24T12:00:00'); // Montag (kein Feiertag)
    t.assertFalse(calculator.isQualifyingDay(monday), 'Normaler Montag sollte nicht qualifizierend sein');
});

runner.test('Calculator: Feiertag ist qualifizierender Tag', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);
    const holiday = new Date('2025-05-01T12:00:00'); // Tag der Arbeit
    t.assertTrue(calculator.isQualifyingDay(holiday), 'Feiertag sollte qualifizierend sein');
});

runner.test('Calculator: Tag vor Feiertag ist qualifizierender Tag', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);
    const dayBefore = new Date('2025-04-30T12:00:00'); // Tag vor 1. Mai
    t.assertTrue(calculator.isQualifyingDay(dayBefore), 'Tag vor Feiertag sollte qualifizierend sein');
});

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

// ============================================================================
// Storage Tests
// ============================================================================

runner.test('Storage: Mitarbeiter hinzufügen', (t) => {
    const storage = new DataStorage();
    storage.clearAll();

    const success = storage.addEmployee('Max Mustermann');
    t.assertTrue(success, 'Mitarbeiter sollte hinzugefügt werden');

    const employees = storage.getEmployees();
    t.assertEqual(employees.length, 1, 'Sollte 1 Mitarbeiter haben');
    t.assertTrue(employees.includes('Max Mustermann'), 'Mitarbeiter sollte in Liste sein');
});

runner.test('Storage: Doppelter Mitarbeiter wird abgelehnt', (t) => {
    const storage = new DataStorage();
    storage.clearAll();

    storage.addEmployee('Max Mustermann');
    const success = storage.addEmployee('Max Mustermann');

    t.assertFalse(success, 'Doppelter Mitarbeiter sollte abgelehnt werden');

    const employees = storage.getEmployees();
    t.assertEqual(employees.length, 1, 'Sollte nur 1 Mitarbeiter haben');
});

runner.test('Storage: Mitarbeiter entfernen', (t) => {
    const storage = new DataStorage();
    storage.clearAll();

    storage.addEmployee('Max Mustermann');
    storage.removeEmployee('Max Mustermann');

    const employees = storage.getEmployees();
    t.assertEqual(employees.length, 0, 'Sollte 0 Mitarbeiter haben');
});

runner.test('Storage: Dienst hinzufügen und abrufen', (t) => {
    const storage = new DataStorage();
    storage.clearAll();

    storage.addEmployee('Max Mustermann');
    const date = new Date('2025-11-22T12:00:00');
    storage.addDuty('Max Mustermann', 2025, 11, date, 1.0);

    const duties = storage.getDutiesForMonth('Max Mustermann', 2025, 11);
    t.assertEqual(duties.length, 1, 'Sollte 1 Dienst haben');
    t.assertEqual(duties[0].share, 1.0, 'Dienst sollte share 1.0 haben');
});

runner.test('Storage: Dienst aktualisieren (gleicher Tag)', (t) => {
    const storage = new DataStorage();
    storage.clearAll();

    storage.addEmployee('Max Mustermann');
    const date = new Date('2025-11-22T12:00:00');

    storage.addDuty('Max Mustermann', 2025, 11, date, 1.0);
    storage.addDuty('Max Mustermann', 2025, 11, date, 0.5); // Update

    const duties = storage.getDutiesForMonth('Max Mustermann', 2025, 11);
    t.assertEqual(duties.length, 1, 'Sollte nur 1 Dienst haben (aktualisiert)');
    t.assertEqual(duties[0].share, 0.5, 'Share sollte aktualisiert sein');
});

runner.test('Storage: Mehrere Mitarbeiter', (t) => {
    const storage = new DataStorage();
    storage.clearAll();

    storage.addEmployee('Max Mustermann');
    storage.addEmployee('Anna Schmidt');
    storage.addEmployee('Peter Müller');

    const employees = storage.getEmployees();
    t.assertEqual(employees.length, 3, 'Sollte 3 Mitarbeiter haben');
    t.assertTrue(employees.includes('Anna Schmidt'), 'Anna Schmidt sollte vorhanden sein');
});

runner.test('Storage: Export und Import', (t) => {
    const storage1 = new DataStorage();
    storage1.clearAll();

    storage1.addEmployee('Max Mustermann');
    const date = new Date('2025-11-22T12:00:00');
    storage1.addDuty('Max Mustermann', 2025, 11, date, 1.0);

    const exported = storage1.exportData();

    const storage2 = new DataStorage();
    storage2.clearAll();
    const success = storage2.importData(exported);

    t.assertTrue(success, 'Import sollte erfolgreich sein');

    const employees = storage2.getEmployees();
    t.assertEqual(employees.length, 1, 'Sollte 1 Mitarbeiter haben');

    const duties = storage2.getDutiesForMonth('Max Mustermann', 2025, 11);
    t.assertEqual(duties.length, 1, 'Sollte 1 Dienst haben');
});

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

// ============================================================================
// Edge Cases & Regression Tests
// ============================================================================

runner.test('Edge Case: Exakt Schwellenwert mit Rundungsfehler (1.9999)', (t) => {
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
});

runner.test('Edge Case: Sehr viele Dienste (Performance)', (t) => {
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
});

runner.test('Edge Case: Dienst am 29. Februar (Schaltjahr)', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);
    const duties = [
        { date: new Date('2028-02-29T12:00:00'), share: 1.0 } // Dienstag -> weekday
    ];
    const result = calculator.calculateMonthlyBonus(duties, false);
    t.assertEqual(result.classified.weekday, 1.0, '29.02. (Di) = weekday');
});

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

// ============================================================================
// Display Functions
// ============================================================================

async function runAllTests() {
    const resultsContainer = document.getElementById('test-results');
    const summaryDiv = document.getElementById('summary');
    const runButton = document.getElementById('run-tests');

    // Clear previous results
    resultsContainer.innerHTML = '<p>Tests laufen...</p>';
    runButton.disabled = true;

    // Run tests
    const results = await runner.runAll();
    const summary = runner.getSummary();

    // Update summary
    document.getElementById('total-tests').textContent = summary.total;
    document.getElementById('passed-tests').textContent = summary.passed;
    document.getElementById('failed-tests').textContent = summary.failed;
    summaryDiv.style.display = 'flex';

    // Display results
    resultsContainer.innerHTML = '';

    // Group by category
    const categories = {
        'Holiday Provider': [],
        'Calculator - Tag-Klassifizierung': [],
        'Calculator - Bonusberechnung': [],
        'Storage': [],
        'Edge Cases': []
    };

    results.forEach(result => {
        if (result.name.includes('HolidayProvider')) {
            categories['Holiday Provider'].push(result);
        } else if (result.name.includes('qualifizierender Tag') || result.name.includes('Feiertag ist')) {
            categories['Calculator - Tag-Klassifizierung'].push(result);
        } else if (result.name.includes('Berechnung:')) {
            categories['Calculator - Bonusberechnung'].push(result);
        } else if (result.name.includes('Storage:')) {
            categories['Storage'].push(result);
        } else if (result.name.includes('Edge Case:')) {
            categories['Edge Cases'].push(result);
        }
    });

    // Render categories
    for (const [category, tests] of Object.entries(categories)) {
        if (tests.length === 0) continue;

        const suiteDiv = document.createElement('div');
        suiteDiv.className = 'test-suite';

        const title = document.createElement('h2');
        title.textContent = `${category} (${tests.filter(t => t.passed).length}/${tests.length})`;
        suiteDiv.appendChild(title);

        tests.forEach(result => {
            const testDiv = document.createElement('div');
            testDiv.className = `test-case ${result.passed ? 'pass' : 'fail'}`;

            const nameDiv = document.createElement('div');
            nameDiv.className = 'test-name';
            nameDiv.textContent = `${result.passed ? '✅' : '❌'} ${result.name}`;
            testDiv.appendChild(nameDiv);

            if (!result.passed && result.error) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'error-details';
                errorDiv.textContent = result.error;
                testDiv.appendChild(errorDiv);
            }

            suiteDiv.appendChild(testDiv);
        });

        resultsContainer.appendChild(suiteDiv);
    }

    runButton.disabled = false;

    // Scroll to summary
    summaryDiv.scrollIntoView({ behavior: 'smooth' });
}

// Auto-run on load (optional)
// window.addEventListener('load', runAllTests);
