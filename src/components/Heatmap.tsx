import { useState } from "react";
import type { UsageInterval } from "../api";

interface Props {
  intervals: UsageInterval[];
}

type Metric = "eurCost" | "kwh" | "eurPerKwh";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dowMonFirst(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function Heatmap({ intervals }: Props) {
  const [metric, setMetric] = useState<Metric>("eurCost");

  if (intervals.length === 0) return null;

  const sums = Array.from({ length: 7 }, () => Array(24).fill(0));
  const counts = Array.from({ length: 7 }, () => Array(24).fill(0));

  for (const i of intervals) {
    const d = new Date(i.ts);
    const dow = dowMonFirst(d);
    const hr = d.getHours();
    sums[dow][hr] += i[metric];
    counts[dow][hr] += 1;
  }

  // For cost/kwh we sum across the period (totals per slot).
  // For eurPerKwh we average since summing prices is meaningless.
  const cells = sums.map((row, di) =>
    row.map((s, hi) => {
      const c = counts[di][hi];
      if (c === 0) return null;
      return metric === "eurPerKwh" ? s / c : s;
    }),
  );

  let max = 0;
  for (const row of cells) for (const v of row) if (v !== null && v > max) max = v;

  const fmt = (v: number) =>
    metric === "kwh" ? `${v.toFixed(2)} kWh` : `€${v.toFixed(metric === "eurPerKwh" ? 4 : 2)}`;

  const label =
    metric === "eurCost"
      ? "Total cost by hour × weekday"
      : metric === "kwh"
        ? "Total consumption by hour × weekday"
        : "Average price by hour × weekday";

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{label}</h2>
        <div className="seg">
          <button className={metric === "eurCost" ? "on" : ""} onClick={() => setMetric("eurCost")}>
            Cost
          </button>
          <button className={metric === "kwh" ? "on" : ""} onClick={() => setMetric("kwh")}>
            kWh
          </button>
          <button className={metric === "eurPerKwh" ? "on" : ""} onClick={() => setMetric("eurPerKwh")}>
            €/kWh
          </button>
        </div>
      </div>
      <div className="heatmap">
        <div className="hm-corner" />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="hm-hour">
            {h % 3 === 0 ? h : ""}
          </div>
        ))}
        {DAYS.map((day, di) => (
          <Row key={day} day={day} cells={cells[di]} max={max} fmt={fmt} />
        ))}
      </div>
      <div className="hm-legend">
        <span>0</span>
        <div className="hm-bar" />
        <span>{max > 0 ? fmt(max) : "—"}</span>
      </div>
    </section>
  );
}

function Row({
  day,
  cells,
  max,
  fmt,
}: {
  day: string;
  cells: (number | null)[];
  max: number;
  fmt: (v: number) => string;
}) {
  return (
    <>
      <div className="hm-day">{day}</div>
      {cells.map((v, h) => {
        const t = v === null || max === 0 ? 0 : v / max;
        const bg =
          v === null
            ? "transparent"
            : `rgba(214, 51, 108, ${0.08 + t * 0.92})`;
        return (
          <div
            key={h}
            className="hm-cell"
            style={{ background: bg }}
            title={v === null ? `${day} ${h}:00 — no data` : `${day} ${h}:00 — ${fmt(v)}`}
          />
        );
      })}
    </>
  );
}
