// In-Memory Rate-Limiter pro Key (Sliding Fixed-Window).
// ponytail: per-Prozess, resettet bei Container-Restart — bei Magic-Link (kein
// Passwort-Brute-Force) akzeptierte Ceiling; Persistenz = YAGNI.
const buckets = new Map();

/**
 * Zählt einen Treffer für `key`. Gibt true zurück, solange das Limit im Fenster
 * nicht überschritten ist, sonst false (→ Aufrufer antwortet 429).
 */
function hit(key, limit, windowMin) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMin * 60 * 1000 };
    buckets.set(key, b);
  }
  b.count += 1;
  return b.count <= limit;
}

function _reset() { buckets.clear(); } // nur für Tests

module.exports = { hit, _reset };
