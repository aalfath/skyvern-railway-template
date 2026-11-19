// Serves a "Skyvern is starting" page on :8080 while it polls the API's bootstrap endpoint for the
// organization API key. Prints the key on stdout and exits once it has it (the real UI then starts).
import { createServer } from "node:http";

const url = process.env.SKYVERN_BOOTSTRAP_URL;
const token = process.env.SKYVERN_UI_BOOTSTRAP_TOKEN || "";
const deadline = Date.now() + Number(process.env.SKYVERN_BOOTSTRAP_TIMEOUT_SEC || 1800) * 1000;
if (!url || !token) {
  console.error("SKYVERN_BOOTSTRAP_URL and SKYVERN_UI_BOOTSTRAP_TOKEN must be set");
  process.exit(1);
}

const page = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="10">
<title>Skyvern is starting</title></head><body style="font-family:sans-serif;margin:3em">
<h1>Skyvern is starting</h1><p>The API is running its first-start setup. This page reloads every 10 seconds.</p>
</body></html>`;
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(page);
}).listen(8080);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = "";
while (Date.now() < deadline) {
  try {
    const r = await fetch(url, { headers: { "x-bootstrap-token": token }, signal: AbortSignal.timeout(5000) });
    const body = (await r.text()).trim();
    if (r.ok && body) {
      server.close();
      server.closeAllConnections?.();
      await sleep(500);
      process.stdout.write(body);
      process.exit(0);
    }
    last = `HTTP ${r.status}`;
  } catch (e) {
    last = e?.cause?.code || e?.name || "error";
  }
  console.error(`Waiting for the Skyvern API key (${last})...`);
  await sleep(5000);
}
console.error("Timed out waiting for the Skyvern API key");
process.exit(1);
