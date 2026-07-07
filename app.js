/**
 * Main Application
 * Manages UI interactions and coordinates between components
 */
function monthName(monthNumber) {
    return new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(new Date(2000, monthNumber - 1, 1));
}
const WEEKDAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

class DienstplanApp {
    constructor() {
        this.storage = new DataStorage();
        this.holidayProvider = new HolidayProvider();
        this.calculator = new BonusCalculator(this.holidayProvider);

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.populateYearSelects();
        this.setCurrentMonthYear();
        this.loadEmployeeSelects();
        this.loadEmployeeList();
        this.switchTab('duties');
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Employee management
        document.getElementById('add-employee-btn').addEventListener('click', () => this.addEmployee());
        document.getElementById('new-employee-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addEmployee();
        });

        // Duty management
        document.getElementById('add-duty-btn').addEventListener('click', () => this.addDuty());
        document.getElementById('employee-select-duty').addEventListener('change', () => this.loadDutiesForSelectedEmployee());

        // Date stepper buttons (Feature C)
        document.getElementById('duty-date-prev').addEventListener('click', () => this.stepDutyDate(-1));
        document.getElementById('duty-date-next').addEventListener('click', () => this.stepDutyDate(+1));
        document.getElementById('duty-date').addEventListener('change', () => this.updateDateStepperState());
        document.getElementById('month-select').addEventListener('change', () => this.onDutyMonthChange());
        document.getElementById('year-select').addEventListener('change', () => this.onDutyMonthChange());

        // Bild-Import (Feature A)
        const imageImportBtn = document.getElementById('open-image-import-btn');
        if (imageImportBtn) {
            imageImportBtn.addEventListener('click', () => {
                if (window.imageImporter) {
                    window.imageImporter.openImportDialog();
                } else {
                    this.showToast('Bild-Import nicht verfuegbar.', 'error');
                }
            });
        }

        // Calculation
        document.getElementById('calculate-btn').addEventListener('click', () => this.calculateBonuses());

        // Settings
        document.getElementById('export-csv-btn').addEventListener('click', () => this.exportCSV());
        document.getElementById('export-report-btn').addEventListener('click', () => this.exportBonusReport());
        
        // NEW: Email Report Generator
        const emailBtn = document.getElementById('email-report-btn');
        if (emailBtn) {
            emailBtn.addEventListener('click', () => this.generateEmailReport());
        }

        document.getElementById('export-btn').addEventListener('click', () => this.exportData());
        document.getElementById('import-btn').addEventListener('click', () => this.importData());
        document.getElementById('clear-all-btn').addEventListener('click', () => this.clearAllData());

