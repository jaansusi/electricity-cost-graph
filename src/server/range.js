// Build per-day [start, end] ISO strings in Europe/Tallinn local time
// (offset flips between +02:00 and +03:00 with DST).
const TZ = "Europe/Tallinn";
function tallinnOffset(date) {
    // Format the date in Europe/Tallinn and read the offset.
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: TZ,
        timeZoneName: "longOffset",
        year: "numeric",
    }).formatToParts(date);
    const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+03:00";
    // tz looks like "GMT+03:00" or "GMT+02:00"
    const m = /GMT([+-]\d{2}):?(\d{2})/.exec(tz);
    if (!m)
        return "+03:00";
    return `${m[1]}:${m[2]}`;
}
function parseYmd(s) {
    const [y, m, d] = s.split("-").map(Number);
    return { y, m, d };
}
function ymdToUtcMidnight(y, m, d) {
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}
function addDays(s, n) {
    const { y, m, d } = parseYmd(s);
    const dt = ymdToUtcMidnight(y, m, d);
    dt.setUTCDate(dt.getUTCDate() + n);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
}
export function eachDay(start, end) {
    const out = [];
    let cur = start;
    while (cur <= end) {
        // Use noon local-ish to safely sample DST offset for that calendar day.
        const { y, m, d } = parseYmd(cur);
        const sample = new Date(Date.UTC(y, m - 1, d, 10, 0, 0, 0));
        const off = tallinnOffset(sample);
        const nextDay = addDays(cur, 1);
        const nextSample = new Date(Date.UTC(y, m - 1, d + 1, 10, 0, 0, 0));
        const nextOff = tallinnOffset(nextSample);
        out.push({
            date: cur,
            startInclusive: `${cur}T00:00:00.000${off}`,
            endExclusive: `${nextDay}T00:00:00.000${nextOff}`,
        });
        cur = nextDay;
    }
    return out;
}
export async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
            const i = next++;
            if (i >= items.length)
                return;
            results[i] = await fn(items[i], i);
        }
    });
    await Promise.all(workers);
    return results;
}
