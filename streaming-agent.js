// streaming-agent.mjs
import http from "node:http";
import { WebSocketServer } from "ws";
import { BrowserManager } from "agent-browser/dist/browser.js";

const html = `<!doctype html>
<html>
  <body style="margin:0;background:#111;display:flex;justify-content:center;align-items:center;height:100vh;">
    <img id="view" style="max-width:100%;max-height:100%;"/>
    <script>
      const img = document.getElementById("view");
      const ws = new WebSocket("ws://localhost:3000");
      ws.onopen = () => console.log("ws open");
      ws.onerror = (e) => console.log("ws error", e);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "frame") {
          img.src = "data:image/jpeg;base64," + msg.data;
        }
      };
    </script>
  </body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });
wss.on("connection", () => {
  console.log("viewer connected");
});

const broadcast = (payload) => {
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
};

const browser = new BrowserManager();

// --- CRITICAL CONFIGURATION CHANGES ---
await browser.launch({
  // Use "new" headless mode if supported (it is harder to detect than true)
  headless: "new", 
  // A standard, believable User Agent
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  args: [
    // --- STEALTH FLAGS (To bypass "Blocked" messages) ---
    "--disable-blink-features=AutomationControlled", // Hides "navigator.webdriver"
    "--disable-infobars",
    "--exclude-switches=enable-automation",
    
    // --- RENDERING FLAGS (To fix "Grey Screen" on screencast) ---
    "--use-gl=swiftshader", // Forces rendering in headless
    "--enable-surface-synchronization",
    
    // --- STABILITY FLAGS ---
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--window-size=1280,720"
  ]
});

await browser.startScreencast(
  (frame) => {
    broadcast({ type: "frame", data: frame.data, metadata: frame.metadata });
  },
  { format: "jpeg", quality: 80, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 }
);

const page = browser.getPage();

// --- EXTRA STEALTH: Manually delete the 'webdriver' property ---
// This runs inside the browser before the page loads. 
// It is the most effective way to trick Reddit/Amazon.
if (page.evaluateOnNewDocument) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
  });
}

// Now go to the target URL
await page.goto("https://www.amazon.com", { waitUntil: "domcontentloaded" });

if (page.setViewport) {
    await page.setViewport({ width: 1280, height: 720 });
}

await page.waitForTimeout(3000);
await page.screenshot({ path: "debug.png", fullPage: true });

server.listen(3000, () => {
  console.log("Viewer at http://localhost:3000");
});

const shutdown = async () => {
  await browser.stopScreencast();
  await browser.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);