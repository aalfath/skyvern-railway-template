// Small helper server for Skyvern on Railway, run next to the API (port 9090, private network).
//
// 1. /artifact/{image,recording,json,text}?path=... serves screenshots, recordings and logs that the
//    API writes to its /data volume. Upstream runs this server in the UI container and shares a Docker
//    volume; Railway volumes can't be shared, so it runs here. Paths outside /data are refused.
// 2. /bootstrap/api-key hands the organization API key, which upstream's entrypoint creates on first
//    start, to the UI service. It needs the SKYVERN_UI_BOOTSTRAP_TOKEN header.
import { createServer } from "node:http";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.ARTIFACT_PORT || 9090);
const DATA_ROOT = resolve(process.env.DATA_ROOT || "/data");
const CREDENTIALS_FILE = process.env.SKYVERN_CREDENTIALS_FILE || `${DATA_ROOT}/.skyvern/credentials.toml`;
const BOOTSTRAP_TOKEN = process.env.SKYVERN_UI_BOOTSTRAP_TOKEN || "";
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
