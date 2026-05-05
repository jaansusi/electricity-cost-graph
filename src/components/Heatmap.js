import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function dowMonFirst(d) {
    return (d.getDay() + 6) % 7;
}
export function Heatmap({ intervals }) {
    const [metric, setMetric] = useState("eurCost");
    if (intervals.length === 0)
        return null;
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
    const cells = sums.map((row, di) => row.map((s, hi) => {
        const c = counts[di][hi];
        if (c === 0)
            return null;
        return metric === "eurPerKwh" ? s / c : s;
    }));
    let max = 0;
    for (const row of cells)
        for (const v of row)
            if (v !== null && v > max)
                max = v;
    const fmt = (v) => metric === "kwh" ? `${v.toFixed(2)} kWh` : `€${v.toFixed(metric === "eurPerKwh" ? 4 : 2)}`;
    const label = metric === "eurCost"
        ? "Total cost by hour × weekday"
        : metric === "kwh"
            ? "Total consumption by hour × weekday"
            : "Average price by hour × weekday";
    return (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-head", children: [_jsx("h2", { children: label }), _jsxs("div", { className: "seg", children: [_jsx("button", { className: metric === "eurCost" ? "on" : "", onClick: () => setMetric("eurCost"), children: "Cost" }), _jsx("button", { className: metric === "kwh" ? "on" : "", onClick: () => setMetric("kwh"), children: "kWh" }), _jsx("button", { className: metric === "eurPerKwh" ? "on" : "", onClick: () => setMetric("eurPerKwh"), children: "\u20AC/kWh" })] })] }), _jsxs("div", { className: "heatmap", children: [_jsx("div", { className: "hm-corner" }), Array.from({ length: 24 }, (_, h) => (_jsx("div", { className: "hm-hour", children: h % 3 === 0 ? h : "" }, h))), DAYS.map((day, di) => (_jsx(Row, { day: day, cells: cells[di], max: max, fmt: fmt }, day)))] }), _jsxs("div", { className: "hm-legend", children: [_jsx("span", { children: "0" }), _jsx("div", { className: "hm-bar" }), _jsx("span", { children: max > 0 ? fmt(max) : "—" })] })] }));
}
function Row({ day, cells, max, fmt, }) {
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "hm-day", children: day }), cells.map((v, h) => {
                const t = v === null || max === 0 ? 0 : v / max;
                const bg = v === null
                    ? "transparent"
                    : `rgba(214, 51, 108, ${0.08 + t * 0.92})`;
                return (_jsx("div", { className: "hm-cell", style: { background: bg }, title: v === null ? `${day} ${h}:00 — no data` : `${day} ${h}:00 — ${fmt(v)}` }, h));
            })] }));
}
