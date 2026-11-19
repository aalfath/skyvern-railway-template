// Small helper server for Skyvern on Railway, run next to the API (port 9090, private network).
//
// 1. /artifact/{image,recording,json,text}?path=... serves screenshots, recordings and logs that the
//    API writes to its /data volume. Upstream runs this server in the UI container and shares a Docker
//    volume; Railway volumes can't be shared, so it runs here. Paths outside /data are refused.
// 2. /bootstrap/api-key hands the organization API key, which upstream's entrypoint creates on first
//    start, to the UI service. It needs the SKYVERN_UI_BOOTSTRAP_TOKEN header.
// 3. /api/v1/internal/{auth,llms}/status are diagnostics the API answers only for loopback callers, so
//    behind any proxy the UI shows "Unable to verify Skyvern API key". The gateway routes them here and
//    this server relays them over 127.0.0.1. llms/status is relayed only for a caller with a valid Skyvern
//    key or UI session (checked against /api/v1/organizations); auth/status only reports whether a key is valid.
import { createServer, request as httpRequest } from "node:http";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.ARTIFACT_PORT || 9090);
const DATA_ROOT = resolve(process.env.DATA_ROOT || "/data");
const CREDENTIALS_FILE = process.env.SKYVERN_CREDENTIALS_FILE || `${DATA_ROOT}/.skyvern/credentials.toml`;
const BOOTSTRAP_TOKEN = process.env.SKYVERN_UI_BOOTSTRAP_TOKEN || "";
const API_PORT = Number(process.env.PORT || 8000);
const INTERNAL_PATHS = new Set(["/api/v1/internal/auth/status", "/api/v1/internal/llms/status"]);

// GET a loopback API path with the caller's key headers; resolves { status, headers, body }.
function loopbackGet(path, req) {
  const headers = {};
  for (const h of ["x-api-key", "authorization", "x-user-agent"]) {
    if (req.headers[h]) headers[h] = req.headers[h];
  }
  return new Promise((done) => {
    const r = httpRequest({ host: "127.0.0.1", port: API_PORT, path, method: "GET", headers, timeout: 15000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => done({ status: res.statusCode || 502, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", () => done({ status: 502, headers: {}, body: Buffer.from("Skyvern API not reachable") }));
    r.end();
  });
}

async function relayInternal(url, req, res) {
  if (url.pathname.endsWith("/llms/status")) {
    // Any authenticated API route accepts the UI session token or the x-api-key; use it as the gate.
    const auth = await loopbackGet("/api/v1/organizations", req);
    if (auth.status !== 200) return send(res, 403, "A valid Skyvern API key or UI session is required");
  }
  const out = await loopbackGet(url.pathname + url.search, req);
  res.writeHead(out.status, { "content-type": out.headers["content-type"] || "application/json", "cache-control": "no-store" });
  res.end(out.body);
}
const TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".mp4": "video/mp4", ".webm": "video/webm", ".json": "application/json",
  ".txt": "text/plain; charset=utf-8", ".log": "text/plain; charset=utf-8", ".har": "application/json",
  ".html": "text/plain; charset=utf-8" };

function send(res, code, body, type = "text/plain; charset=utf-8") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

// Accepts a raw path or a file:// URI (both are sent by the UI); returns a path inside DATA_ROOT or null.
function resolveDataPath(raw) {
  if (!raw) return null;
  let p = raw;
  if (p.startsWith("file://")) {
    try { p = decodeURIComponent(new URL(p).pathname); } catch { return null; }
  }
  const full = resolve(p);
  if (full !== DATA_ROOT && !full.startsWith(DATA_ROOT + sep)) return null;
  return full;
}

function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");

  if (url.pathname === "/healthz") return send(res, 200, "ok");
  if (INTERNAL_PATHS.has(url.pathname)) return void relayInternal(url, req, res);

  if (url.pathname === "/bootstrap/api-key") {
    const token = String(req.headers["x-bootstrap-token"] || "");
    if (!BOOTSTRAP_TOKEN || !safeEqual(token, BOOTSTRAP_TOKEN)) return send(res, 403, "Forbidden");
    let key = "";
    try {
      const m = readFileSync(CREDENTIALS_FILE, "utf8").match(/cred\s*=\s*"([^"]+)"/);
      key = m ? m[1] : "";
    } catch {}
    if (!key) return send(res, 503, "Skyvern API key not created yet");
    return send(res, 200, key);
  }

  if (!url.pathname.startsWith("/artifact/")) return send(res, 404, "Not found");
  const file = resolveDataPath(url.searchParams.get("path"));
  if (!file) return send(res, 400, "Invalid path");
  let st;
  try { st = statSync(file); } catch { return send(res, 404, "Not found"); }
  if (!st.isFile()) return send(res, 404, "Not found");
  const type = TYPES[extname(file).toLowerCase()] || "application/octet-stream";

  if (url.pathname === "/artifact/recording") {
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = Math.min(range[2] ? Number(range[2]) : start + 1e6, st.size - 1);
      if (start >= st.size || start > end) {
        res.writeHead(416, { "content-range": `bytes */${st.size}` });
        return res.end();
      }
      res.writeHead(206, { "content-range": `bytes ${start}-${end}/${st.size}`, "accept-ranges": "bytes",
        "content-length": end - start + 1, "content-type": type === "application/octet-stream" ? "video/mp4" : type });
      return createReadStream(file, { start, end }).pipe(res);
    }
  }
  if (url.pathname === "/artifact/json") {
    try { JSON.parse(readFileSync(file, "utf8")); } catch { return send(res, 500, "Invalid JSON"); }
    res.writeHead(200, { "content-type": "application/json", "content-length": st.size });
    return createReadStream(file).pipe(res);
  }
  const outType = url.pathname === "/artifact/text" ? "text/plain; charset=utf-8" : type;
  res.writeHead(200, { "content-type": outType, "content-length": st.size, "accept-ranges": "bytes" });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Skyvern artifact/bootstrap server on :${PORT} (root ${DATA_ROOT})`));
