import { useEffect, useState } from "react";
import {
  fetchMeteringPoints,
  fetchSessionStatus,
  fetchUsage,
  type MeteringPoint,
  type SessionStatus,
  type UsageResponse,
} from "./api";
import ReactDatePicker, { registerLocale } from "react-datepicker";
import { enGB } from "date-fns/locale/en-GB";
import "react-datepicker/dist/react-datepicker.css";

registerLocale("en-GB", enGB);
import { CostChart } from "./components/CostChart";
import { Heatmap } from "./components/Heatmap";
import { SessionPanel } from "./components/SessionPanel";
import { Summary } from "./components/Summary";

const STORAGE_KEY = "enefit-prefs-v1";

interface StoredPrefs {
  start?: string;
  end?: string;
  point?: string;
}

function loadPrefs(): StoredPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredPrefs;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePrefs(p: StoredPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // quota / private mode — ignore.
  }
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function defaultRange(): { start: string; end: string } {
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
  const [points, setPoints] = useState<MeteringPoint[]>([]);
  const [point, setPoint] = useState<string>(stored.point ?? "");
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionStatus | null>(null);

  async function load(s: string, e: string, p: string) {
    if (!p) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetchUsage(s, e, p);
      setData(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function bootstrap(s: SessionStatus) {
    if (!s.configured || !s.ok) return;
    try {
      const r = await fetchMeteringPoints();
      setPoints(r.points);
      const storedValid =
        stored.point && r.points.some((pt) => pt.identifier === stored.point)
          ? stored.point
          : null;
      const initial = storedValid ?? r.points[0]?.identifier ?? "";
      setPoint(initial);
      const sd = stored.start ?? init.start;
      const ed = stored.end ?? init.end;
      if (initial) await load(sd, ed, initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const s = await fetchSessionStatus();
        setSession(s);
        await bootstrap(s);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep-alive: poll the upstream session every 5 minutes from the browser so
  // ENEFITSESSION keeps refreshing while the tab is open. Each request also
  // captures any rotated token via the X-Enefit-Session-Rotated header.
  useEffect(() => {
    const id = setInterval(
      () => {
        void fetchSessionStatus().then((s) => setSession(s)).catch(() => {});
      },
      5 * 60 * 1000,
    );
    return () => clearInterval(id);
  }, []);

  function onSessionChange(s: SessionStatus) {
    setSession(s);
    if (s.configured && s.ok && points.length === 0) {
      void bootstrap(s);
    }
  }

  useEffect(() => {
    savePrefs({ start, end, point: point || undefined });
  }, [start, end, point]);

  return (
    <div className="app">
      <header>
        <div className="header-row">
          <div>
            <h1>Enefit cost graph</h1>
            <p className="subtitle">When did you spend the most on electricity?</p>
          </div>
          <SessionPanel status={session} onChange={onSessionChange} />
        </div>
      </header>

      <form
        className="controls"
        onSubmit={(e) => {
          e.preventDefault();
          load(start, end, point);
        }}
      >
        <label>
          Metering point
          <select
            value={point}
            onChange={(e) => setPoint(e.target.value)}
            disabled={points.length === 0}
          >
            {points.length === 0 && <option value="">—</option>}
            {points.map((p) => (
              <option key={p.identifier} value={p.identifier}>
                {p.address}
                {p.type ? ` (${p.type})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Start
          <ReactDatePicker
            selected={parseYmd(start)}
            onChange={(d: Date | null) => d && setStart(ymd(d))}
            maxDate={parseYmd(end) ?? new Date()}
            dateFormat="yyyy-MM-dd"
            locale="en-GB"
            showWeekNumbers
            todayButton="Today"
            className="dp-input"
          />
        </label>
        <label>
          End
          <ReactDatePicker
            selected={parseYmd(end)}
            onChange={(d: Date | null) => d && setEnd(ymd(d))}
            minDate={parseYmd(start) ?? undefined}
            maxDate={new Date()}
            dateFormat="yyyy-MM-dd"
            locale="en-GB"
            showWeekNumbers
            todayButton="Today"
            className="dp-input"
          />
        </label>
        <button type="submit" disabled={loading || !point}>
          {loading ? "Loading…" : "Load"}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {data && (
        <>
          <Summary data={data} />
          <CostChart intervals={data.intervals} />
          <Heatmap intervals={data.intervals} />
        </>
      )}

      {!error && !data && !loading && <p>No data yet.</p>}
    </div>
  );
}
