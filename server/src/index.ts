import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { BrowserManager } from "agent-browser/dist/browser.js";
import { executeCommand } from "agent-browser/dist/actions.js";
import type { WebSocket } from "ws";
import type { NavigateData } from "agent-browser/dist/types.js";

const fastify = Fastify({ logger: true });

const FRAME_INTERVAL_MS = 66; // ~15 fps
const MAX_AGENT_STEPS = 10;
const OLLAMA_URL =
  process.env.OLLAMA_URL ?? "http://localhost:11434/v1/chat/completions";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "phi3:mini";

const ROUTER_PROMPT = `You are Fetch, a friendly AI browser assistant. You help users browse the web and perform tasks.

Your job: decide if the user's message requires a browser action or is just conversation.

If the user wants you to do something in a browser (visit a website, search, click, fill a form, find information online, etc.), respond with exactly:
ACTION

If the user is just chatting, greeting, asking a question that doesn't need a browser, or if you need more details before you can act, respond normally as a helpful assistant. Keep responses concise (1-3 sentences). Ask follow-up questions if the request is vague.

Examples:
- "Hello" → respond with a greeting
- "What can you do?" → explain your capabilities
- "Go to google.com" → ACTION
- "Search for laptops on amazon" → ACTION
- "Find me cheap flights" → ACTION
- "What's the weather?" → ACTION (needs a browser to check)
- "Search for something" → ask what they want to search for
- "Can you help me?" → ask what they need help with`;

const AGENT_PROMPT = `You control a web browser. You see the current page as an accessibility tree.

Available actions (respond with exactly ONE action per message):

navigate <url>
click <selector>
type <selector> <text>
scroll up
scroll down
done <summary of what you found or accomplished>

Rules:
- If the user mentions a website, use navigate first. Example: navigate https://www.google.com
- <selector> must be a CSS selector from the accessibility tree.
- For type, put the selector first, then the text. Example: type #search-input hello world
- Respond with ONLY the action line. No explanation, no markdown, no extra text.
- When the task is complete, use done with a brief summary.`;

// ── Helpers ──────────────────────────────────────────────────

function send(socket: WebSocket, msg: Record<string, unknown>) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

let cmdId = 0;
function nextId() {
  return String(++cmdId);
}

// ── Ollama client ────────────────────────────────────────────

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callOllama(messages: OllamaMessage[]): Promise<string> {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      temperature: 0,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return json.choices[0].message.content.trim();
}

// ── Action parser ────────────────────────────────────────────

interface ParsedAction {
  name: string;
  selector?: string;
  text?: string;
  url?: string;
  direction?: string;
  summary?: string;
}

function parseAction(raw: string): ParsedAction {
  // Strip markdown fences if the model wraps its response
  let line = raw.replace(/```[\s\S]*?```/g, "").trim();
  // Take first non-empty line
  line = line.split("\n").find((l) => l.trim().length > 0) ?? line;
  line = line.trim();

  if (line.startsWith("click ")) {
    return { name: "click", selector: line.slice(6).trim() };
  }
  if (line.startsWith("type ")) {
    const rest = line.slice(5).trim();
    // First token is selector, rest is text
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) {
      return { name: "type", selector: rest, text: "" };
    }
    return {
      name: "type",
      selector: rest.slice(0, spaceIdx),
      text: rest.slice(spaceIdx + 1),
    };
  }
  if (line.startsWith("scroll ")) {
    return { name: "scroll", direction: line.slice(7).trim() };
  }
  if (line.startsWith("navigate ")) {
    return { name: "navigate", url: line.slice(9).trim() };
  }
  if (line.startsWith("done")) {
    return { name: "done", summary: line.slice(4).trim() || "Task complete." };
  }

  return { name: "unknown", summary: line };
}

// ── Execute a parsed action ──────────────────────────────────

