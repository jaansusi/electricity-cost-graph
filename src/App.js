import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { fetchMeteringPoints, fetchSessionStatus, fetchUsage, } from "./api";
import ReactDatePicker, { registerLocale } from "react-datepicker";
import { enGB } from "date-fns/locale/en-GB";
import "react-datepicker/dist/react-datepicker.css";
registerLocale("en-GB", enGB);
import { CostChart } from "./components/CostChart";
import { Heatmap } from "./components/Heatmap";
import { SessionPanel } from "./components/SessionPanel";
import { Summary } from "./components/Summary";
const STORAGE_KEY = "enefit-prefs-v1";
function loadPrefs() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    }
    catch {
        return {};
    }
}
function savePrefs(p) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    }
    catch {
        // quota / private mode — ignore.
    }
}
function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
}
function parseYmd(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m)
        return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function defaultRange() {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 6);
    return { start: ymd(weekAgo), end: ymd(today) };
}
export function App() {
    const init = defaultRange();
    const stored = loadPrefs();
    const [start, setStart] = useState(stored.start ?? init.start);
    const [end, setEnd] = useState(stored.end ?? init.end);
    const [points, setPoints] = useState([]);
    const [point, setPoint] = useState(stored.point ?? "");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [session, setSession] = useState(null);
    async function load(s, e, p) {
        if (!p)
            return;
        setLoading(true);
        setError(null);
        try {
            const r = await fetchUsage(s, e, p);
            setData(r);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setData(null);
        }
        finally {
            setLoading(false);
        }
    }
    async function bootstrap(s) {
        if (!s.configured || !s.ok)
            return;
        try {
            const r = await fetchMeteringPoints();
            setPoints(r.points);
            const storedValid = stored.point && r.points.some((pt) => pt.identifier === stored.point)
                ? stored.point
                : null;
            const initial = storedValid ?? r.points[0]?.identifier ?? "";
            setPoint(initial);
            const sd = stored.start ?? init.start;
            const ed = stored.end ?? init.end;
            if (initial)
                await load(sd, ed, initial);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }
    useEffect(() => {
        (async () => {
            try {
                const s = await fetchSessionStatus();
                setSession(s);
                await bootstrap(s);
            }
            catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Keep-alive: poll the upstream session every 5 minutes from the browser so
    // ENEFITSESSION keeps refreshing while the tab is open. Each request also
    // captures any rotated token via the X-Enefit-Session-Rotated header.
    useEffect(() => {
        const id = setInterval(() => {
            void fetchSessionStatus().then((s) => setSession(s)).catch(() => { });
        }, 5 * 60 * 1000);
        return () => clearInterval(id);
    }, []);
    function onSessionChange(s) {
        setSession(s);
        if (s.configured && s.ok && points.length === 0) {
            void bootstrap(s);
        }
    }
    useEffect(() => {
        savePrefs({ start, end, point: point || undefined });
    }, [start, end, point]);
    return (_jsxs("div", { className: "app", children: [_jsx("header", { children: _jsxs("div", { className: "header-row", children: [_jsxs("div", { children: [_jsx("h1", { children: "Enefit cost graph" }), _jsx("p", { className: "subtitle", children: "When did you spend the most on electricity?" })] }), _jsx(SessionPanel, { status: session, onChange: onSessionChange })] }) }), _jsxs("form", { className: "controls", onSubmit: (e) => {
                    e.preventDefault();
                    load(start, end, point);
                }, children: [_jsxs("label", { children: ["Metering point", _jsxs("select", { value: point, onChange: (e) => setPoint(e.target.value), disabled: points.length === 0, children: [points.length === 0 && _jsx("option", { value: "", children: "\u2014" }), points.map((p) => (_jsxs("option", { value: p.identifier, children: [p.address, p.type ? ` (${p.type})` : ""] }, p.identifier)))] })] }), _jsxs("label", { children: ["Start", _jsx(ReactDatePicker, { selected: parseYmd(start), onChange: (d) => d && setStart(ymd(d)), maxDate: parseYmd(end) ?? new Date(), dateFormat: "yyyy-MM-dd", locale: "en-GB", showWeekNumbers: true, todayButton: "Today", className: "dp-input" })] }), _jsxs("label", { children: ["End", _jsx(ReactDatePicker, { selected: parseYmd(end), onChange: (d) => d && setEnd(ymd(d)), minDate: parseYmd(start) ?? undefined, maxDate: new Date(), dateFormat: "yyyy-MM-dd", locale: "en-GB", showWeekNumbers: true, todayButton: "Today", className: "dp-input" })] }), _jsx("button", { type: "submit", disabled: loading || !point, children: loading ? "Loading…" : "Load" })] }), error && _jsx("div", { className: "error", children: error }), data && (_jsxs(_Fragment, { children: [_jsx(Summary, { data: data }), _jsx(CostChart, { intervals: data.intervals }), _jsx(Heatmap, { intervals: data.intervals })] })), !error && !data && !loading && _jsx("p", { children: "No data yet." })] }));
}
