import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { UsageInterval } from "../api";

interface Props {
  intervals: UsageInterval[];
}

type Metric =
  | "eurCost"
  | "kwh"
  | "eurPerKwh"
  | "cumEur"
  | "cumKwh";

const META: Record<
  Metric,
  {
    label: string;
    short: string;
    color: string;
    dashed?: boolean;
    format: (v: number) => string;
  }
> = {
  eurCost: {
    label: "Cost",
    short: "Cost",
    color: "#d6336c",
    format: (v) => `€${v.toFixed(2)}`,
  },
  kwh: {
    label: "Consumption",
    short: "kWh",
    color: "#4dabf7",
    format: (v) => `${v.toFixed(2)} kWh`,
  },
  eurPerKwh: {
    label: "Price",
    short: "€/kWh",
    color: "#37b24d",
    format: (v) => `€${v.toFixed(4)}`,
  },
  cumEur: {
    label: "Running cost",
    short: "Σ Cost",
    color: "#f06595",
    dashed: true,
    format: (v) => `€${v.toFixed(2)}`,
  },
  cumKwh: {
    label: "Running consumption",
    short: "Σ kWh",
    color: "#74c0fc",
    dashed: true,
    format: (v) => `${v.toFixed(2)} kWh`,
  },
};

const METRIC_KEYS: Metric[] = ["eurCost", "kwh", "eurPerKwh", "cumEur", "cumKwh"];

function formatTick(ts: string): string {
  return `${ts.slice(5, 10)} ${ts.slice(11, 16)}`;
}

export function CostChart({ intervals }: Props) {
  const [visible, setVisible] = useState<Record<Metric, boolean>>({
    eurCost: true,
    kwh: true,
    eurPerKwh: true,
    cumEur: false,
    cumKwh: false,
  });
  const [axisMetric, setAxisMetric] = useState<Metric>("eurCost");

  if (intervals.length === 0) return null;

  const toggle = (k: Metric) =>
    setVisible((v) => {
      const next = { ...v, [k]: !v[k] };
      // If we just hid the metric driving the Y axis, fall back to another visible one.
      if (!next[k] && axisMetric === k) {
        const fallback = METRIC_KEYS.find((m) => next[m]);
        if (fallback) setAxisMetric(fallback);
      } else if (next[k] && !v[axisMetric]) {
        setAxisMetric(k);
      }
      return next;
    });

  let runEur = 0;
  let runKwh = 0;
  const enriched = intervals.map((i) => {
    runEur += i.eurCost;
    runKwh += i.kwh;
    return {
      ts: i.ts,
      eurCost: i.eurCost,
      kwh: i.kwh,
      eurPerKwh: i.eurPerKwh,
      cumEur: runEur,
      cumKwh: runKwh,
    };
  });

  const maxes: Record<Metric, number> = {
    eurCost: Math.max(1e-9, ...enriched.map((i) => i.eurCost)),
    kwh: Math.max(1e-9, ...enriched.map((i) => i.kwh)),
    eurPerKwh: Math.max(1e-9, ...enriched.map((i) => i.eurPerKwh)),
    cumEur: Math.max(1e-9, ...enriched.map((i) => i.cumEur)),
    cumKwh: Math.max(1e-9, ...enriched.map((i) => i.cumKwh)),
  };

  // Each visible series is rescaled so its own peak lands at the axis-metric
  // peak — that way one series carries real units on the Y axis and the
  // others show comparable shape against it.
  const axisMax = maxes[axisMetric];
  const scales: Record<Metric, number> = {
    eurCost: axisMax / maxes.eurCost,
    kwh: axisMax / maxes.kwh,
    eurPerKwh: axisMax / maxes.eurPerKwh,
    cumEur: axisMax / maxes.cumEur,
    cumKwh: axisMax / maxes.cumKwh,
  };

  const data = enriched.map((i) => ({
    label: formatTick(i.ts),
    eurCost: i.eurCost,
    kwh: i.kwh,
    eurPerKwh: i.eurPerKwh,
    cumEur: i.cumEur,
    cumKwh: i.cumKwh,
    eurCost_s: i.eurCost * scales.eurCost,
    kwh_s: i.kwh * scales.kwh,
    eurPerKwh_s: i.eurPerKwh * scales.eurPerKwh,
    cumEur_s: i.cumEur * scales.cumEur,
    cumKwh_s: i.cumKwh * scales.cumKwh,
  }));

  const visibleKeys = METRIC_KEYS.filter((k) => visible[k]);
  const headingLabel =
    visibleKeys.length === 0
      ? "Select a metric"
      : visibleKeys.map((k) => META[k].label).join(" · ");

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{headingLabel}</h2>
        <div className="seg">
          {METRIC_KEYS.map((k) => (
            <button
              key={k}
              className={visible[k] ? "on" : ""}
              onClick={() => toggle(k)}
              style={visible[k] ? { background: META[k].color, borderColor: META[k].color } : {}}
            >
              {META[k].short}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={420}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 32 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={32}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fontSize: 11, fill: META[axisMetric].color }}
            tickFormatter={(v: number) => META[axisMetric].format(v)}
            width={80}
            domain={[0, axisMax]}
          />
          <Tooltip
            formatter={(_value: number, name: string, item) => {
              const p = item.payload as (typeof data)[number];
              const key = String(name).replace(/_s$/, "") as Metric;
              const meta = META[key];
              if (!meta) return [_value, name];
              return [meta.format(p[key] as number), meta.label];
            }}
          />
          {METRIC_KEYS.filter((k) => visible[k]).map((k) => (
            <Line
              key={k}
              type="monotone"
              dataKey={`${k}_s`}
              stroke={META[k].color}
              strokeWidth={k === axisMetric ? 2.5 : 2}
              strokeDasharray={META[k].dashed ? "4 3" : undefined}
              strokeOpacity={k === axisMetric ? 1 : 0.85}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="legend-row">
        {METRIC_KEYS.filter((k) => visible[k]).map((k) => {
          const isAxis = k === axisMetric;
          return (
            <button
              key={k}
              type="button"
              className={`legend-item${isAxis ? " on" : ""}`}
              onClick={() => setAxisMetric(k)}
              title={isAxis ? "Y-axis metric" : "Use as Y-axis"}
            >
              <span className="dot" style={{ background: META[k].color }} />
              {META[k].label} · max {META[k].format(maxes[k])}
              {isAxis && <span className="legend-axis-tag"> · Y axis</span>}
            </button>
          );
        })}
        <span className="panel-sub" style={{ marginLeft: "auto" }}>
          click a series to set the Y axis — others scale to match
        </span>
      </div>
    </section>
  );
}
