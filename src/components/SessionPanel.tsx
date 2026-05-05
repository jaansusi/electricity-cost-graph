import { useEffect, useState } from "react";
import {
  clearSession,
  fetchSessionStatus,
  setSessionToken,
  type SessionStatus,
} from "../api";

interface Props {
  status: SessionStatus | null;
  onChange: (s: SessionStatus) => void;
}

export function SessionPanel({ status, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setMsg(null);
  }, [open]);

  const label = status
    ? status.configured && status.ok
      ? "Session active"
      : status.configured
        ? `Session invalid${status.upstream ? ` (${status.upstream})` : ""}`
        : "Session not set"
    : "Session …";

  const dotClass = status
    ? status.configured && status.ok
      ? "ok"
      : "bad"
    : "unknown";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const next = await setSessionToken(token.trim());
      onChange(next);
      setToken("");
      if (next.ok) {
        setMsg("Saved.");
        setOpen(false);
      } else {
        setMsg(`Saved, but upstream returned ${next.upstream ?? "?"}.`);
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setMsg(null);
    try {
      const next = await clearSession();
      onChange(next);
      setMsg("Cleared.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      const next = await fetchSessionStatus();
      onChange(next);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="session">
      <button
        type="button"
        className="session-toggle"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`session-dot session-dot-${dotClass}`} />
        {label}
      </button>
      {open && (
        <div className="session-pop">
          <div className="session-help">
            Paste the <code>ENEFITSESSION</code> cookie value from{" "}
            <code>iseteenindus.enefit.ee</code>. Stored in this browser's{" "}
            <code>localStorage</code> and sent on every request — the proxy
            keeps no state.
          </div>
          <form onSubmit={save}>
            <input
              type="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="ENEFITSESSION value…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <div className="session-actions">
              <button type="submit" disabled={busy || !token.trim()}>
                Save
              </button>
              <button type="button" onClick={refresh} disabled={busy}>
                Re-check
              </button>
              <button
                type="button"
                onClick={clear}
                disabled={busy || !status?.configured}
              >
                Clear
              </button>
            </div>
          </form>
          {msg && <div className="session-msg">{msg}</div>}
        </div>
      )}
    </div>
  );
}