async function executeAction(
  action: ParsedAction,
  session: Session
): Promise<string> {
  const browser = session.browser;

  switch (action.name) {
    case "click": {
      const res = await executeCommand(
        { id: nextId(), action: "click", selector: action.selector ?? "" },
        browser
      );
      if (!res.success) return `Click failed: ${res.error}`;
      // Wait for any navigation/render
      try {
        await browser.getPage().waitForLoadState("domcontentloaded", { timeout: 3000 });
      } catch { /* timeout is fine */ }
      return `Clicked "${action.selector}"`;
    }
    case "type": {
      const res = await executeCommand(
        {
          id: nextId(),
          action: "fill",
          selector: action.selector ?? "",
          value: action.text ?? "",
        },
        browser
      );
      if (!res.success) return `Type failed: ${res.error}`;
      return `Typed "${action.text}" into "${action.selector}"`;
    }
    case "scroll": {
      const dir = action.direction === "up" ? -3 : 3;
      await browser.getPage().mouse.wheel(0, dir * 300);
      return `Scrolled ${action.direction}`;
    }
    case "navigate": {
      const res = await executeCommand(
        { id: nextId(), action: "navigate", url: action.url ?? "" },
        browser
      );
      if (!res.success) return `Navigate failed: ${res.error}`;
      const navData = res.data as NavigateData;
      session.currentUrl = navData.url ?? action.url ?? "";
      return `Navigated to ${session.currentUrl}`;
    }
    case "done":
      return action.summary ?? "Task complete.";
    default:
      return `Unknown action: ${action.name}`;
  }
}

// ── Session management ───────────────────────────────────────

interface Session {
  browser: BrowserManager;
  currentUrl: string;
  frameTimer: ReturnType<typeof setInterval> | null;
  chatHistory: OllamaMessage[];
}

const sessions = new Map<WebSocket, Session>();

