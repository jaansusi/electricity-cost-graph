import type { UsageResponse } from "../api";

interface Props {
  data: UsageResponse;
}

function fmtTs(ts: string): string {
  return `${ts.slice(0, 10)} ${ts.slice(11, 16)}`;
}

export function Summary({ data }: Props) {
  const { intervals, totals, mode } = data;
  if (intervals.length === 0) return null;

  const peakCost = intervals.reduce((a, b) => (b.eurCost > a.eurCost ? b : a));
  const peakKwh = intervals.reduce((a, b) => (b.kwh > a.kwh ? b : a));
  const avgPrice = totals.kwh > 0 ? totals.eur / totals.kwh : 0;

  return (
    <div className="summary">
      <div className="card">
        <div className="label">Total cost</div>
        <div className="value">€{totals.eur.toFixed(2)}</div>
      </div>
      <div className="card">
        <div className="label">Total energy</div>
        <div className="value">{totals.kwh.toFixed(2)} kWh</div>
      </div>
      <div className="card">
        <div className="label">Average price</div>
        <div className="value">€{avgPrice.toFixed(4)}/kWh</div>
      </div>
      <div className="card">
        <div className="label">Most expensive 15-min</div>
        <div className="value">€{peakCost.eurCost.toFixed(4)}</div>
        <div className="sub">{fmtTs(peakCost.ts)}</div>
      </div>
      <div className="card">
        <div className="label">Highest consumption 15-min</div>
        <div className="value">{peakKwh.kwh.toFixed(3)} kWh</div>
        <div className="sub">{fmtTs(peakKwh.ts)}</div>
      </div>
      <div className="card mode">
        <div className="label">Pricing mode</div>
        <div className="value">{mode}</div>
      </div>
    </div>
  );
}
