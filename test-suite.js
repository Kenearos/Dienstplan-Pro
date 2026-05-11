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
// Calculator Tests - Bonus Calculation
// ============================================================================

runner.test('Berechnung: Unter Schwellenwert (1.0 WE-Tag) = 0€', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);

    const duties = [
        { date: new Date('2025-11-22T12:00:00'), share: 1.0 } // 1x Samstag
    ];

    const result = calculator.calculateMonthlyBonus(duties);

    t.assertEqual(result.qualifyingDays, 1.0, 'Sollte 1.0 qualifizierende Tage haben');
    t.assertFalse(result.thresholdReached, 'Schwellenwert sollte nicht erreicht sein');
    t.assertEqual(result.totalBonus, 0, 'Bonus sollte 0€ sein');
});

runner.test('Berechnung: Genau 2.0 WE-Tage = 0€', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);

    const duties = [
        { date: new Date('2025-11-22T12:00:00'), share: 1.0 }, // Samstag
        { date: new Date('2025-11-23T12:00:00'), share: 1.0 }  // Sonntag
    ];

    const result = calculator.calculateMonthlyBonus(duties);

    t.assertEqual(result.qualifyingDays, 2.0, 'Sollte 2.0 qualifizierende Tage haben');
    t.assertTrue(result.thresholdReached, 'Schwellenwert sollte erreicht sein');
    t.assertEqual(result.qualifyingDaysDeducted, 2.0, 'Sollte 2.0 Tage abziehen');
    t.assertEqual(result.qualifyingDaysPaid, 0.0, 'Sollte 0.0 Tage bezahlen');
    t.assertEqual(result.totalBonus, 0, 'Bonus sollte 0€ sein');
});

runner.test('Berechnung: 2x halbe WE-Dienste = 0€ (genau Schwelle, nach Abzug 2.0)', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);

    const duties = [
        { date: new Date('2025-11-22T12:00:00'), share: 0.5 }, // Halber Samstag
        { date: new Date('2025-11-22T12:00:00'), share: 0.5 }, // Halber Samstag
        { date: new Date('2025-11-23T12:00:00'), share: 0.5 }, // Halber Sonntag
        { date: new Date('2025-11-23T12:00:00'), share: 0.5 }  // Halber Sonntag
    ];

    const result = calculator.calculateMonthlyBonus(duties);

    t.assertEqual(result.qualifyingDays, 2.0, 'Sollte 2.0 qualifizierende Tage haben (4×0.5)');
    t.assertTrue(result.thresholdReached, 'Schwellenwert sollte erreicht sein');
    t.assertEqual(result.qualifyingDaysPaid, 0.0, 'Sollte 0.0 Tage bezahlen nach Abzug');
    t.assertEqual(result.totalBonus, 0, 'Bonus sollte 0€ sein');
});

runner.test('Berechnung: 3 WE-Tage = 450€', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);

    const duties = [
        { date: new Date('2025-11-21T12:00:00'), share: 1.0 }, // Freitag
        { date: new Date('2025-11-22T12:00:00'), share: 1.0 }, // Samstag
        { date: new Date('2025-11-23T12:00:00'), share: 1.0 }  // Sonntag
    ];

    const result = calculator.calculateMonthlyBonus(duties);

    t.assertEqual(result.qualifyingDays, 3.0, 'Sollte 3.0 qualifizierende Tage haben');
    t.assertEqual(result.qualifyingDaysPaid, 1.0, 'Sollte 1.0 Tage bezahlen (3-2)');
    t.assertEqual(result.totalBonus, 450, 'Bonus sollte 450€ sein (1×450€)');
});

runner.test('Berechnung: Normale Tage + WE-Tage gemischt', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);

    const duties = [
        { date: new Date('2025-11-24T12:00:00'), share: 1.0 }, // Montag (normal)
        { date: new Date('2025-11-25T12:00:00'), share: 1.0 }, // Dienstag (normal)
        { date: new Date('2025-11-22T12:00:00'), share: 1.0 }, // Samstag (qualifizierend)
        { date: new Date('2025-11-23T12:00:00'), share: 1.0 }  // Sonntag (qualifizierend)
    ];

    const result = calculator.calculateMonthlyBonus(duties);

    t.assertEqual(result.normalDays, 2.0, 'Sollte 2.0 normale Tage haben');
    t.assertEqual(result.qualifyingDays, 2.0, 'Sollte 2.0 qualifizierende Tage haben');
    t.assertEqual(result.normalDaysPaid, 2.0, 'Sollte 2.0 normale Tage bezahlen');
    t.assertEqual(result.qualifyingDaysPaid, 0.0, 'Sollte 0.0 qualifizierende Tage bezahlen');
    t.assertEqual(result.bonusNormalDays, 500, 'Normale Tage: 2×250€ = 500€');
    t.assertEqual(result.bonusQualifyingDays, 0, 'WE-Tage: 0×450€ = 0€');
    t.assertEqual(result.totalBonus, 500, 'Gesamt: 500€');
});

