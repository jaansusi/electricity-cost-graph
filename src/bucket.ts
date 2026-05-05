import type { UsageInterval } from "./api";

// Group quarter-hour intervals into N-hour buckets. Sums kWh and EUR cost; the
// per-bucket price is the weighted average (totalCost / totalKwh) so totals
// across the day remain identical to the raw series. Bucket timestamps are the
// floor of the bucket window, anchored to the local-day boundary inferred from
// each row's own offset.
export function bucketIntervals(
  intervals: UsageInterval[],
  hours: number,
): UsageInterval[] {
  if (hours <= 0 || intervals.length === 0) return intervals;
  if (hours === 0.25) return intervals;

  const groups = new Map<string, { ts: string; kwh: number; eurCost: number }>();
  for (const i of intervals) {
    if (!i.ts || i.ts.length < 16) continue;
    const date = i.ts.slice(0, 10);
    const hour = Number(i.ts.slice(11, 13));
    if (Number.isNaN(hour)) continue;
    const bucketHour = Math.floor(hour / hours) * hours;
    const hh = String(bucketHour).padStart(2, "0");
    const offset = i.ts.slice(19);
    const ts = `${date}T${hh}:00:00${offset}`;
    const prev = groups.get(ts);
    if (prev) {
      prev.kwh += i.kwh;
      prev.eurCost += i.eurCost;
    } else {
      groups.set(ts, { ts, kwh: i.kwh, eurCost: i.eurCost });
    }
  }

  return [...groups.values()]
    .map((g) => ({
      ts: g.ts,
      kwh: g.kwh,
      eurCost: g.eurCost,
      eurPerKwh: g.kwh > 0 ? g.eurCost / g.kwh : 0,
    }))
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
}
