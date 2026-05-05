import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { clearSession, fetchSessionStatus, setSessionToken, } from "../api";
export function SessionPanel({ status, onChange }) {
    const [open, setOpen] = useState(false);
    const [token, setToken] = useState("");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);
    useEffect(() => {
        if (!open)
            setMsg(null);
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
    async function save(e) {
        e.preventDefault();
        if (!token.trim())
            return;
        setBusy(true);
        setMsg(null);
        try {
            const next = await setSessionToken(token.trim());
            onChange(next);
            setToken("");
            if (next.ok) {
                setMsg("Saved.");
                setOpen(false);
            }
            else {
                setMsg(`Saved, but upstream returned ${next.upstream ?? "?"}.`);
            }
        }
        catch (err) {
            setMsg(err instanceof Error ? err.message : String(err));
        }
        finally {
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
        }
        catch (err) {
            setMsg(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy(false);
        }
    }
    async function refresh() {
        setBusy(true);
        setMsg(null);
        try {
            const next = await fetchSessionStatus();
            onChange(next);
        }
        catch (err) {
            setMsg(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { className: "session", children: [_jsxs("button", { type: "button", className: "session-toggle", onClick: () => setOpen((o) => !o), children: [_jsx("span", { className: `session-dot session-dot-${dotClass}` }), label] }), open && (_jsxs("div", { className: "session-pop", children: [_jsxs("div", { className: "session-help", children: ["Paste the ", _jsx("code", { children: "ENEFITSESSION" }), " cookie value from", " ", _jsx("code", { children: "iseteenindus.enefit.ee" }), ". Stored in this browser's", " ", _jsx("code", { children: "localStorage" }), " and sent on every request \u2014 the proxy keeps no state."] }), _jsxs("form", { onSubmit: save, children: [_jsx("input", { type: "password", autoComplete: "off", spellCheck: false, placeholder: "ENEFITSESSION value\u2026", value: token, onChange: (e) => setToken(e.target.value) }), _jsxs("div", { className: "session-actions", children: [_jsx("button", { type: "submit", disabled: busy || !token.trim(), children: "Save" }), _jsx("button", { type: "button", onClick: refresh, disabled: busy, children: "Re-check" }), _jsx("button", { type: "button", onClick: clear, disabled: busy || !status?.configured, children: "Clear" })] })] }), msg && _jsx("div", { className: "session-msg", children: msg })] }))] }));
}
