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
