import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFile, stat } from "fs/promises";
import { extname, join, normalize, resolve } from "path";
import { createEnefitApiMiddleware } from "./api";

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";
const DIST = resolve(process.cwd(), "dist");

const MIME: Record<string, string> = {
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
  ".txt": "text/plain; charset=utf-8",
};

function safeJoin(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const joined = normalize(join(root, decoded));
  if (joined !== root && !joined.startsWith(root + "/")) return null;
  return joined;
}

async function tryFile(path: string): Promise<{ body: Buffer; type: string } | null> {
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

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
  // Hashed asset filenames from Vite (e.g. /assets/index-XXXX.js) are immutable.
  if (urlPath.startsWith("/assets/")) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("Cache-Control", "no-cache");
  }
  res.end(file.body);
}

const apiMiddleware = createEnefitApiMiddleware();

const server = createServer((req, res) => {
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