function startFrameLoop(socket: WebSocket, session: Session) {
  if (session.frameTimer) return;

  let capturing = false;
  session.frameTimer = setInterval(async () => {
    if (capturing) return;
    if (!session.browser.isLaunched()) return;

    capturing = true;
    try {
      const page = session.browser.getPage();
      const buffer = await page.screenshot({ type: "jpeg", quality: 60 });
      send(socket, { type: "frame", data: buffer.toString("base64") });
    } catch {
      // page may be navigating
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
  if (session && session.browser.isLaunched()) return session;

  const browser = new BrowserManager();

  send(socket, { type: "status", data: "Launching browser...", status: "thinking" });

  const launchRes = await executeCommand(
    { id: nextId(), action: "launch", headless: true },
    browser
  );
  if (!launchRes.success) throw new Error(`Launch failed: ${launchRes.error}`);

  session = { browser, currentUrl: "", frameTimer: null, chatHistory: [] };
  sessions.set(socket, session);
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
  } catch { /* ignore */ }
}

// ── Chat history (per socket, survives before browser launch) ─

const chatHistories = new Map<WebSocket, OllamaMessage[]>();

function getChatHistory(socket: WebSocket): OllamaMessage[] {
  let history = chatHistories.get(socket);
  if (!history) {
    history = [];
    chatHistories.set(socket, history);
  }
  return history;
}

// ── Router: chat vs browser action ───────────────────────────

async function handleMessage(
  socket: WebSocket,
  instruction: string
) {
  try {
    const chatHistory = getChatHistory(socket);
    chatHistory.push({ role: "user", content: instruction });

    // Ask the LLM: is this a browser task or just chat?
    send(socket, { type: "status", data: "Thinking...", status: "thinking" });

    const routerMessages: OllamaMessage[] = [
      { role: "system", content: ROUTER_PROMPT },
      ...chatHistory,
    ];

    const routerResponse = await callOllama(routerMessages);

    if (routerResponse.trim() === "ACTION") {
      // It's a browser task — run the agent loop
      chatHistory.push({ role: "assistant", content: "On it!" });
      send(socket, { type: "status", data: "On it!", status: "scraping" });
      await runAgentLoop(socket, instruction);
    } else {
      // It's conversation — send the response as a chat message
      chatHistory.push({ role: "assistant", content: routerResponse });
      send(socket, {
        type: "status",
        data: routerResponse,
        status: "idle",
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send(socket, { type: "error", data: `Error: ${message}`, status: "error" });
  }
}

// ── Agent loop ───────────────────────────────────────────────

async function runAgentLoop(
  socket: WebSocket,
  instruction: string
) {
  try {
    const session = await ensureSession(socket);

    // Agent conversation (separate from chat history — focused on actions)
    const conversation: OllamaMessage[] = [
      { role: "system", content: AGENT_PROMPT },
    ];

    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
      // Get fresh snapshot (skip if page is blank)
      let tree = "";
      const currentPage = session.browser.getPage();
      const pageUrl = currentPage.url();
      const isBlank = !pageUrl || pageUrl === "about:blank";

      if (!isBlank) {
        send(socket, {
          type: "status",
          data: `Step ${step + 1}: Reading page...`,
          status: "scraping",
        });
        const snapshot = await session.browser.getSnapshot({ interactive: true });
        tree = snapshot.tree;
      }

      // Build user message
      let userContent: string;
      if (step === 0) {
        userContent = tree
          ? `Page snapshot:\n${tree}\n\nTask: ${instruction}`
          : `The browser is on a blank page. Task: ${instruction}`;
      } else {
        userContent = tree
          ? `Page snapshot after action:\n${tree}`
          : `The page is blank or loading.`;
      }

      conversation.push({ role: "user", content: userContent });

      // Call LLM
      send(socket, {
        type: "status",
        data: `Step ${step + 1}: Thinking...`,
        status: "thinking",
      });

      const llmResponse = await callOllama(conversation);
      conversation.push({ role: "assistant", content: llmResponse });

      // Show what the LLM said
      send(socket, {
        type: "status",
        data: `Agent: ${llmResponse}`,
        status: "scraping",
      });

      // Parse and execute the action
      const action = parseAction(llmResponse);

      if (action.name === "done") {
        // Store result in chat history too
        const chatHistory = getChatHistory(socket);
        chatHistory.push({
          role: "assistant",
          content: action.summary ?? "Task complete.",
        });

        send(socket, {
          type: "result",
          data: action.summary ?? "Task complete.",
          status: "done",
        });
        return;
      }

      if (action.name === "unknown") {
        conversation.push({
          role: "user",
          content:
            "Invalid action. Respond with exactly one action: click, type, scroll, navigate, or done.",
        });
        continue;
      }

      const result = await executeAction(action, session);
      send(socket, {
        type: "status",
        data: `Executed: ${result}`,
        status: "scraping",
      });

      // Feed result back into conversation for next iteration
      conversation.push({ role: "user", content: `Action result: ${result}` });

      // Small delay to let the page settle
      await new Promise((r) => setTimeout(r, 500));
    }

    // Hit max steps
    send(socket, {
      type: "result",
      data: "Reached maximum steps. The task may not be fully complete.",
      status: "done",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send(socket, { type: "error", data: `Error: ${message}`, status: "error" });
    await destroySession(socket);
  }
}

// ── Server startup ───────────────────────────────────────────

const start = async () => {
  await fastify.register(websocket);

  fastify.get("/health", async () => ({ ok: true }));

  fastify.get("/ws", { websocket: true }, (socket) => {
    socket.on("message", (raw: Buffer) => {
      let parsed: { type?: string; instruction?: string };
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        send(socket, { type: "error", data: "Invalid JSON", status: "error" });
        return;
      }

      if (
        parsed.type === "command" &&
        typeof parsed.instruction === "string"
      ) {
        handleMessage(socket, parsed.instruction);
      } else {
        send(socket, { type: "echo", data: raw.toString() });
      }
    });

    socket.on("close", () => {
      chatHistories.delete(socket);
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
