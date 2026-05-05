export interface UsageInterval {
  ts: string;
  kwh: number;
  eurPerKwh: number;
  eurCost: number;
}

export interface UsageResponse {
  intervals: UsageInterval[];
  totals: { kwh: number; eur: number };
  mode: "spot" | "flat";
}

export interface ApiError {
  error: string;
  hint?: string;
  detail?: string;
}

export interface MeteringPoint {
  identifier: string;
  address: string;
  type?: string;
}

export interface MeteringPointsResponse {
  points: MeteringPoint[];
}

export interface SessionStatus {
  configured: boolean;
  ok: boolean;
  upstream?: number;
}

const TOKEN_KEY = "enefit-session-v1";
const ROTATED_HEADER = "X-Enefit-Session-Rotated";
const REQUEST_HEADER = "X-Enefit-Session";

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function getStoredToken(): string {
  return readToken();
}

export function storeToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // private mode / quota — accept that the user will need to re-paste.
  }
}

type RotateListener = (token: string) => void;
const rotateListeners = new Set<RotateListener>();

export function onTokenRotated(fn: RotateListener): () => void {
  rotateListeners.add(fn);
  return () => rotateListeners.delete(fn);
}

async function request(input: string, init?: RequestInit): Promise<Response> {
  const token = readToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set(REQUEST_HEADER, token);
  const res = await fetch(input, { ...init, headers });
  const rotated = res.headers.get(ROTATED_HEADER);
  if (rotated && rotated !== token) {
    storeToken(rotated);
    for (const fn of rotateListeners) fn(rotated);
  }
  return res;
}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T | ApiError;
  if (!res.ok) {
    const err = body as ApiError;
    throw new Error(err.hint ? `${err.error} — ${err.hint}` : err.error);
  }
  return body as T;
}

export async function fetchUsage(
  start: string,
  end: string,
  point: string,
): Promise<UsageResponse> {
  const params = new URLSearchParams({ start, end, point });
  const res = await request(`/api/usage?${params.toString()}`);
  return parse<UsageResponse>(res);
}

export async function fetchMeteringPoints(): Promise<MeteringPointsResponse> {
  const res = await request("/api/metering-points");
  return parse<MeteringPointsResponse>(res);
}

// Hits /api/session with the currently-stored token (if any) and reports
// what the upstream said. The proxy holds no state — the token sent on the
// request is the only source of truth.
export async function fetchSessionStatus(): Promise<SessionStatus> {
  const res = await request("/api/session");
  return (await res.json()) as SessionStatus;
}

export async function setSessionToken(token: string): Promise<SessionStatus> {
  storeToken(token.trim());
  return fetchSessionStatus();
}

export async function clearSession(): Promise<SessionStatus> {
  storeToken("");
  return { configured: false, ok: false };
}