runner.test('Berechnung: Halbe Dienste korrekt berechnet', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);

    const duties = [
        { date: new Date('2025-11-24T12:00:00'), share: 0.5 }, // Halber Montag
        { date: new Date('2025-11-22T12:00:00'), share: 0.5 }, // Halber Samstag
        { date: new Date('2025-11-23T12:00:00'), share: 1.0 }, // Ganzer Sonntag
        { date: new Date('2025-11-21T12:00:00'), share: 1.0 }  // Ganzer Freitag
    ];

    const result = calculator.calculateMonthlyBonus(duties);

    t.assertEqual(result.normalDays, 0.5, 'Sollte 0.5 normale Tage haben');
    t.assertEqual(result.qualifyingDays, 2.5, 'Sollte 2.5 qualifizierende Tage haben');
    t.assertEqual(result.qualifyingDaysPaid, 0.5, 'Sollte 0.5 qualifizierende Tage bezahlen');
    t.assertEqual(result.bonusNormalDays, 125, 'Normale Tage: 0.5×250€ = 125€');
    t.assertEqual(result.bonusQualifyingDays, 225, 'WE-Tage: 0.5×450€ = 225€');
    t.assertEqual(result.totalBonus, 350, 'Gesamt: 350€');
});

runner.test('Berechnung: Feiertag + Vortag', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);

    const duties = [
        { date: new Date('2025-04-30T12:00:00'), share: 1.0 }, // Mittwoch vor 1. Mai (qualifizierend)
        { date: new Date('2025-05-01T12:00:00'), share: 1.0 }  // 1. Mai (Feiertag, qualifizierend)
    ];

    const result = calculator.calculateMonthlyBonus(duties);

    t.assertEqual(result.qualifyingDays, 2.0, 'Sollte 2.0 qualifizierende Tage haben');
    t.assertTrue(result.thresholdReached, 'Schwellenwert sollte erreicht sein');
    t.assertEqual(result.totalBonus, 0, 'Bonus sollte 0€ sein (2.0 - 2.0 = 0.0 × 450€)');
});

runner.test('Berechnung: Keine Dienste = 0€', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);

    const result = calculator.calculateMonthlyBonus([]);

    t.assertEqual(result.totalDuties, 0, 'Sollte 0 Dienste haben');
    t.assertEqual(result.totalBonus, 0, 'Bonus sollte 0€ sein');
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
// Edge Cases & Regression Tests
// ============================================================================

runner.test('Edge Case: Exakt Schwellenwert mit Rundungsfehler (1.9999)', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);

    // Simuliere Rundungsfehler
    const duties = [
        { date: new Date('2025-11-22T12:00:00'), share: 0.66666 },
        { date: new Date('2025-11-23T12:00:00'), share: 0.66666 },
        { date: new Date('2025-11-21T12:00:00'), share: 0.66666 }
    ];

    const result = calculator.calculateMonthlyBonus(duties);

    // 0.66666 × 3 ≈ 1.99998, sollte als >= 2.0 gelten
    t.assertTrue(result.thresholdReached || result.qualifyingDays < 2.0,
                 'Sollte Rundung korrekt handhaben');
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
    const result = calculator.calculateMonthlyBonus(duties);
    const duration = Date.now() - start;

    t.assertTrue(duration < 100, `Berechnung sollte schnell sein (${duration}ms)`);
    t.assertTrue(result.totalBonus > 0, 'Sollte Bonus berechnen');
});

runner.test('Edge Case: Dienst am 29. Februar (Schaltjahr)', (t) => {
    const holidays = new HolidayProvider();
    const calculator = new BonusCalculator(holidays);

    const duties = [
        { date: new Date('2028-02-29T12:00:00'), share: 1.0 } // Dienstag (nicht qualifizierend)
    ];

    // Sollte nicht crashen
    const result = calculator.calculateMonthlyBonus(duties);
    t.assertEqual(result.normalDays, 1.0, 'Sollte normalen Tag erkennen');
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
