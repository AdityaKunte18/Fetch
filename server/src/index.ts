import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { BrowserManager } from "agent-browser/dist/browser.js";
import { executeCommand } from "agent-browser/dist/actions.js";
import type { WebSocket } from "ws";
import type { NavigateData } from "agent-browser/dist/types.js";

const fastify = Fastify({ logger: true });

// Helper to send a typed JSON message over WebSocket
function send(socket: WebSocket, msg: Record<string, unknown>) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

let cmdId = 0;
function nextId() {
  return String(++cmdId);
}

async function handleCommand(
  socket: WebSocket,
  payload: { url: string; instruction: string }
) {
  const { url, instruction } = payload;
  const browser = new BrowserManager();

  try {
    // ── 1. Launch ──────────────────────────────────────────────
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

    // ── 2. Start screencast (stream frames to client) ──────────
    await browser.startScreencast(
      (frame) => {
        send(socket, {
          type: "frame",
          data: frame.data,
          metadata: frame.metadata,
        });
      },
      { format: "jpeg", quality: 60, maxWidth: 1280, maxHeight: 720 }
    );

    // ── 3. Navigate ────────────────────────────────────────────
    send(socket, {
      type: "status",
      data: `Navigating to ${url}`,
      status: "scraping",
    });

    const navRes = await executeCommand(
      { id: nextId(), action: "navigate", url },
      browser
    );

    if (navRes.success) {
      const navData = navRes.data as NavigateData;
      send(socket, {
        type: "status",
        data: `Page loaded: ${navData.title ?? url}`,
        status: "scraping",
      });
    }

    // ── 4. Snapshot (accessibility tree) ────────────────────────
    send(socket, {
      type: "status",
      data: `Analyzing page: "${instruction}"`,
      status: "scraping",
    });

    const snapshot = await browser.getSnapshot({ interactive: true });

    send(socket, {
      type: "result",
      data: snapshot.tree,
      status: "done",
    });

    // ── 5. Stop screencast & cleanup ───────────────────────────
    await browser.stopScreencast();
    await browser.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send(socket, {
      type: "error",
      data: `Error: ${message}`,
      status: "error",
    });

    try {
      await browser.stopScreencast();
    } catch {
      // not active
    }
    try {
      await browser.close();
    } catch {
      // already closed
    }
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
        // Backwards-compatible echo for non-command messages
        send(socket, {
          type: "echo",
          data: raw.toString(),
        });
      }
    });
  });

  const port = Number(process.env.PORT ?? 3001);
  await fastify.listen({ port, host: "0.0.0.0" });
};

start().catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
