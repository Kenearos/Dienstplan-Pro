/**
 * Bonus-Varianten (NRW Psychiatrie 2011)
 * Pure functions: day classification + V1/V2/V3 evaluation.
 * Loaded after holidays.js and before calculator.js.
 */

const RATE_NORMAL  = 250;
const RATE_WEEKEND = 450;

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
            bonus: 0
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
        bonus
    };
}

function variant2(classified, isVacation) {
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
            bonus: 0
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
        bonus
    };
}

function variant3(classified, isVacation) {
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
            bonus: 0
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
        bonus
    };
}

// Expose globally
window.classify = classify;
window.classifyDuties = classifyDuties;
window.variant1 = variant1;
window.variant2 = variant2;
window.variant3 = variant3;
