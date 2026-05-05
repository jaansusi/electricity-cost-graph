const TOKEN_KEY = "enefit-session-v1";
const ROTATED_HEADER = "X-Enefit-Session-Rotated";
const REQUEST_HEADER = "X-Enefit-Session";
function readToken() {
    try {
        return localStorage.getItem(TOKEN_KEY) ?? "";
    }
    catch {
        return "";
    }
}
export function getStoredToken() {
    return readToken();
}
export function storeToken(token) {
    try {
        if (token)
            localStorage.setItem(TOKEN_KEY, token);
        else
            localStorage.removeItem(TOKEN_KEY);
    }
    catch {
        // private mode / quota — accept that the user will need to re-paste.
    }
}
const rotateListeners = new Set();
export function onTokenRotated(fn) {
    rotateListeners.add(fn);
    return () => rotateListeners.delete(fn);
}
async function request(input, init) {
    const token = readToken();
    const headers = new Headers(init?.headers);
    if (token)
        headers.set(REQUEST_HEADER, token);
    const res = await fetch(input, { ...init, headers });
    const rotated = res.headers.get(ROTATED_HEADER);
    if (rotated && rotated !== token) {
        storeToken(rotated);
        for (const fn of rotateListeners)
            fn(rotated);
    }
    return res;
}
async function parse(res) {
    const body = (await res.json());
    if (!res.ok) {
        const err = body;
        throw new Error(err.hint ? `${err.error} — ${err.hint}` : err.error);
    }
    return body;
}
export async function fetchUsage(start, end, point) {
    const params = new URLSearchParams({ start, end, point });
    const res = await request(`/api/usage?${params.toString()}`);
    return parse(res);
}
export async function fetchMeteringPoints() {
    const res = await request("/api/metering-points");
    return parse(res);
}
// Hits /api/session with the currently-stored token (if any) and reports
// what the upstream said. The proxy holds no state — the token sent on the
// request is the only source of truth.
export async function fetchSessionStatus() {
    const res = await request("/api/session");
    return (await res.json());
}
export async function setSessionToken(token) {
    storeToken(token.trim());
    return fetchSessionStatus();
}
export async function clearSession() {
    storeToken("");
    return { configured: false, ok: false };
}
