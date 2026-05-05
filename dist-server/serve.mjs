// src/server/serve.ts
import { createServer } from "http";
import { readFile, stat } from "fs/promises";
import { extname, join, normalize, resolve } from "path";

// src/server/enefit.ts
var BASE = "https://iseteenindus.enefit.ee";
var EnefitError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
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
    Cookie: `ENEFITSESSION=${token}`
  };
}
function readSetCookies(res) {
  const h = res.headers;
  if (typeof h.getSetCookie === "function") return h.getSetCookie();
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}
function captureRotation(session, res) {
  for (const raw of readSetCookies(res)) {
    const first = raw.split(";", 1)[0];
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (name !== "ENEFITSESSION") continue;
    if (!value || value === "deleted") continue;
    if (value !== session.token) {
      session.rotated = value;
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
async function pingSession(session) {
  const res = await fetch(`${BASE}/api/v1/session`, { headers: headers(session.token) });
  captureRotation(session, res);
  await res.text().catch(() => "");
  return { ok: res.ok, status: res.status };
}
function pickString(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}
function formatAddress(raw) {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw !== "object") return String(raw);
  const a = raw;
  const street = pickString(a.street, a.streetName, a.address, a.line1);
  const house = pickString(a.houseNumber, a.house, a.number);
  const apt = pickString(a.apartment, a.flat, a.apt);
  const city = pickString(a.city, a.settlement, a.town, a.locality);
  const county = pickString(a.county, a.region, a.state);
  const streetLine = [street, [house, apt].filter(Boolean).join("-")].filter(Boolean).join(" ").trim();
  const tail = [city, county].filter(Boolean).join(", ");
  const joined = [streetLine, tail].filter(Boolean).join(", ");
  if (joined) return joined;
  const fallback = pickString(
    a.fullAddress,
    a.formatted,
    a.name,
    a.label,
    a.displayName
  );
  return fallback;
}
async function getMeteringPoints(session) {
  const data = await getJson(`${BASE}/api/v1/metering-points/active`, session);
  const rows = extractArray(data);
  const out = [];
  for (const r of rows) {
    const obj = r;
    const identifier = pickString(
      obj.consumptionPointIdentifier,
      obj.meteringPointIdentifier,
      obj.identifier,
      obj.eic,
      obj.id
    );
    if (!identifier) continue;
    const address = formatAddress(obj.address) || pickString(obj.streetAddress, obj.fullAddress, obj.name, obj.objectName) || identifier;
    const typeVal = obj.type ?? obj.meteringPointType ?? obj.objectType;
    const type = typeof typeVal === "string" && typeVal ? typeVal : void 0;
    out.push({ identifier, address, type });
  }
  return out;
}
async function getConsumption(session, consumptionPoint, startInclusive, endExclusive) {
  const u = new URL(`${BASE}/api/v2/usage-data/consumption`);
  u.searchParams.set("consumptionPointIdentifier", consumptionPoint);
  u.searchParams.set("periodStartInclusive", startInclusive);
  u.searchParams.set("periodEndExclusive", endExclusive);
  u.searchParams.set("direction", "CONSUMPTION");
  u.searchParams.set("aggregationType", "HOURLY");
  const data = await getJson(u.toString(), session);
  const rows = extractArray(data);
  const out = [];
  for (const r of rows) {
    const obj = r;
    const ts = String(obj.measurementTime ?? obj.startInclusive ?? obj.start ?? "");
    const kwh = Number(obj.amount ?? obj.measuredAmount ?? obj.value ?? obj.consumption ?? 0);
    if (!ts) continue;
    out.push({ ts, kwh });
  }
  return foldToHourly(out);
}
function foldToHourly(rows) {
  const byHour = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const key = r.ts.slice(0, 13);
    const prev = byHour.get(key);
    if (prev) prev.kwh += r.kwh;
    else byHour.set(key, { ts: r.ts.slice(0, 13) + ":00:00" + r.ts.slice(19), kwh: r.kwh });
  }
  return [...byHour.values()].sort((a, b) => a.ts < b.ts ? -1 : 1);
}
async function getPrices(session, startDate, endDate) {
  const u = new URL(`${BASE}/api/v1/market-prices`);
  u.searchParams.set("start-date", startDate);
  u.searchParams.set("end-date", endDate);
  u.searchParams.set("interval", "HOUR");
  u.searchParams.set("country", "EE");
  const data = await getJson(u.toString(), session);
  const rows = extractArray(data);
  return rows.map((r) => {
    const obj = r;
    const dt = String(obj.dateTime ?? obj.startInclusive ?? obj.time ?? "");
    const hourKey = dt.slice(0, 13);
    const raw = Number(obj.price ?? obj.value ?? obj.amount ?? 0);
    const eurPerKwh = raw / 1e3;
    return { hourKey, eurPerKwh };
  });
}
function extractArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const obj = data;
    for (const key of ["data", "items", "results", "intervals", "points", "values"]) {
      const v = obj[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

// src/server/range.ts
var TZ = "Europe/Tallinn";
function tallinnOffset(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    timeZoneName: "longOffset",
    year: "numeric"
  }).formatToParts(date);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+03:00";
  const m = /GMT([+-]\d{2}):?(\d{2})/.exec(tz);
  if (!m) return "+03:00";
  return `${m[1]}:${m[2]}`;
}
function parseYmd(s) {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}
function ymdToUtcMidnight(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}
function addDays(s, n) {
  const { y, m, d } = parseYmd(s);
  const dt = ymdToUtcMidnight(y, m, d);
  dt.setUTCDate(dt.getUTCDate() + n);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
function eachDay(start, end) {
  const out = [];
  let cur = start;
  while (cur <= end) {
    const { y, m, d } = parseYmd(cur);
    const sample = new Date(Date.UTC(y, m - 1, d, 10, 0, 0, 0));
    const off = tallinnOffset(sample);
    const nextDay = addDays(cur, 1);
    const nextSample = new Date(Date.UTC(y, m - 1, d + 1, 10, 0, 0, 0));
    const nextOff = tallinnOffset(nextSample);
    out.push({
      date: cur,
      startInclusive: `${cur}T00:00:00.000${off}`,
      endExclusive: `${nextDay}T00:00:00.000${nextOff}`
    });
    cur = nextDay;
  }
  return out;
}
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// src/server/api.ts
var HEADER = "x-enefit-session";
var ROTATED_HEADER = "X-Enefit-Session-Rotated";
function ymdRegex(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function priceKeyFromIso(iso) {
  return iso.slice(0, 10) + " " + iso.slice(11, 13);
}
function readToken(req) {
  const raw = req.headers[HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}
function exposeRotation(res, session) {
  if (session.rotated) {
    res.setHeader(ROTATED_HEADER, session.rotated);
    res.setHeader("Access-Control-Expose-Headers", ROTATED_HEADER);
  }
}
async function handleUsage(session, start, end, point) {
  const days = eachDay(start, end);
  const consPerDay = await mapWithConcurrency(
    days,
    4,
    (d) => getConsumption(session, point, d.startInclusive, d.endExclusive)
  );
  const prices = await getPrices(session, start, end);
  const priceByHour = /* @__PURE__ */ new Map();
  for (const p of prices) {
    if (p.hourKey) priceByHour.set(p.hourKey, p.eurPerKwh);
  }
  const intervals = [];
  let totalKwh = 0;
  let totalEur = 0;
  for (const day of consPerDay) {
    for (const c of day) {
      if (!c.ts) continue;
      const eurPerKwh = priceByHour.get(priceKeyFromIso(c.ts)) ?? 0;
      const eurCost = c.kwh * eurPerKwh;
      intervals.push({ ts: c.ts, kwh: c.kwh, eurPerKwh, eurCost });
      totalKwh += c.kwh;
      totalEur += eurCost;
    }
  }
  intervals.sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
  return {
    intervals,
    totals: { kwh: totalKwh, eur: totalEur },
    mode: "spot"
  };
}
function createEnefitApiMiddleware() {
  const middleware = async (req, res, next) => {
    if (!req.url || !req.url.startsWith("/api/")) return next();
    const url = new URL(req.url, "http://local");
    res.setHeader("Content-Type", "application/json");
    const token = readToken(req);
    try {
      if (url.pathname === "/api/session" && req.method === "GET") {
        if (!token) {
          res.statusCode = 200;
          res.end(JSON.stringify({ configured: false, ok: false }));
          return;
        }
        const session2 = { token };
        const r = await pingSession(session2);
        exposeRotation(res, session2);
        res.statusCode = 200;
        res.end(
          JSON.stringify({ configured: true, ok: r.ok, upstream: r.status })
        );
        return;
      }
      if (!token) {
        res.statusCode = 401;
        res.end(
          JSON.stringify({
            error: "session not configured",
            hint: `send the ${HEADER} header with your ENEFITSESSION value`
          })
        );
        return;
      }
      const session = { token };
      if (url.pathname === "/api/metering-points") {
        const points = await getMeteringPoints(session);
        exposeRotation(res, session);
        res.statusCode = 200;
        res.end(JSON.stringify({ points }));
        return;
      }
      if (url.pathname === "/api/usage") {
        const start = url.searchParams.get("start") ?? "";
        const end = url.searchParams.get("end") ?? start;
        const point = url.searchParams.get("point") ?? "";
        if (!ymdRegex(start) || !ymdRegex(end) || end < start) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({ error: "bad request", hint: "use start and end as YYYY-MM-DD" })
          );
          return;
        }
        if (!point) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error: "no metering point",
              hint: "pass ?point=... (pick one from /api/metering-points)"
            })
          );
          return;
        }
        const data = await handleUsage(session, start, end, point);
        exposeRotation(res, session);
        res.statusCode = 200;
        res.end(JSON.stringify(data));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
    } catch (err) {
      if (err instanceof EnefitError && (err.status === 401 || err.status === 403)) {
        res.statusCode = 401;
        res.end(
          JSON.stringify({
            error: "session expired",
            hint: "update the session token from the app"
          })
        );
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "upstream failure", detail: message }));
    }
  };
  return middleware;
}

