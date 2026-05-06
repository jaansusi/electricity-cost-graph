import { useState } from "react";
import type { UsageInterval } from "../api";

interface Props {
  intervals: UsageInterval[];
  bucketHours: number;
}

type Metric = "eurCost" | "kwh";

const ROW_LIMIT = 10;

function fmtRange(ts: string, hours: number): string {
  const date = ts.slice(0, 10);
  const startH = Number(ts.slice(11, 13));
  const startM = ts.slice(14, 16);
  if (hours >= 24) return date;
  const start = `${String(startH).padStart(2, "0")}:${startM}`;
  const totalMin = startH * 60 + Number(startM) + Math.round(hours * 60);
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  const end = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
  return `${date} ${start}–${end}`;
}

export function TopPeriods({ intervals, bucketHours }: Props) {
  const [metric, setMetric] = useState<Metric>("eurCost");
  if (intervals.length === 0) return null;

  const sorted = [...intervals]
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, ROW_LIMIT);

  return (
    <div className="top-periods">
      <div className="top-periods-header">
        <h2>Highest value time periods</h2>
        <label>
          Metric
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as Metric)}
          >
            <option value="eurCost">Cost</option>
            <option value="kwh">kWh</option>
          </select>
        </label>
      </div>
      <table className="top-periods-table">
        <thead>
          <tr>
            <th className="rank">#</th>
            <th>Period</th>
            <th className="num">Cost</th>
            <th className="num">kWh</th>
            <th className="num">€/kWh</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.ts}>
              <td className="rank">{i + 1}</td>
              <td>{fmtRange(row.ts, bucketHours)}</td>
              <td className="num">€{row.eurCost.toFixed(2)}</td>
              <td className="num">{row.kwh.toFixed(2)}</td>
              <td className="num">€{row.eurPerKwh.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
