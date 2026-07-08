# CLAUDE.md - AI Assistant Guide for Dienstplan-Pro

## Project Overview

**Dienstplan-Pro** is a German-language Progressive Web App (PWA) for calculating bonus payments for weekend and holiday duty shifts according to NRW (Nordrhein-Westfalen) regulations. The application is designed for healthcare or similar organizations that need to track employee on-call duties and calculate corresponding bonuses.

**Primary Language**: German (UI, comments, and documentation)
**Tech Stack**: Vanilla JavaScript, HTML5, CSS3, LocalStorage API
**Deployment**: Docker container (Node.js `serve`) on self-hosted Hetzner server, fronted by Caddy reverse proxy with automatic Let's Encrypt TLS. Live at https://bonus.pixel-by-design.de

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

### Tag-Klassifizierung (Slot pro Dienst)

Jeder Dienst bekommt genau einen Slot (`variants.js` → `classify`):
- **fr**: echter Freitag · oder Tag vor einem Mo–Do-Feiertag
- **sa**: echter Samstag · oder Sandwich-Tag (Feiertag UND Tag davor)
- **so**: echter Sonntag · oder Mo–Do-Feiertag (ohne Sandwich)
- **weekday**: Mo–Do ohne Feiertagsbezug

Echte Fr/Sa/So gewinnen immer. Sätze: `fr/sa/so` = 450 €, `weekday` = 250 €; Anteile 0,5 oder 1,0.

### Bonus-Berechnung (3 Varianten — `variants.js`, NICHT mehr das alte 2.0-Schwellen-Modell)

`calculator.js` läuft alle drei Varianten und nimmt die mit dem höchsten Betrag (Gleichstand → niedrigste Variantennummer). Werte normal (Urlaub = halbiert):
- **V1** — greift wenn `fr+so ≥ 1` UND `weekday ≥ 3`; Abzug 1 aus fr+so (Fr-Priorität) + 3 weekday; `sa` wird voll bezahlt.
- **V2** — greift wenn `sa ≥ 1` UND `weekday ≥ 2`; Abzug 1 sa + 2 weekday; `fr`/`so` werden voll bezahlt.
- **V3** — greift wenn `fr+sa+so ≥ 2`; Abzug 2 aus dem Pool (Reihenfolge fr → so → sa); `weekday` wird voll bezahlt.

**Urlaubsmodus** (Flag pro Mitarbeiter/Monat) halbiert alle Schwellen und Abzüge. Maßgeblich ist `variants.js`; die In-App-Doku (Einstellungen → Berechnungsregeln) ist aktuell.

### Mehrbenutzer (v1.0)

Seit dem Team-Release ist die App hinter Magic-Link-Login; Daten sind pro Nutzer (`user_id`) getrennt. Backend in `server/` (auth.js, index.js, mailer.js, ratelimit.js, audit.js). Konfiguration via Env-Variablen — siehe `.env.example` (u.a. `ADMIN_EMAIL` Pflicht/Fail-Fast, SMTP, Session-Fristen).

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

### Deployment (Hetzner)

**Live URL:** https://bonus.pixel-by-design.de
**Server:** root@65.21.60.83 (Hetzner)
**Container:** `dienstplan-pro` on the `matrix_default` Docker network so the
`matrix-caddy-1` reverse proxy can resolve it by hostname.

The Dockerfile runs an Express server (`server/index.js`) that serves the
static frontend **and** the `/api/state` persistence API, backed by SQLite:
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=3000
ENV DATA_DIR=/data
EXPOSE 3000
CMD ["node", "server/index.js"]
```

Caddy block in `/opt/matrix/Caddyfile` (app + `/api/*` behind Basic-Auth):
```
bonus.pixel-by-design.de {
    basic_auth {
        benad <BCRYPT_HASH>
    }
    reverse_proxy dienstplan-pro:3000
}
```

> **Wichtig:** Die SQLite-DB und die täglichen Backups liegen auf dem
> benannten Docker-Volume `dienstplan-data` (`/data` im Container, Backups
> unter `/data/backups/`). Niemals ohne dieses Volume deployen — sonst
> löscht `docker rm` beim nächsten Update alle Daten unwiderruflich. Die
> Domain ist komplett hinter Caddy Basic-Auth (gilt auch für `/api/*`).

**Update procedure** (when pushing new code):
```bash
ssh root@65.21.60.83
cd /root/Dienstplan-Pro
git pull
docker build -t dienstplan-pro:latest .

# v1.0+: DB vor dem (ersten) Multi-User-Start sichern — der erste Start migriert das
# documents-Schema auf (user_id,key) und ordnet ALLE Alt-Daten dem ADMIN_EMAIL zu (einmalig, unumkehrbar).
docker exec dienstplan-pro sh -c 'cp /data/dienstplan.db /data/dienstplan.db.$(date +%F).bak' || true

docker stop dienstplan-pro && docker rm dienstplan-pro
docker run -d --name dienstplan-pro --network matrix_default \
    --restart unless-stopped -e PORT=3000 -e DATA_DIR=/data \
    -e ADMIN_EMAIL=kenearos@mastersofdungeons.de \
    -e APP_BASE_URL=https://bonus.pixel-by-design.de \
    -v dienstplan-data:/data dienstplan-pro:latest
# Für Team-Mailversand zusätzlich (sonst erscheint der Magic-Link nur im Container-Log,
# abrufbar via `docker logs dienstplan-pro`):
#   -e SMTP_HOST=... -e SMTP_PORT=587 -e SMTP_SECURE=false -e SMTP_USER=... -e SMTP_PASS=... -e SMTP_FROM="Dienstplan-Pro <...>"
```

**Wichtig:** `ADMIN_EMAIL` ist Pflicht (Fail-Fast — Container startet sonst nicht) und beim ersten Start unveränderlich (ordnet die Alt-Daten zu). Alle Env-Variablen: siehe `.env.example`. Caddy braucht kein `basic_auth` mehr — die App gate-t sich selbst per Magic-Link.

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
