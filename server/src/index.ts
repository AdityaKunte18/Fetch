import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { BrowserManager } from "agent-browser/dist/browser.js";
import { executeCommand } from "agent-browser/dist/actions.js";
import type { WebSocket } from "ws";
import type { NavigateData } from "agent-browser/dist/types.js";

const fastify = Fastify({ logger: true });

const FRAME_INTERVAL_MS = 66; // ~15 fps

function send(socket: WebSocket, msg: Record<string, unknown>) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

let cmdId = 0;
function nextId() {
  return String(++cmdId);
}

// One browser session per WebSocket connection
interface Session {
  browser: BrowserManager;
  currentUrl: string;
  frameTimer: ReturnType<typeof setInterval> | null;
}

const sessions = new Map<WebSocket, Session>();

function startFrameLoop(socket: WebSocket, session: Session) {
  if (session.frameTimer) return;

  let capturing = false;
  session.frameTimer = setInterval(async () => {
    if (capturing) return; // skip if previous capture is still in-flight
    if (!session.browser.isLaunched()) return;

    capturing = true;
    try {
      const page = session.browser.getPage();
      const buffer = await page.screenshot({
        type: "jpeg",
        quality: 60,
      });
      send(socket, {
        type: "frame",
        data: buffer.toString("base64"),
      });
    } catch {
      // page may be navigating, ignore
    } finally {
      capturing = false;
    }
  }, FRAME_INTERVAL_MS);
}

function stopFrameLoop(session: Session) {
  if (session.frameTimer) {
    clearInterval(session.frameTimer);
    session.frameTimer = null;
  }
}

async function ensureSession(socket: WebSocket): Promise<Session> {
  let session = sessions.get(socket);
  if (session && session.browser.isLaunched()) {
    return session;
  }

  const browser = new BrowserManager();

  send(socket, {
    type: "status",
    data: "Launching browser...",
    status: "thinking",
  });

  const launchRes = await executeCommand(
    { id: nextId(), action: "launch", headless: true },
    browser
  );
  if (!launchRes.success) {
    throw new Error(`Launch failed: ${launchRes.error}`);
  }

  session = { browser, currentUrl: "", frameTimer: null };
  sessions.set(socket, session);

  // Start continuous frame capture
  startFrameLoop(socket, session);

  return session;
}

async function destroySession(socket: WebSocket) {
  const session = sessions.get(socket);
  if (!session) return;
  sessions.delete(socket);

  stopFrameLoop(session);

  try {
    await session.browser.close();
  } catch {
    // ignore
  }
}

async function handleCommand(
  socket: WebSocket,
  payload: { url: string; instruction: string }
) {
  const { url, instruction } = payload;

  try {
    const session = await ensureSession(socket);

    // ── Navigate ────────────────────────────────────────────
    send(socket, {
      type: "status",
      data: `Navigating to ${url}`,
      status: "scraping",
    });

    const navRes = await executeCommand(
      { id: nextId(), action: "navigate", url },
      session.browser
    );

    if (navRes.success) {
      const navData = navRes.data as NavigateData;
      session.currentUrl = navData.url ?? url;
      send(socket, {
        type: "status",
        data: `Page loaded: ${navData.title ?? url}`,
        status: "scraping",
      });
      send(socket, {
        type: "navigate",
        data: session.currentUrl,
        title: navData.title ?? "",
      });
    }

    // ── Snapshot (accessibility tree) ────────────────────────
    send(socket, {
      type: "status",
      data: `Analyzing page: "${instruction}"`,
      status: "scraping",
    });

    const snapshot = await session.browser.getSnapshot({ interactive: true });

    send(socket, {
      type: "result",
      data: snapshot.tree,
      status: "done",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send(socket, {
      type: "error",
      data: `Error: ${message}`,
      status: "error",
    });
    await destroySession(socket);
  }
}

const start = async () => {
  await fastify.register(websocket);

  fastify.get("/health", async () => ({ ok: true }));

  fastify.get("/ws", { websocket: true }, (socket) => {
    socket.on("message", (raw: Buffer) => {
      let parsed: { type?: string; url?: string; instruction?: string };
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        send(socket, {
          type: "error",
          data: "Invalid JSON",
          status: "error",
        });
        return;
      }

      if (
        parsed.type === "command" &&
        typeof parsed.url === "string" &&
        typeof parsed.instruction === "string"
      ) {
        handleCommand(socket, {
          url: parsed.url,
          instruction: parsed.instruction,
        });
      } else {
        send(socket, {
          type: "echo",
          data: raw.toString(),
        });
      }
    });

    socket.on("close", () => {
      destroySession(socket);
    });
  });

  const port = Number(process.env.PORT ?? 3001);
  await fastify.listen({ port, host: "0.0.0.0" });
};

start().catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
