import type { UsageInterval } from "./api";

// All rates in this file are VAT-included (Estonia VAT 24%). The spot price
// returned by Enefit's market-prices API is ex-VAT, so we multiply it by VAT
// in applyAllCharges. Regulatory + balancing per-kWh charges and the energy-
// supplier monthly fee always apply, regardless of which network package is
// selected — they appear on every Estonian electricity bill.
//
// Day window (used by Võrk 2/4/5): Mon–Fri 07:00–22:00 local Tallinn time.
// Holidays are treated as regular weekdays here for simplicity. Enefit returns
// timestamps with the Tallinn offset already baked in, so the hour digits in
// the ISO string equal the local hour and we don't need to reparse the zone.

export type PackageId = "none" | "vork1" | "vork2" | "vork4" | "vork5";

export interface NetworkPackage {
  id: PackageId;
  name: string;
  description: string;
  monthlyFeeEur: number;
  rate: (hour: number, weekday: number, month: number) => number;
}

export const VAT = 1.24;

// Per-kWh regulatory charges, ex-VAT, from the Pikk 47-9 / Varsa 11 bills:
//   renewable energy 0.0084 + supply security 0.00758 + excise 0.0021.
// Same on both meters, so we treat them as a flat constant.
const REGULATORY_PER_KWH_EX = 0.0084 + 0.00758 + 0.0021;
export const REGULATORY_PER_KWH = REGULATORY_PER_KWH_EX * VAT;

// Energy-supplier balancing fee, charged per kWh on top of the spot price.
const BALANCING_PER_KWH_EX = 0.00373;
export const BALANCING_PER_KWH = BALANCING_PER_KWH_EX * VAT;

// Energy-supplier monthly fee (Enefit "Muutuv" package), charged once per
// calendar month. Prorated by days in the selected range.
const ENERGY_MONTHLY_EX = 1.658;
export const ENERGY_MONTHLY = ENERGY_MONTHLY_EX * VAT;

const c = (cents: number) => cents / 100;

function isDay(hour: number, weekday: number): boolean {
  return weekday >= 1 && weekday <= 5 && hour >= 7 && hour < 22;
}

function isVork5Peak(hour: number, weekday: number, month: number): boolean {
  if (weekday < 1 || weekday > 5) return false;
  const winter = month <= 3 || month >= 11;
  if (!winter) return false;
  return (hour >= 9 && hour < 12) || (hour >= 16 && hour < 20);
}

export const PACKAGES: NetworkPackage[] = [
  {
    id: "none",
    name: "None",
    description: "Spot energy + regulatory & supplier charges only",
    monthlyFeeEur: 0,
    rate: () => 0,
  },
  {
    id: "vork1",
    name: "Võrk 1",
    description: "Flat 9.57 ¢/kWh — small consumers (<350 kWh/year)",
    monthlyFeeEur: 2.63,
    rate: () => c(9.57),
  },
  {
    id: "vork2",
    name: "Võrk 2",
    description: "Day 7.53 / night 4.35 ¢/kWh — 350–2 600 kWh/year",
    // 1x20A connection, matches the Varsa 11 bill (7.23 € ex-VAT).
    monthlyFeeEur: 8.97,
    rate: (h, d) => (isDay(h, d) ? c(7.53) : c(4.35)),
  },
  {
    id: "vork4",
    name: "Võrk 4",
    description: "Day 4.58 / night 2.60 ¢/kWh — over 2 600 kWh/year",
    // Apartment (korter), matches the Pikk 47-9 bill (7.18 € ex-VAT).
    monthlyFeeEur: 8.9,
    rate: (h, d) => (isDay(h, d) ? c(4.58) : c(2.6)),
  },
  {
    id: "vork5",
    name: "Võrk 5",
    description:
      "Peak 10.14 / day 6.56 / night 3.76 ¢/kWh — peak Nov–Mar weekdays 9–12 & 16–20",
    monthlyFeeEur: 4.01,
    rate: (h, d, m) => {
      if (isVork5Peak(h, d, m)) return c(10.14);
      if (isDay(h, d)) return c(6.56);
      return c(3.76);
    },
  },
];

export function getPackage(id: PackageId): NetworkPackage {
  return PACKAGES.find((p) => p.id === id) ?? PACKAGES[0];
}

// Apply VAT to spot energy and add the regulatory + balancing per-kWh charges
// plus the network package's per-kWh rate. Per-interval costs returned here
// are VAT-included.
export function applyNetwork(
  intervals: UsageInterval[],
  pkg: NetworkPackage,
): UsageInterval[] {
  return intervals.map((i) => {
    if (!i.ts || i.ts.length < 16) return i;
    const hour = Number(i.ts.slice(11, 13));
    const y = Number(i.ts.slice(0, 4));
    const m = Number(i.ts.slice(5, 7));
    const d = Number(i.ts.slice(8, 10));
    const weekday = new Date(y, m - 1, d).getDay();
    const netRate = pkg.rate(hour, weekday, m);
    const perKwh = netRate + REGULATORY_PER_KWH + BALANCING_PER_KWH;
    const energyIncl = i.eurCost * VAT;
    const eurCost = energyIncl + i.kwh * perKwh;
    const eurPerKwh = i.kwh > 0 ? eurCost / i.kwh : i.eurPerKwh * VAT + perKwh;
    return { ts: i.ts, kwh: i.kwh, eurPerKwh, eurCost };
  });
}

// Approximate the monthly fixed fee contribution for a date range (inclusive
// YYYY-MM-DD). Combines the network-package monthly fee with the energy-
// supplier monthly fee. Uses calendar days / 30.44 so a 7-day range shows
// ~23 % of a month, which is what a customer would actually owe on a
// prorated bill.
export function monthlyFeeForRange(
  start: string,
  end: string,
  pkg: NetworkPackage,
  networkOverride?: number,
): number {
  const s = parseYmd(start);
  const e = parseYmd(end);
  if (!s || !e) return 0;
  const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
  const months = days / 30.44;
  const networkMonthly = networkOverride ?? pkg.monthlyFeeEur;
  return months * (networkMonthly + ENERGY_MONTHLY);
}

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