// src/server/serve.ts
var PORT = Number(process.env.PORT ?? 8080);
var HOST = process.env.HOST ?? "0.0.0.0";
var DIST = resolve(process.cwd(), "dist");
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};
function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const joined = normalize(join(root, decoded));
  if (joined !== root && !joined.startsWith(root + "/")) return null;
  return joined;
}
async function tryFile(path) {
  try {
    const s = await stat(path);
    if (!s.isFile()) return null;
    const body = await readFile(path);
    const type = MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
    return { body, type };
  } catch {
    return null;
  }
}
async function serveStatic(req, res) {
  const urlPath = (req.url ?? "/").split("?")[0];
  const candidate = safeJoin(DIST, urlPath === "/" ? "/index.html" : urlPath);
  let file = candidate ? await tryFile(candidate) : null;
  if (!file) {
    const fallback = join(DIST, "index.html");
    file = await tryFile(fallback);
  }
  if (!file) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("not found");
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", file.type);
  if (urlPath.startsWith("/assets/")) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("Cache-Control", "no-cache");
  }
  res.end(file.body);
}
var apiMiddleware = createEnefitApiMiddleware();
var server = createServer((req, res) => {
  if (req.url && req.url.startsWith("/api/")) {
    apiMiddleware(req, res, () => {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "not found" }));
    });
    return;
  }
  serveStatic(req, res).catch((err) => {
    console.error("static serve failure", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("internal error");
  });
});
server.listen(PORT, HOST, () => {
  console.log(`enefit-price-graph listening on http://${HOST}:${PORT}`);
});