        // Bild-Import (KI) settings
        const setKeyBtn = document.getElementById('set-api-key-btn');
        if (setKeyBtn) setKeyBtn.addEventListener('click', () => this.setApiKeyFromPrompt());
        const clearKeyBtn = document.getElementById('clear-api-key-btn');
        if (clearKeyBtn) clearKeyBtn.addEventListener('click', () => this.clearApiKey());
        const modelSelect = document.getElementById('api-model-select');
        if (modelSelect) {
            modelSelect.value = this.storage.getApiModel();
            modelSelect.addEventListener('change', () => {
                this.storage.setApiModel(modelSelect.value);
                this.showToast(`Modell geaendert: ${modelSelect.options[modelSelect.selectedIndex].text}`, 'success');
            });
        }
        this.refreshApiKeyStatus();
    }

    /**
     * Populate year select dropdowns
     */
    populateYearSelects() {
        const currentYear = new Date().getFullYear();
        const years = [];

        for (let year = currentYear - 1; year <= currentYear + 5; year++) {
            years.push(year);
        }

        const yearSelects = ['year-select', 'calc-year-select'];
        yearSelects.forEach(selectId => {
            const select = document.getElementById(selectId);
            select.innerHTML = '';
            years.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                if (year === currentYear) option.selected = true;
                select.appendChild(option);
            });
        });
    }

    /**
     * Set current month and year in selects
     */
    setCurrentMonthYear() {
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        document.getElementById('month-select').value = currentMonth;
        document.getElementById('year-select').value = currentYear;
        document.getElementById('calc-month-select').value = currentMonth;
        document.getElementById('calc-year-select').value = currentYear;

        // Set date input to today
        const today = this.holidayProvider.formatDate(new Date());
        document.getElementById('duty-date').value = today;

        this.updateDateStepperState();
    }

    /**
     * Switch between tabs
     */
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            }
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`tab-${tabName}`).classList.add('active');

        // Refresh data when switching to certain tabs
        if (tabName === 'employees') {
            this.loadEmployeeList();
        } else if (tabName === 'duties') {
            this.loadDutiesForSelectedEmployee();
        } else if (tabName === 'settings') {
            this.refreshApiKeyStatus();
        }
    }

    /**
     * Load employee select dropdowns
     */
    loadEmployeeSelects() {
        const employees = this.storage.getEmployees();
        const selects = ['employee-select-duty'];

        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            const currentValue = select.value;
            select.innerHTML = '<option value="">-- Mitarbeiter auswählen --</option>';

            employees.forEach(employee => {
                const option = document.createElement('option');
                option.value = employee;
                option.textContent = employee;
                select.appendChild(option);
            });

            // Restore previous selection if still valid
            if (employees.includes(currentValue)) {
                select.value = currentValue;
            }
        });
    }

    /**
     * Add a new employee
     */
    addEmployee() {
        const input = document.getElementById('new-employee-name');
        const name = input.value.trim();

        if (!name) {
            this.showToast('Bitte geben Sie einen Namen ein.', 'error');
            return;
        }

        const success = this.storage.addEmployee(name);

        if (success) {
            this.showToast(`Mitarbeiter "${name}" wurde hinzugefügt.`, 'success');
            input.value = '';
            this.loadEmployeeList();
            this.loadEmployeeSelects();
        } else {
            this.showToast(`Mitarbeiter "${name}" existiert bereits.`, 'error');
        }
    }

    /**
     * Remove an employee
     */
    removeEmployee(employeeName) {
        if (!confirm(`Möchten Sie "${employeeName}" wirklich löschen? Alle Dienste werden ebenfalls gelöscht.`)) {
            return;
        }

        this.storage.removeEmployee(employeeName);
        this.showToast(`Mitarbeiter "${employeeName}" wurde gelöscht.`, 'success');
        this.loadEmployeeList();
        this.loadEmployeeSelects();
        this.loadDutiesForSelectedEmployee();
    }

    /**
     * Load and display employee list
     */
    loadEmployeeList() {
        const employees = this.storage.getEmployees();
        const container = document.getElementById('employee-list-display');

        if (employees.length === 0) {
            container.innerHTML = '<p class="text-muted">Keine Mitarbeiter vorhanden.</p>';
            return;
        }

        container.innerHTML = '';
        employees.forEach(employee => {
            const item = document.createElement('div');
            item.className = 'employee-item';
            item.innerHTML = `
                <span class="employee-name">${employee}</span>
                <button class="btn btn-danger btn-small" onclick="app.removeEmployee('${employee}')">Löschen</button>
            `;
            container.appendChild(item);
        });
    }

    /**
     * Add a duty
     */
    addDuty() {
        const employeeSelect = document.getElementById('employee-select-duty');
        const dateInput = document.getElementById('duty-date');
        const shareSelect = document.getElementById('duty-share');

        const employeeName = employeeSelect.value;
        const dateStr = dateInput.value;
        const share = parseFloat(shareSelect.value);

        if (!employeeName) {
            this.showToast('Bitte wählen Sie einen Mitarbeiter aus.', 'error');
            return;
        }

        if (!dateStr) {
            this.showToast('Bitte wählen Sie ein Datum aus.', 'error');
            return;
        }

        const date = new Date(dateStr + 'T12:00:00'); // Add time to avoid timezone issues
        const year = date.getFullYear();
        const month = date.getMonth() + 1;

        this.storage.addDuty(employeeName, year, month, date, share);
        this.showToast('Dienst wurde hinzugefügt.', 'success');
        this.loadDutiesForSelectedEmployee();

        // Update month/year selects to match the added duty
        document.getElementById('month-select').value = month;
        document.getElementById('year-select').value = year;
    }

    /**
     * Remove a duty
     */
    removeDuty(employeeName, year, month, date) {
        this.storage.removeDuty(employeeName, year, month, date);
        this.showToast('Dienst wurde gelöscht.', 'success');
        this.loadDutiesForSelectedEmployee();
    }

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
        dateInput.value = this.holidayProvider.formatDate(newDate);
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

    /**
     * Load duties for the selected employee and month
     */
    loadDutiesForSelectedEmployee() {
        const employeeSelect = document.getElementById('employee-select-duty');
        const monthSelect = document.getElementById('month-select');
        const yearSelect = document.getElementById('year-select');
        const container = document.getElementById('duties-display');

        const employeeName = employeeSelect.value;
        const month = parseInt(monthSelect.value);
        const year = parseInt(yearSelect.value);

        if (!employeeName) {
            container.innerHTML = '<p class="text-muted">Wählen Sie einen Mitarbeiter aus, um Dienste anzuzeigen.</p>';
            return;
        }

        const duties = this.storage.getDutiesForMonth(employeeName, year, month);

        if (duties.length === 0) {
            container.innerHTML = `<p class="text-muted">Keine Dienste für ${monthName(month)} ${year}.</p>`;
            return;
        }

        container.innerHTML = '';
        duties.forEach(duty => {
            const isQualifying = this.calculator.isQualifyingDay(duty.date);
            const dayType = this.calculator.getDayTypeLabel(duty.date);
            const dateStr = duty.date.toLocaleDateString('de-DE', {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });

            const item = document.createElement('div');
            item.className = `duty-item ${isQualifying ? 'qualifying' : ''}`;
            item.innerHTML = `
                <div class="duty-info">
                    <div class="duty-date">${dateStr}</div>
                    <div class="duty-meta">
                        ${dayType}
                        <span class="badge ${isQualifying ? 'badge-qualifying' : 'badge-normal'}">
                            ${isQualifying ? 'WE/Feiertag' : 'Normal'}
                        </span>
                    </div>
                </div>
                <div class="duty-share">${duty.share === 1 ? 'Ganzer Dienst' : 'Halber Dienst'}</div>
                <button class="btn btn-danger btn-small"
                        onclick="app.removeDuty('${employeeName}', ${year}, ${month}, new Date('${duty.date.toISOString()}'))">
                    Löschen
                </button>
            `;
            container.appendChild(item);
        });
    }

    /**
     * Calculate bonuses for all employees
     */
    calculateBonuses() {
        const monthSelect = document.getElementById('calc-month-select');
        const yearSelect = document.getElementById('calc-year-select');
        const resultsContainer = document.getElementById('calculation-results');

        const month = parseInt(monthSelect.value);
        const year = parseInt(yearSelect.value);
        const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

        const employeeDuties = this.storage.getAllEmployeeDutiesForMonth(year, month);

        const vacationMap = this.storage.getVacationMapForMonth(yearMonth);
        const results = this.calculator.calculateAllEmployees(employeeDuties, vacationMap);

        resultsContainer.innerHTML = `<h3>Ergebnisse für ${monthName(month)} ${year}</h3>`;

        const employees = Object.keys(results);
        if (employees.length === 0) {
            resultsContainer.innerHTML += '<p class="text-muted">Keine Daten verfügbar.</p>';
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
                    Urlaub gehabt (≥14 Tage frei)
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
                    <h4>Variante ${result.winner.variantId} <span class="variant-badge winner">★ Sieger</span></h4>
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
        const star = isWinner ? '<span class="variant-badge winner">★</span>' : '';
        const labels = {
            1: 'V1: 1 (Fr/So) + 3 Werktage',
            2: 'V2: 1 Sa + 2 Werktage',
            3: 'V3 (loose): 2 qualifizierende Tage (Pool Fr+Sa+So)'
        };
        let thresholdStr = '-';
        if (v.threshold) {
            if (v.variantId === 1) thresholdStr = `Fr+So ≥ ${v.threshold.frSo}, Werktage ≥ ${v.threshold.weekday}`;
            if (v.variantId === 2) thresholdStr = `Sa ≥ ${v.threshold.sa}, Werktage ≥ ${v.threshold.weekday}`;
            if (v.variantId === 3) thresholdStr = `Pool ≥ ${v.threshold.pool}`;
        }
        const elig = v.eligible ? '<span class="variant-eligible">erfüllt</span>'
                                : '<span class="variant-not-eligible">nicht erfüllt</span>';
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

    // --- NEW: EMAIL REPORT GENERATOR ---
    generateEmailReport() {
        // Need to grab current selected calc month/year
        const monthSelect = document.getElementById('calc-month-select');
        const yearSelect = document.getElementById('calc-year-select');
        const month = parseInt(monthSelect.value);
        const year = parseInt(yearSelect.value);

        const employeeDuties = this.storage.getAllEmployeeDutiesForMonth(year, month);
        const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
        const vacationMap = this.storage.getVacationMapForMonth(yearMonth);
        const results = this.calculator.calculateAllEmployees(employeeDuties, vacationMap);

        const monthLabel = monthName(month);

        let reportHtml = `<h3>Dienstplan Abrechnung ${monthLabel} ${year}</h3>`;
        
        // 1. Copy-Paste Table
        reportHtml += `<div style="background: #ffffff; padding: 15px; border: 1px solid #ddd;">`;
        reportHtml += `<p><strong>Übersicht:</strong></p>`;
        reportHtml += `<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 13px; border-color: #ccc;">`;
        reportHtml += `<tr style="background-color: #f2f2f2;">
            <th style="text-align: left;">Mitarbeiter</th>
            <th style="text-align: center;">WE-Dienste</th>
            <th style="text-align: center;">Abzug</th>
            <th style="text-align: left;">Bemerkung</th>
        </tr>`;

        let textBlocks = [];

        if (results && Object.keys(results).length > 0) {
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
        } else {
             reportHtml += `<tr><td colspan="4" style="text-align:center;color:#666;">Keine Daten für diesen Monat</td></tr>`;
        }

        reportHtml += `</table></div>`;
        
        // 2. Text Blocks
        reportHtml += `<br><h4>Text-Bausteine für E-Mail (Copy & Paste):</h4>`;
        reportHtml += `<div id="text-blocks-container" style="background: #f9f9f9; padding: 15px; border: 1px solid #ccc; font-family: Arial, sans-serif; font-size: 14px;">`;
        if (textBlocks.length > 0) {
            textBlocks.forEach(text => {
                reportHtml += `<p style="margin-bottom: 8px; padding: 8px; background: white; border: 1px solid #eee;">${text}</p>`;
            });
        } else {
            reportHtml += `<p class="text-muted">Keine relevanten Dienste.</p>`;
        }
        reportHtml += `</div>`;

        // Modal Logic
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content">
                <button class="modal-close" id="close-modal-btn" aria-label="Schliessen">&times;</button>
                <h2 style="margin-top:0;">📧 E-Mail Text-Generator</h2>
                <p class="text-muted">Kopieren Sie diesen Inhalt direkt in Ihre E-Mail an die Verwaltung.</p>
                <div id="report-content">
                    ${reportHtml}
                </div>
                <div class="modal-actions">
                    <button id="copy-btn" class="btn btn-primary" style="font-size: 1.1em;">📋 Alles markieren & kopieren</button>
                    <button id="close-btn-bottom" class="btn btn-secondary">Schließen</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.modal-backdrop').onclick = () => modal.remove();
        modal.querySelector('#close-modal-btn').onclick = () => modal.remove();
        modal.querySelector('#close-btn-bottom').onclick = () => modal.remove();
        
        modal.querySelector('#copy-btn').onclick = () => {
            const range = document.createRange();
            range.selectNode(modal.querySelector('#report-content'));
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            try {
                document.execCommand('copy');
                this.showToast('✅ Bericht kopiert! (Einfügen mit Strg+V)', 'success');
            } catch (err) {
                this.showToast('❌ Fehler beim Kopieren.', 'error');
            }
            window.getSelection().removeAllRanges();
        };
    }

    /**
     * Export data as JSON
     */
    exportData() {
        const data = this.storage.exportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `dienstplan-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast('Daten wurden exportiert.', 'success');
    }

    /**
     * Export data as CSV (Excel-compatible) - Beginner-friendly format
     * Exports all duties and monthly summary for the selected month
     */
    exportCSV() {

        const month = parseInt(document.getElementById('calc-month-select').value);
        const year = parseInt(document.getElementById('calc-year-select').value);
        
        // Helper function to escape CSV values (handles semicolons, quotes, newlines)
        const escapeCSV = (value) => {
            const str = String(value);
            if (str.includes(';') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        };
        
        // Build CSV content with BOM for Excel UTF-8 support
        let csv = '\uFEFF'; // UTF-8 BOM for Excel
        
        // === Sheet 1: Dienste (All Duties for the month) ===
        csv += `DIENSTE ${monthName(month)} ${year}\n`;
        csv += 'Datum;Wochentag;Mitarbeiter;Anteil;Tagestyp\n';
        
        const employees = this.storage.getEmployees();
        const allDuties = [];
        
        // Collect all duties for the selected month from all employees
        employees.forEach(employee => {
            const duties = this.storage.getDutiesForMonth(employee, year, month);
            duties.forEach(duty => {
                allDuties.push({
                    ...duty,
                    employee: employee
                });
            });
        });
        
        // Sort by date
        allDuties.sort((a, b) => a.date - b.date);
        
        allDuties.forEach(duty => {
            const isQual = this.calculator.isQualifyingDay(duty.date);
            const dateStr = duty.date.toLocaleDateString('de-DE');
            const weekday = WEEKDAY_NAMES[duty.date.getDay()];
            const dayType = isQual ? 'WE-Tag' : 'Werktag (WT)';
            
            csv += `${dateStr};${weekday};${escapeCSV(duty.employee)};${duty.share.toFixed(1).replace('.', ',')};${dayType}\n`;
        });
        
        csv += '\n\n';
        
        // === Sheet 2: Monatliche Auswertung ===
        csv += `AUSWERTUNG ${monthName(month)} ${year}\n`;
        csv += 'Mitarbeiter;Urlaub;Sieger-Variante;Fr;Sa;So;Werktage;Eligible;Abzug Fr;Abzug Sa;Abzug So;Abzug WT;Bonus (EUR)\n';

        const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
        const employeeDuties = this.storage.getAllEmployeeDutiesForMonth(year, month);
        const vacationMap = this.storage.getVacationMapForMonth(yearMonth);
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

        csv += '\n\n';
        csv += 'LEGENDE\n';
        csv += 'Fr/Sa/So/Werktage;Klassifizierte Shares pro Slot (Halbdienste 0,5)\n';
        csv += 'Sieger-Variante;V1, V2 oder V3 - automatisch die Variante mit dem höchsten Bonus\n';
        csv += 'V1;"fr+so >= 1 UND weekday >= 3 (Halbiert bei Urlaub: 0,5 / 1,5)"\n';
        csv += 'V2;"sa >= 1 UND weekday >= 2 (Halbiert bei Urlaub: 0,5 / 1)"\n';
        csv += 'V3 (loose);"fr+sa+so >= 2 - wie bisher (Halbiert bei Urlaub: 1)"\n';
        csv += 'Urlaub;"Wenn JA: Schwellen und Abzüge halbiert"\n';
        csv += 'Sätze;"Werktag = 250 EUR/Einheit, Fr/Sa/So/Feiertag = 450 EUR/Einheit"\n';
        
        // Download CSV file
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Dienstplan_${year}_${String(month).padStart(2, '0')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast('CSV wurde exportiert. Öffnen Sie die Datei mit Excel oder LibreOffice.', 'success');
    }

    /**
     * Export a formal bonus report in HTML format
     * Opens in a new window for printing or saving as PDF
     */
    exportBonusReport() {

        const month = parseInt(document.getElementById('calc-month-select').value);
        const year = parseInt(document.getElementById('calc-year-select').value);
        
        // Calculate next month for payout date
        const payoutMonth = month % 12;
        const payoutYear = month === 12 ? year + 1 : year;
        
        const employeeDuties = this.storage.getAllEmployeeDutiesForMonth(year, month);
        const employees = Object.keys(employeeDuties);
        
        if (employees.length === 0) {
            this.showToast('Keine Dienste für diesen Monat vorhanden.', 'error');
            return;
        }
        
        // Escape HTML function
        const escapeHtml = (str) => {
            return String(str).replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        };
        
        // Group duties by employee and weekday
        const employeeData = {};
        for (const [name, duties] of Object.entries(employeeDuties)) {
            employeeData[name] = {
                duties: duties,
                byWeekday: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
            };

            duties.forEach(duty => {
                const dayOfWeek = duty.date.getDay();
                const isQualifying = this.calculator.isQualifyingDay(duty.date);

                employeeData[name].byWeekday[dayOfWeek].push({
                    ...duty,
                    isQual: isQualifying,
                    dayType: this.calculator.getDayTypeLabel(duty.date)
                });
            });
        }
        
        // Build HTML report
        let html = `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <title>Bonuszahlungen ${monthName(month)} ${year}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 40px;
            color: #333;
            line-height: 1.6;
        }
        h3 {
            color: #4472C4;
            border-bottom: 2px solid #4472C4;
            padding-bottom: 10px;
        }
        h5 {
            color: #666;
            margin-bottom: 20px;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 20px 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 10px 8px;
            text-align: center;
        }
        th {
            background-color: #4472C4;
            color: white;
            font-weight: bold;
        }
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        .employee-name {
            text-align: left;
            font-weight: bold;
        }
        .bonus-amount {
            font-weight: bold;
            color: #28a745;
        }
        .no-bonus {
            color: #dc3545;
        }
        .duty-cell {
            font-size: 0.85em;
        }
        .duty-cell .we-tag {
            background: #d4edda;
            color: #155724;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 0.9em;
        }
        .duty-cell .wt-tag {
            background: #e7e7e7;
            color: #666;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 0.9em;
        }
        .duty-cell .deducted-tag {
            background: #fff3cd;
            color: #856404;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 0.9em;
            border: 1px dashed #856404;
        }
        .employee-note {
            margin: 10px 0;
            padding: 10px;
            background: #f8f9fa;
            border-left: 3px solid #4472C4;
        }
        .employee-note b {
            color: #4472C4;
        }
        .summary {
            margin-top: 30px;
            padding: 20px;
            background: #e7f3ff;
            border-radius: 8px;
        }
        .total {
            font-size: 1.2em;
            font-weight: bold;
            color: #4472C4;
        }
        @media print {
            body { margin: 20px; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
<div class="no-print" style="margin-bottom: 20px; padding: 10px; background: #fff3cd; border-radius: 5px;">
    <button onclick="window.print()" style="padding: 8px 16px; background: #4472C4; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">🖨️ Drucken / Als PDF speichern</button>
    <span style="color: #666;">Tipp: Beim Drucken "Als PDF speichern" wählen für eine PDF-Datei.</span>
</div>

<h3>Bonuszahlungen</h3>
<h5>Monat ${monthName(month)} ${year} mit Auszahlung Ende ${monthName(payoutMonth + 1)} ${payoutYear}</h5>

<p>Für die im ${monthName(month)} ${year} geleisteten Bereitschaftsdienste ergeben sich folgende Bonuszahlungen:</p>

<table>
    <thead>
        <tr>
            <th>Mitarbeiter</th>
            <th>Mo</th>
            <th>Di</th>
            <th>Mi</th>
            <th>Do</th>
            <th>Fr</th>
            <th>Sa</th>
            <th>So</th>
            <th>Bonus (€)</th>
        </tr>
    </thead>
    <tbody>`;
        
        let totalBonus = 0;
        const employeeNotes = [];

        // Compute via BonusCalculator (uses winning variant)
        const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
        const vacationMap = this.storage.getVacationMapForMonth(yearMonth);
        const calcResults = this.calculator.calculateAllEmployees(employeeDuties, vacationMap);

        for (const [name, data] of Object.entries(employeeData)) {
            const calcRes = calcResults[name] || this.calculator.getEmptyResult();
            const bonus = calcRes.totalBonus;
            const w     = calcRes.winner;

            totalBonus += bonus;

            const safeName = escapeHtml(name);
            let note = '';
            if (bonus === 0 || !w.eligible) {
                note = `<b>${safeName}</b> erreicht in keiner der drei Varianten einen positiven Bonus${calcRes.isVacation ? ' (Urlaubsmodus aktiv)' : ''} und erhält daher keine Bonuszahlung.`;
            } else {
                const c = calcRes.classified;
                note = `<b>${safeName}</b> erhält eine Bonuszahlung von <span style="color: #28a745; font-weight: bold;">${this.calculator.formatCurrency(bonus)}</span> nach Variante ${w.variantId}${calcRes.isVacation ? ' (Urlaubsmodus aktiv)' : ''}. Klassifiziert: Fr ${c.fr.toFixed(1)} / Sa ${c.sa.toFixed(1)} / So ${c.so.toFixed(1)} / Werktage ${c.weekday.toFixed(1)}.`;
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
                        const shareStr = duty.share === 0.5 ? '½' : '';
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
        
        html += `
    </tbody>
</table>

<div class="summary">
    <p class="total">Gesamtsumme: ${this.calculator.formatCurrency(totalBonus)}</p>
</div>

<h4>Erläuterungen zu den einzelnen Mitarbeitern:</h4>
`;
        
        employeeNotes.forEach(note => {
            html += `<div class="employee-note">${note}</div>\n`;
        });
        
        html += `
<div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd;">
    <p><strong>Berechnungsregeln (NRW Psychiatrie 2011):</strong></p>
    <ul>
        <li><strong>Slots:</strong> Jeder Dienst wird in fr / sa / so / werktag klassifiziert. Tag vor Mo-Do-Feiertag = fr. Mo-Do-Feiertag = so. Sandwich-Tag (Feiertag + Tag-vor) = sa.</li>
        <li><strong>V1:</strong> fr+so ≥ 1 UND werktag ≥ 3 → Abzug 1 (Fr-Prio) + 3 werktag.</li>
        <li><strong>V2:</strong> sa ≥ 1 UND werktag ≥ 2 → Abzug 1 sa + 2 werktag.</li>
        <li><strong>V3 (loose):</strong> fr+sa+so ≥ 2 → Abzug 2 aus Pool (Prio fr → so → sa).</li>
        <li><strong>Auto-Select:</strong> Die Variante mit dem höchsten Bonus gewinnt; bei Gleichstand gewinnt die niedrigste Variantennummer.</li>
        <li><strong>Urlaubsmodus (≥14 Tage frei):</strong> Halbiert alle Schwellen UND Abzüge.</li>
        <li><strong>Sätze:</strong> Werktag = 250 EUR, Fr/Sa/So/Feiertag = 450 EUR.</li>
    </ul>
</div>

<p style="margin-top: 30px; color: #666; font-size: 0.9em;">
    Erstellt am: ${new Date().toLocaleDateString('de-DE')} | Dienstplan-Pro - NRW Psychiatrie 2011
</p>

</body>
</html>`;
        
        // Open in new window
        const reportWindow = window.open('', '_blank');
        if (reportWindow) {
            reportWindow.document.write(html);
            reportWindow.document.close();
            this.showToast('Bonus-Bericht wurde in einem neuen Fenster geöffnet.', 'success');
        } else {
            this.showToast('Popup wurde blockiert. Bitte erlauben Sie Popups für diese Seite.', 'error');
        }
    }

    /**
     * Import data from JSON file
     */
    importData() {
        const fileInput = document.getElementById('import-file');
        const file = fileInput.files[0];

        if (!file) {
            this.showToast('Bitte wählen Sie eine Datei aus.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const success = this.storage.importData(e.target.result);

            if (success) {
                this.showToast('Daten wurden erfolgreich importiert.', 'success');
                this.loadEmployeeList();
                this.loadEmployeeSelects();
                this.loadDutiesForSelectedEmployee();
            } else {
                this.showToast('Import fehlgeschlagen. Bitte überprüfen Sie die Datei.', 'error');
            }
        };

        reader.readAsText(file);
        fileInput.value = ''; // Reset file input
    }

    /**
     * Clear all data
     */
    clearAllData() {
        if (!confirm('Möchten Sie wirklich ALLE Daten löschen? Diese Aktion kann nicht rückgängig gemacht werden!')) {
            return;
        }

        this.storage.clearAll();
        this.showToast('Alle Daten wurden gelöscht.', 'info');
        this.loadEmployeeList();
        this.loadEmployeeSelects();
        this.loadDutiesForSelectedEmployee();
    }

    /**
     * Update the API-key status line in Settings.
     */
    refreshApiKeyStatus() {
        const el = document.getElementById('api-key-status');
        if (!el) return;
        if (this.storage.getApiKey()) {
            el.textContent = 'API-Key gespeichert';
            el.className = 'api-key-status-ok';
        } else {
            el.textContent = 'Kein Key hinterlegt';
            el.className = 'api-key-status-none';
        }
    }

    setApiKeyFromPrompt() {
        const input = window.prompt('OpenRouter API-Key eingeben:', '');
        if (input === null) return;
        const trimmed = input.trim();
        if (!trimmed) return;
        this.storage.setApiKey(trimmed);
        this.refreshApiKeyStatus();
        this.showToast('API-Key gespeichert.', 'success');
    }

    clearApiKey() {
        if (!window.confirm('API-Key wirklich loeschen?')) return;
        this.storage.clearApiKey();
        this.refreshApiKeyStatus();
        this.showToast('API-Key geloescht.', 'info');
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;

        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    formatNumber(num) {
        return num.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    }

}

// Initialize app when DOM is ready
let app;
document.addEventListener('DOMContentLoaded', async () => {
    if (window.DataSync) {
        try { await window.DataSync.boot(); }
        catch (e) { console.error('Sync-Boot fehlgeschlagen, App laeuft lokal weiter:', e); }
    }
    app = new DienstplanApp();
    window.app = app;

    // Bild-Import hier erzeugen (nicht in einem eigenen DOMContentLoaded-Listener):
    // window.app wird erst nach dem await oben gesetzt, ein paralleler Listener
    // liefe da noch ohne app und wuerde den Importer nie anlegen.
    if (window.ImageImporter && !window.imageImporter) {
        window.imageImporter = new window.ImageImporter(app);
    }
});
