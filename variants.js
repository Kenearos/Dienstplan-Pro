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

// The three variants differ only in threshold, eligibility and deduction.
// The empty-result shape, the paid-shares/bonus math and the priority-order
// deduction loop are shared below.

function ineligibleResult(variantId, threshold) {
    return {
        variantId,
        eligible: false,
        threshold,
        deduction: { fr: 0, sa: 0, so: 0, weekday: 0 },
        paidShares: { fr: 0, sa: 0, so: 0, weekday: 0 },
        bonus: 0
    };
}

// paidShares = classified minus deduction per slot. Never-deducted slots have
// deduction 0, so max(0, x - 0) === x. Weekend slots pay RATE_WEEKEND.
function payResult(variantId, threshold, classified, deduction) {
    const paidShares = {
        fr:      Math.max(0, classified.fr      - deduction.fr),
        sa:      Math.max(0, classified.sa      - deduction.sa),
        so:      Math.max(0, classified.so      - deduction.so),
        weekday: Math.max(0, classified.weekday - deduction.weekday)
    };
    const bonus = (paidShares.fr + paidShares.sa + paidShares.so) * RATE_WEEKEND
                + paidShares.weekday * RATE_NORMAL;
    return { variantId, eligible: true, threshold, deduction, paidShares, bonus };
}

// Deduct `amount` across `order` slots (Friday-priority), writing into deduction.
function deductInOrder(classified, order, amount, deduction) {
    let remaining = amount;
    for (const slot of order) {
        const take = Math.min(remaining, classified[slot]);
        deduction[slot] = take;
        remaining -= take;
        if (remaining <= 1e-9) break;
    }
}

function variant1(classified, isVacation) {
    const frSoThreshold    = isVacation ? 0.5 : 1;
    const weekdayThreshold = isVacation ? 1.5 : 3;
    const frSoDeduction    = isVacation ? 0.5 : 1;
    const weekdayDeduction = isVacation ? 1.5 : 3;
    const threshold = { frSo: frSoThreshold, weekday: weekdayThreshold };

    const frSoPool = classified.fr + classified.so;
    const eligible = (frSoPool >= frSoThreshold - 1e-9)
                  && (classified.weekday >= weekdayThreshold - 1e-9);
    if (!eligible) return ineligibleResult(1, threshold);

    // Friday priority within fr+so pool: fr first, then so. sa never deducted.
    const deduction = { fr: 0, sa: 0, so: 0, weekday: weekdayDeduction };
    deductInOrder(classified, ['fr', 'so'], frSoDeduction, deduction);
    return payResult(1, threshold, classified, deduction);
}

function variant2(classified, isVacation) {
    const saThreshold      = isVacation ? 0.5 : 1;
    const weekdayThreshold = isVacation ? 1   : 2;
    const saDeduction      = isVacation ? 0.5 : 1;
    const weekdayDeduction = isVacation ? 1   : 2;
    const threshold = { sa: saThreshold, weekday: weekdayThreshold };

    const eligible = (classified.sa >= saThreshold - 1e-9)
                  && (classified.weekday >= weekdayThreshold - 1e-9);
    if (!eligible) return ineligibleResult(2, threshold);

    // fr and so never deducted in V2.
    const deduction = { fr: 0, sa: saDeduction, so: 0, weekday: weekdayDeduction };
    return payResult(2, threshold, classified, deduction);
}

function variant3(classified, isVacation) {
    const poolThreshold  = isVacation ? 1 : 2;
    const totalDeduction = isVacation ? 1 : 2;
    const threshold = { pool: poolThreshold };

    const pool = classified.fr + classified.sa + classified.so;
    const eligible = pool >= poolThreshold - 1e-9;
    if (!eligible) return ineligibleResult(3, threshold);

    // Friday priority: fr -> so -> sa. weekday never deducted.
    const deduction = { fr: 0, sa: 0, so: 0, weekday: 0 };
    deductInOrder(classified, ['fr', 'so', 'sa'], totalDeduction, deduction);
    return payResult(3, threshold, classified, deduction);
}

// Expose globally (Browser) + require-bar (Node-Tests)
if (typeof window !== 'undefined') {
  window.classify = classify;
  window.classifyDuties = classifyDuties;
  window.variant1 = variant1;
  window.variant2 = variant2;
  window.variant3 = variant3;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { classify, classifyDuties, variant1, variant2, variant3, RATE_NORMAL, RATE_WEEKEND };
}
