/**
 * Bonus-Varianten (NRW Psychiatrie 2011)
 * Pure functions: day classification + V1/V2/V3 evaluation.
 * Loaded after holidays.js and before calculator.js.
 */

// Will be implemented in subsequent tasks.
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

function classifyDuties(duties, holidayProvider) {
    const result = { fr: 0, sa: 0, so: 0, weekday: 0 };
    if (!Array.isArray(duties)) return result;
    for (const duty of duties) {
        const slot = classify(duty.date, holidayProvider);
        result[slot] += duty.share;
    }
    return result;
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
