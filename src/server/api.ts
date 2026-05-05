import type { Plugin, Connect } from "vite";
import {
  EnefitError,
  getConsumption,
  getMeteringPoints,
  getPrices,
  pingSession,
  type Session,
} from "./enefit";
import { eachDay, mapWithConcurrency } from "./range";

export interface UsageInterval {
  ts: string;
  kwh: number;
  eurPerKwh: number;
  eurCost: number;
}

const HEADER = "x-enefit-session";
const ROTATED_HEADER = "X-Enefit-Session-Rotated";

function ymdRegex(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function priceKeyFromIso(iso: string): string {
  return iso.slice(0, 10) + " " + iso.slice(11, 13);
}

function readToken(req: Connect.IncomingMessage): string {
  const raw = req.headers[HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

function exposeRotation(res: import("http").ServerResponse, session: Session): void {
  if (session.rotated) {
    res.setHeader(ROTATED_HEADER, session.rotated);
    // CORS isn't in play for same-origin Vite, but be explicit so any future
    // proxy / CDN doesn't strip a header the browser is supposed to read.
    res.setHeader("Access-Control-Expose-Headers", ROTATED_HEADER);
  }
}

async function handleUsage(session: Session, start: string, end: string, point: string) {
  const days = eachDay(start, end);

  const consPerDay = await mapWithConcurrency(days, 4, (d) =>
    getConsumption(session, point, d.startInclusive, d.endExclusive),
  );
  const prices = await getPrices(session, start, end);

  const priceByHour = new Map<string, number>();
  for (const p of prices) {
    if (p.hourKey) priceByHour.set(p.hourKey, p.eurPerKwh);
  }

  const intervals: UsageInterval[] = [];
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

  intervals.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  return {
    intervals,
    totals: { kwh: totalKwh, eur: totalEur },
    mode: "spot" as const,
  };
}

export function enefitApiPlugin(): Plugin {
  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url || !req.url.startsWith("/api/")) return next();

    const url = new URL(req.url, "http://local");
    res.setHeader("Content-Type", "application/json");

    const token = readToken(req);

    try {
      // Session check endpoint — used by the browser to verify a stored token
      // against the upstream without making a full data request.
      if (url.pathname === "/api/session" && req.method === "GET") {
        if (!token) {
          res.statusCode = 200;
          res.end(JSON.stringify({ configured: false, ok: false }));
          return;
        }
        const session: Session = { token };
        const r = await pingSession(session);
        exposeRotation(res, session);
        res.statusCode = 200;
        res.end(
          JSON.stringify({ configured: true, ok: r.ok, upstream: r.status }),
        );
        return;
      }

      if (!token) {
        res.statusCode = 401;
        res.end(
          JSON.stringify({
            error: "session not configured",
            hint: `send the ${HEADER} header with your ENEFITSESSION value`,
          }),
        );
        return;
      }

      const session: Session = { token };

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
            JSON.stringify({ error: "bad request", hint: "use start and end as YYYY-MM-DD" }),
          );
          return;
        }
        if (!point) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error: "no metering point",
              hint: "pass ?point=... (pick one from /api/metering-points)",
            }),
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
            hint: "update the session token from the app",
          }),
        );
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "upstream failure", detail: message }));
    }
  };

  return {
    name: "enefit-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
