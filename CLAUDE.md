# CLAUDE.md - AI Assistant Guide for Dienstplan-Pro

## Project Overview

**Dienstplan-Pro** is a German-language Progressive Web App (PWA) for calculating bonus payments for weekend and holiday duty shifts according to NRW (Nordrhein-Westfalen) regulations. The application is designed for healthcare or similar organizations that need to track employee on-call duties and calculate corresponding bonuses.

**Primary Language**: German (UI, comments, and documentation)
**Tech Stack**: Vanilla JavaScript, HTML5, CSS3, LocalStorage API
**Deployment**: Docker container with Node.js `serve`, designed for Railway hosting

## Architecture

### File Structure

```
Dienstplan-Pro/
├── index.html          # Main HTML entry point with tab-based UI
├── app.js              # Main application class (DienstplanApp) - UI management
├── calculator.js       # BonusCalculator class - core business logic
├── holidays.js         # HolidayProvider class - NRW holiday data 2025-2030
├── storage.js          # DataStorage class - LocalStorage persistence
├── styles.css          # All CSS styles (responsive, gradient theme)
├── sw.js               # Service Worker for PWA offline support
├── manifest.json       # PWA manifest configuration
├── test-suite.js       # Comprehensive test runner with assertions
├── test.html           # Browser-based test interface
├── Dockerfile          # Production deployment configuration
├── README.md           # User documentation (German)
└── TEST_GUIDE.md       # Testing documentation (German)
```

### Module Responsibilities

| Module | Class | Purpose |
|--------|-------|---------|
| `app.js` | `DienstplanApp` | UI orchestration, event handling, user interactions |
| `calculator.js` | `BonusCalculator` | Bonus calculation logic, day type classification |
| `holidays.js` | `HolidayProvider` | NRW public holiday lookup (2025-2030) |
| `storage.js` | `DataStorage` | LocalStorage CRUD operations, import/export |

### Global Dependencies

All classes are attached to `window` for cross-module access:
- `window.DienstplanApp` (instantiated as global `app`)
- `window.BonusCalculator`
- `window.HolidayProvider`
- `window.DataStorage`

Script loading order in `index.html` is critical:
1. `holidays.js`
2. `calculator.js`
3. `storage.js`
4. `app.js`

## Business Logic

### Qualifying Days (WE/Feiertag)

A day is "qualifying" (eligible for higher bonus rate) if ANY of:
- **Weekend**: Friday (5), Saturday (6), or Sunday (0)
- **Public Holiday**: Any NRW state holiday
- **Day Before Holiday**: The calendar day preceding a public holiday

### Bonus Calculation Rules

```
Constants:
- RATE_NORMAL = 250€  (normal weekday rate)
- RATE_WEEKEND = 450€ (qualifying day rate)
- MIN_QUALIFYING_DAYS = 2.0 (threshold)
- DEDUCTION_AMOUNT = 2.0 (deducted from qualifying days)

Algorithm:
1. Count qualifying days (Friday, Sat, Sun, holidays, day-before-holiday)
2. Count normal days (Mon-Thu, not holiday-related)
3. If qualifyingDays < 2.0: NO BONUS (total = 0€)
4. If qualifyingDays >= 2.0:
   - Deduct 2.0 from qualifying days (Friday priority)
   - Bonus = (normalDays × 250€) + (remainingQualifyingDays × 450€)
```

### Friday Priority Deduction

When deducting the 2.0 qualifying days, Fridays are deducted first before Saturday/Sunday/holidays. This is tracked via `qualifyingDaysFriday` and `qualifyingDaysOther` in the calculator.

### Duty Shares

Duties can be full (1.0) or half (0.5). Half duties count as 0.5 toward all calculations.

## Data Storage

### LocalStorage Keys

```javascript
STORAGE_KEY_EMPLOYEES = 'dienstplan_employees'  // Array of employee names
STORAGE_KEY_DUTIES = 'dienstplan_duties'        // Nested duty object
```

### Data Structure

```javascript
// Employees: string[]
["Max Mustermann", "Anna Schmidt"]

// Duties: { employeeName: { "YYYY-MM": duties[] } }
{
  "Max Mustermann": {
    "2025-11": [
      { "date": "2025-11-22T11:00:00.000Z", "share": 1.0 },
      { "date": "2025-11-23T11:00:00.000Z", "share": 0.5 }
    ]
  }
}
```

### Date Handling

- Dates are stored as ISO strings in LocalStorage
- Use `T12:00:00` when creating dates to avoid timezone edge cases
- Dates are converted back to Date objects when retrieved

## UI Structure

The app uses a tab-based interface with 4 sections:
1. **Dienste eintragen** (Enter Duties) - Add/remove shifts
2. **Berechnung** (Calculation) - Calculate and view bonuses
3. **Mitarbeiter verwalten** (Manage Employees) - CRUD for employees
4. **Einstellungen** (Settings) - Export/import, rules info, data clearing

