import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function fmtTs(ts) {
    return `${ts.slice(0, 10)} ${ts.slice(11, 16)}`;
}
export function Summary({ data }) {
    const { intervals, totals, mode } = data;
    if (intervals.length === 0)
        return null;
    const peakCost = intervals.reduce((a, b) => (b.eurCost > a.eurCost ? b : a));
    const peakKwh = intervals.reduce((a, b) => (b.kwh > a.kwh ? b : a));
    const avgPrice = totals.kwh > 0 ? totals.eur / totals.kwh : 0;
    return (_jsxs("div", { className: "summary", children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "label", children: "Total cost" }), _jsxs("div", { className: "value", children: ["\u20AC", totals.eur.toFixed(2)] })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "label", children: "Total energy" }), _jsxs("div", { className: "value", children: [totals.kwh.toFixed(2), " kWh"] })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "label", children: "Average price" }), _jsxs("div", { className: "value", children: ["\u20AC", avgPrice.toFixed(4), "/kWh"] })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "label", children: "Most expensive 15-min" }), _jsxs("div", { className: "value", children: ["\u20AC", peakCost.eurCost.toFixed(4)] }), _jsx("div", { className: "sub", children: fmtTs(peakCost.ts) })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "label", children: "Highest consumption 15-min" }), _jsxs("div", { className: "value", children: [peakKwh.kwh.toFixed(3), " kWh"] }), _jsx("div", { className: "sub", children: fmtTs(peakKwh.ts) })] }), _jsxs("div", { className: "card mode", children: [_jsx("div", { className: "label", children: "Pricing mode" }), _jsx("div", { className: "value", children: mode })] })] }));
}
