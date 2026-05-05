const BASE = "https://iseteenindus.enefit.ee";
export class EnefitError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
function headers(token) {
    return {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-GB,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Safari/605.1.15",
        Referer: `${BASE}/et/usage`,
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        Cookie: `ENEFITSESSION=${token}`,
    };
}
function readSetCookies(res) {
    const h = res.headers;
    if (typeof h.getSetCookie === "function")
        return h.getSetCookie();
    const single = res.headers.get("set-cookie");
    return single ? [single] : [];
}
function captureRotation(session, res) {
    for (const raw of readSetCookies(res)) {
        const first = raw.split(";", 1)[0];
        const eq = first.indexOf("=");
        if (eq <= 0)
            continue;
        const name = first.slice(0, eq).trim();
        const value = first.slice(eq + 1).trim();
        if (name !== "ENEFITSESSION")
            continue;
        if (!value || value === "deleted")
            continue;
        if (value !== session.token) {
            session.rotated = value;
            // Subsequent calls in this same request should use the new value too.
            session.token = value;
        }
    }
}
async function getJson(url, session) {
    const res = await fetch(url, { headers: headers(session.token) });
    captureRotation(session, res);
    if (res.status === 401 || res.status === 403) {
        throw new EnefitError(res.status, "session expired");
    }
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new EnefitError(res.status, `enefit ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
}
export async function pingSession(session) {
    const res = await fetch(`${BASE}/api/v1/session`, { headers: headers(session.token) });
    captureRotation(session, res);
    await res.text().catch(() => "");
    return { ok: res.ok, status: res.status };
}
function pickString(...vals) {
    for (const v of vals) {
        if (typeof v === "string" && v.trim())
            return v.trim();
        if (typeof v === "number")
            return String(v);
    }
    return "";
}
function formatAddress(raw) {
    if (raw == null)
        return "";
    if (typeof raw === "string")
        return raw;
    if (typeof raw !== "object")
        return String(raw);
    const a = raw;
    const street = pickString(a.street, a.streetName, a.address, a.line1);
    const house = pickString(a.houseNumber, a.house, a.number);
    const apt = pickString(a.apartment, a.flat, a.apt);
    const city = pickString(a.city, a.settlement, a.town, a.locality);
    const county = pickString(a.county, a.region, a.state);
    const streetLine = [street, [house, apt].filter(Boolean).join("-")]
        .filter(Boolean)
        .join(" ")
        .trim();
    const tail = [city, county].filter(Boolean).join(", ");
    const joined = [streetLine, tail].filter(Boolean).join(", ");
    if (joined)
        return joined;
    const fallback = pickString(a.fullAddress, a.formatted, a.name, a.label, a.displayName);
    return fallback;
}
export async function getMeteringPoints(session) {
    const data = (await getJson(`${BASE}/api/v1/metering-points/active`, session));
    const rows = extractArray(data);
    const out = [];
    for (const r of rows) {
        const obj = r;
        const identifier = pickString(obj.consumptionPointIdentifier, obj.meteringPointIdentifier, obj.identifier, obj.eic, obj.id);
        if (!identifier)
            continue;
        const address = formatAddress(obj.address) ||
            pickString(obj.streetAddress, obj.fullAddress, obj.name, obj.objectName) ||
            identifier;
        const typeVal = obj.type ?? obj.meteringPointType ?? obj.objectType;
        const type = typeof typeVal === "string" && typeVal ? typeVal : undefined;
        out.push({ identifier, address, type });
    }
    return out;
}
export async function getConsumption(session, consumptionPoint, startInclusive, endExclusive) {
    const u = new URL(`${BASE}/api/v2/usage-data/consumption`);
    u.searchParams.set("consumptionPointIdentifier", consumptionPoint);
    u.searchParams.set("periodStartInclusive", startInclusive);
    u.searchParams.set("periodEndExclusive", endExclusive);
    u.searchParams.set("direction", "CONSUMPTION");
    u.searchParams.set("aggregationType", "HOURLY");
    const data = (await getJson(u.toString(), session));
    const rows = extractArray(data);
    const out = [];
    for (const r of rows) {
        const obj = r;
        const ts = String(obj.measurementTime ?? obj.startInclusive ?? obj.start ?? "");
        const kwh = Number(obj.amount ?? obj.measuredAmount ?? obj.value ?? obj.consumption ?? 0);
        if (!ts)
            continue;
        out.push({ ts, kwh });
    }
    return foldToHourly(out);
}
function foldToHourly(rows) {
    const byHour = new Map();
    for (const r of rows) {
        const key = r.ts.slice(0, 13);
        const prev = byHour.get(key);
        if (prev)
            prev.kwh += r.kwh;
        else
            byHour.set(key, { ts: r.ts.slice(0, 13) + ":00:00" + r.ts.slice(19), kwh: r.kwh });
    }
    return [...byHour.values()].sort((a, b) => (a.ts < b.ts ? -1 : 1));
}
export async function getPrices(session, startDate, endDate) {
    const u = new URL(`${BASE}/api/v1/market-prices`);
    u.searchParams.set("start-date", startDate);
    u.searchParams.set("end-date", endDate);
    u.searchParams.set("interval", "HOUR");
    u.searchParams.set("country", "EE");
    const data = (await getJson(u.toString(), session));
    const rows = extractArray(data);
    return rows.map((r) => {
        const obj = r;
        const dt = String(obj.dateTime ?? obj.startInclusive ?? obj.time ?? "");
        const hourKey = dt.slice(0, 13);
        const raw = Number(obj.price ?? obj.value ?? obj.amount ?? 0);
        const eurPerKwh = raw / 1000;
        return { hourKey, eurPerKwh };
    });
}
function extractArray(data) {
    if (Array.isArray(data))
        return data;
    if (data && typeof data === "object") {
        const obj = data;
        for (const key of ["data", "items", "results", "intervals", "points", "values"]) {
            const v = obj[key];
            if (Array.isArray(v))
                return v;
        }
    }
    return [];
}