### Toast Notifications

Use `app.showToast(message, type)` where type is:
- `'success'` - Green
- `'error'` - Red
- `'info'` - Blue

## Testing

### Running Tests

1. Serve the app: `python3 -m http.server 8000` or use the Docker container
2. Open `http://localhost:8000/test.html`
3. Click "Alle Tests ausführen"

### Test Categories

- **HolidayProvider**: Holiday detection, day-before-holiday
- **Calculator - Tag-Klassifizierung**: Day type classification
- **Calculator - Bonusberechnung**: Bonus calculation scenarios
- **Storage**: CRUD operations, import/export
- **Edge Cases**: Rounding, performance, leap years

### Adding Tests

```javascript
runner.test('Test Name', (t) => {
    const calculator = new BonusCalculator(new HolidayProvider());
    const duties = [{ date: new Date('2025-11-22T12:00:00'), share: 1.0 }];
    const result = calculator.calculateMonthlyBonus(duties);

    t.assertEqual(result.totalBonus, 450, 'Expected bonus');
    t.assertTrue(result.thresholdReached, 'Threshold should be reached');
    t.assertAlmostEqual(result.qualifyingDays, 1.0, 0.01, 'Qualifying days');
});
```

## Development Workflow

### Local Development

```bash
# Option 1: Python server
python3 -m http.server 8000

# Option 2: Node.js
npx http-server -p 8000

# Option 3: Docker
docker build -t dienstplan-pro .
docker run -p 3000:3000 -e PORT=3000 dienstplan-pro
```

### Making Changes

1. All JavaScript is vanilla ES6+ classes
2. No build step required
3. Refresh browser to see changes
4. Run test suite after changes

### Deployment (Railway)

The Dockerfile uses `serve` from npm to serve static files:
```dockerfile
FROM node:20-alpine
RUN npm install -g serve
WORKDIR /app
COPY . .
CMD serve -s . -l tcp://0.0.0.0:${PORT:-3000}
```

## Code Conventions

### Language

- All user-facing text: **German**
- Code comments: **German** (existing pattern)
- Variable/function names: **English** (existing pattern)

### Naming

- Classes: PascalCase (`BonusCalculator`, `DataStorage`)
- Methods/functions: camelCase (`calculateMonthlyBonus`, `isHoliday`)
- Constants: UPPER_SNAKE_CASE (`RATE_NORMAL`, `STORAGE_KEY_DUTIES`)
- DOM IDs: kebab-case (`employee-select-duty`, `calc-month-select`)

### Error Handling

- Storage operations include try/catch with German console.error messages
- User-facing errors shown via toast notifications
- Invalid data returns empty arrays/objects rather than throwing

### Date Format

- Display: German locale `toLocaleDateString('de-DE')`
- Storage: ISO string
- Internal: JavaScript Date objects with noon time (`T12:00:00`)

## Common Tasks

### Adding a New Holiday

Edit `holidays.js`, add to the appropriate year array:
```javascript
{ date: 'YYYY-MM-DD', name: 'Holiday Name' }
```

### Modifying Calculation Rules

Edit `calculator.js` constants:
```javascript
this.RATE_NORMAL = 250;
this.RATE_WEEKEND = 450;
this.MIN_QUALIFYING_DAYS = 2.0;
this.DEDUCTION_AMOUNT = 2.0;
```

### Adding Export Formats

The app supports multiple export formats in `app.js`:
- `exportData()` - JSON backup
- `exportCSV()` - Excel-compatible CSV with BOM
- `exportBonusReport()` - HTML report for printing/PDF
- `generateEmailReport()` - Copyable email text

### Extending the UI

1. Add HTML in `index.html` within appropriate tab-content div
2. Add event listener in `setupEventListeners()` in `app.js`
3. Implement handler method in `DienstplanApp` class
4. Style in `styles.css` following existing patterns

## PWA Features

- **Service Worker** (`sw.js`): Caches all assets for offline use
- **Manifest** (`manifest.json`): Enables "Add to Home Screen"
- **Cache Version**: `dienstplan-pro-v1` (increment when updating assets)

## Key Gotchas

1. **Timezone Issues**: Always use `T12:00:00` when creating dates from strings to avoid midnight edge cases
2. **LocalStorage Limits**: ~5MB, sufficient for typical use but no warning when approaching limit
3. **Float Precision**: Use `assertAlmostEqual` in tests for floating-point comparisons
4. **Script Order**: `holidays.js` must load before `calculator.js`
5. **Employee Deletion**: Removes all associated duties automatically
6. **Duty Updates**: Adding a duty on existing date replaces (not duplicates)

## Git Conventions

Recent commit patterns:
- `feat:` New features
- `fix:` Bug fixes
- Keep commit messages concise and descriptive
