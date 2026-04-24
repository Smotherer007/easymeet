import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, stat, copyFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import * as protoo from "protoo-client";

interface EasymeetConfig {
  serverUrl: string;
  roomCode: string;
  displayName: string;
  password?: string;
  clientId?: string;
  requireMention?: boolean;
  respondToQuestions?: boolean;
  wakeWords?: string[];
  respondOnlyTo?: string[];
  ignoreParticipants?: string[];
}

interface JoinInfo {
  roomId: string;
  peerId: string;
  wsToken: string;
}

interface PendingEasymeetTurn {
  nick: string;
  receivedAt: number;
}

const AGENT_DIR = join(homedir(), ".pi", "agent");
const CONFIG_PATH = join(AGENT_DIR, "easymeet.json");
const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SAMPLE_CONFIG_PATH = join(PACKAGE_ROOT, "easymeet.json");

const PROTOCOL_PREFIX = "[easymeet]";

const { Peer: ProtooPeer, WebSocketTransport } = protoo as unknown as {
  Peer: new (...args: any[]) => any;
  WebSocketTransport: new (...args: any[]) => any;
};

async function ensureConfigFileExists(): Promise<void> {
  try {
    await stat(CONFIG_PATH);
    return;
  } catch (error) {
    // continue to copy template
  }
  try {
    await mkdir(AGENT_DIR, { recursive: true });
    await copyFile(SAMPLE_CONFIG_PATH, CONFIG_PATH);
  } catch (error) {
    // ignore copy errors, config command will allow editing later
  }
}

async function readEasymeetConfig(): Promise<EasymeetConfig> {
  await ensureConfigFileExists();
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<EasymeetConfig> | undefined;
    return {
      serverUrl: String(parsed?.serverUrl ?? "").trim(),
      roomCode: String(parsed?.roomCode ?? "").trim(),
      displayName: String(parsed?.displayName ?? "").trim(),
      password: typeof parsed?.password === "string" ? parsed?.password : "",
      clientId:
        typeof parsed?.clientId === "string" && parsed?.clientId.trim().length
          ? parsed?.clientId.trim()
          : undefined,
      requireMention:
        typeof parsed?.requireMention === "boolean" ? parsed.requireMention : undefined,
      respondToQuestions:
        typeof parsed?.respondToQuestions === "boolean"
          ? parsed.respondToQuestions
          : undefined,
      wakeWords: Array.isArray(parsed?.wakeWords)
        ? parsed?.wakeWords.map((w) => String(w || "").trim()).filter(Boolean)
        : undefined,
      respondOnlyTo: Array.isArray(parsed?.respondOnlyTo)
        ? parsed.respondOnlyTo.map((w) => String(w || "").trim()).filter(Boolean)
        : undefined,
      ignoreParticipants: Array.isArray(parsed?.ignoreParticipants)
        ? parsed.ignoreParticipants.map((w) => String(w || "").trim()).filter(Boolean)
        : undefined,
    };
  } catch (error) {
    return {
      serverUrl: "",
      roomCode: "",
      displayName: "",
      password: "",
      clientId: undefined,
      requireMention: undefined,
      respondToQuestions: undefined,
      wakeWords: undefined,
      respondOnlyTo: undefined,
      ignoreParticipants: undefined,
    };
  }
}

async function writeEasymeetConfig(config: EasymeetConfig): Promise<void> {
  await mkdir(AGENT_DIR, { recursive: true });
  const payload = {
    serverUrl: config.serverUrl,
    roomCode: config.roomCode,
    displayName: config.displayName,
    password: config.password ?? "",
    clientId: config.clientId ?? "",
    requireMention: config.requireMention ?? true,
    respondToQuestions: config.respondToQuestions ?? true,
    wakeWords: config.wakeWords ?? [],
    respondOnlyTo: config.respondOnlyTo ?? [],
    ignoreParticipants: config.ignoreParticipants ?? [],
  };
  await writeFile(CONFIG_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function parseCommaSeparatedList(value: string | undefined, fallback: string[] = []): string[] {
  if (value === undefined) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\s+/g, "").replace(/\/$/, "");
}

function buildApiUrl(baseUrl: string, pathname: string): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const target = new URL(pathname, normalizedBase.endsWith("/") ? normalizedBase : `${normalizedBase}/`);
  return target.toString();
}

function buildWebSocketUrl(baseUrl: string, joinInfo: JoinInfo, clientId: string): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const base = new URL(normalizedBase.endsWith("/") ? normalizedBase : `${normalizedBase}/`);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = "/ws";
  base.searchParams.set("roomId", joinInfo.roomId);
  base.searchParams.set("peerId", joinInfo.peerId);
  base.searchParams.set("token", joinInfo.wsToken);
  base.searchParams.set("clientId", clientId);
  return base.toString();
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (!item) continue;
    if (typeof item === "string") {
      parts.push(item);
      continue;
    }
    if (typeof item === "object") {
      const maybeText = (item as { text?: unknown }).text;
      if (typeof maybeText === "string") {
        parts.push(maybeText);
        continue;
      }
      const maybeCode = (item as { code?: unknown }).code;
      if (typeof maybeCode === "string") {
        parts.push(maybeCode);
        continue;
      }
    }
  }
  return parts.join("\n\n").trim();
}

function extractAssistantReply(messages: AgentMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i] as AgentMessage & { role?: string };
    if (msg.role !== "assistant") continue;
    const text = extractTextContent((msg as unknown as { content?: unknown }).content);
    if (text) return text;
  }
  return undefined;
}

function wasLastUserMessageFromEasymeet(messages: AgentMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i] as AgentMessage & { role?: string };
    if (msg.role !== "user") continue;
    const text = extractTextContent((msg as unknown as { content?: unknown }).content);
    return text.startsWith(PROTOCOL_PREFIX);
  }
  return false;
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

const RESTRICTED_TOOLS = new Set([
  "bash",
  "write",
  "edit",
  "apply_patch",
  "delete",
  "copy",
  "python",
  "node",
]);

class EasymeetBridge {
  private config: EasymeetConfig | null = null;

  private configLoaded = false;

  private status: "idle" | "connecting" | "connected" | "error" = "idle";

  private statusMessage = "";

  private wantConnection = false;

  private agentActive = false;

  private pendingTurns: PendingEasymeetTurn[] = [];

  private protoo?: any;

  private transport?: any;

  private reconnectTimer?: NodeJS.Timeout;

  private joiningPromise?: Promise<void>;

  private closing = false;

  private turnIsFromEasymeet = false;

  constructor(private readonly pi: ExtensionAPI) {}

  getStatusLines(): string[] {
    const config = this.config;
    const target = config?.roomCode ? `${config.roomCode}@${config.serverUrl}` : "not configured";
    const statusLine = `EasyMeet bridge: ${this.status}${this.statusMessage ? ` (${this.statusMessage})` : ""}`;
    return [statusLine, `Target: ${target}`];
  }

  setAgentActive(active: boolean): void {
    this.agentActive = active;
  }

  handleBeforeAgentStart(prompt: unknown): void {
    const text = typeof prompt === "string" ? prompt : "";
    this.turnIsFromEasymeet = text.trim().startsWith(PROTOCOL_PREFIX);
  }

  resetTurnFlag(): void {
    this.turnIsFromEasymeet = false;
  }

  isTurnFromEasymeet(): boolean {
    return this.turnIsFromEasymeet;
  }

  shouldBlockTool(toolName: string): boolean {
    return this.turnIsFromEasymeet && RESTRICTED_TOOLS.has(toolName);
  }

  async loadConfig(): Promise<EasymeetConfig> {
    if (this.configLoaded && this.config) return this.config;
    const config = await readEasymeetConfig();
    if (!config.clientId || config.clientId.trim().length === 0) {
      config.clientId = randomUUID();
    }
    config.requireMention = config.requireMention !== false;
    config.respondToQuestions = config.respondToQuestions !== false;
    const wakeWords = Array.isArray(config.wakeWords) ? config.wakeWords : [];
    const normalizedWakeWords = [...wakeWords];
    if (config.displayName) normalizedWakeWords.push(config.displayName);
    normalizedWakeWords.push("pi");
    config.wakeWords = normalizeStringList(normalizedWakeWords);
    config.respondOnlyTo = normalizeStringList(config.respondOnlyTo);
    config.ignoreParticipants = normalizeStringList(config.ignoreParticipants);
    await writeEasymeetConfig(config);
    this.config = config;
    this.configLoaded = true;
    return config;
  }

  async promptForConfig(ctx: ExtensionCommandContext | ExtensionContext): Promise<void> {
    if (!ctx.hasUI) return;
    const current = await this.loadConfig();
    const serverUrl = (await ctx.ui.input(
      "EasyMeet Server URL",
      current.serverUrl || "http://localhost:3001",
    ))?.trim();
    if (!serverUrl) return;

    const roomCode = (await ctx.ui.input("Room code", current.roomCode))?.trim();
    if (!roomCode) return;

    const displayName = (await ctx.ui.input("Display name", current.displayName || "Pi Assistant"))?.trim();
    if (!displayName) return;

    const password = (await ctx.ui.input(
      "Room password (optional)",
      current.password ?? "",
    ))?.trim();

    const requireMentionDefault = (current.requireMention ?? true) ? "yes" : "no";
    const requireMentionInput = (await ctx.ui.input(
      "Require mention to respond? (yes/no)",
      requireMentionDefault,
    ))?.trim();
    const requiresMention =
      requireMentionInput === undefined || requireMentionInput.length === 0
        ? current.requireMention ?? true
        : /^(y|yes|ja|true|1)$/i.test(requireMentionInput);

    const respondOnlyToRaw = await ctx.ui.input(
      "Respond only to participants (comma-separated, optional)",
      (current.respondOnlyTo ?? []).join(", "),
    );

    const ignoreParticipantsRaw = await ctx.ui.input(
      "Ignore participants (comma-separated, optional)",
      (current.ignoreParticipants ?? []).join(", "),
    );

    const respondOnlyTo = normalizeStringList(
      parseCommaSeparatedList(respondOnlyToRaw, current.respondOnlyTo ?? []),
    );
    const ignoreParticipants = normalizeStringList(
      parseCommaSeparatedList(ignoreParticipantsRaw, current.ignoreParticipants ?? []),
    );

    const nextConfig: EasymeetConfig = {
      serverUrl,
      roomCode,
      displayName,
      password: password ?? "",
      clientId: current.clientId ?? randomUUID(),
      requireMention: requiresMention,
      respondToQuestions: current.respondToQuestions,
      wakeWords: current.wakeWords ?? [],
      respondOnlyTo,
      ignoreParticipants,
    };
    this.config = nextConfig;
    this.configLoaded = true;
    await writeEasymeetConfig(nextConfig);
    ctx.ui.notify("EasyMeet configuration saved.", "success");
  }

  async connect(ctx?: ExtensionCommandContext): Promise<void> {
    this.wantConnection = true;
    const config = await this.loadConfig();
    if (!config.serverUrl || !config.roomCode || !config.displayName) {
      if (ctx?.hasUI) ctx.ui.notify("Please configure EasyMeet first via /easymeet-setup.", "error");
      return;
    }
    if (this.status === "connected" || this.joiningPromise) {
      if (ctx?.hasUI) ctx.ui.notify("EasyMeet bridge is already connecting or connected.", "info");
      return;
    }
    this.joiningPromise = this.establishConnection();
    try {
      await this.joiningPromise;
      if (ctx?.hasUI) ctx.ui.notify("EasyMeet bridge connected.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (ctx?.hasUI) ctx.ui.notify(`EasyMeet connection failed: ${message}`, "error");
      throw error;
    } finally {
      this.joiningPromise = undefined;
    }
  }

  async disconnect(ctx?: ExtensionCommandContext | ExtensionContext): Promise<void> {
    this.wantConnection = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.pendingTurns = [];
    await this.closeTransport();
    this.status = "idle";
    this.statusMessage = "";
    if (ctx?.hasUI) ctx.ui.notify("EasyMeet bridge disconnected.", "info");
  }

  async handleAgentEnd(messages: AgentMessage[]): Promise<void> {
    if (!this.pendingTurns.length) return;
    if (!wasLastUserMessageFromEasymeet(messages)) return;
    const pending = this.pendingTurns.shift();
    if (!pending) return;
    const reply = extractAssistantReply(messages) ?? "(Keine Antwort generiert)";
    await this.sendChatMessage(reply);
  }

  async handleIncomingChat(nick: string, text: string, giphyUrls: string[] = []): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    const extras = giphyUrls.filter((url) => typeof url === "string" && url.trim().length > 0);
    const combined = extras.length ? `${trimmed}\n${extras.join("\n")}` : trimmed;
    this.recordObservation(nick, combined);
    if (!this.shouldForwardMessage(nick, combined)) return;
    const prefix = `${PROTOCOL_PREFIX} ${nick}: `;
    const outbound = `${prefix}${combined}`;
    try {
      if (this.agentActive) {
        this.pi.sendUserMessage(outbound, { deliverAs: "followUp" });
      } else {
        this.pi.sendUserMessage(outbound);
      }
      this.pendingTurns.push({ nick, receivedAt: Date.now() });
    } catch (error) {
      console.error("EasyMeet bridge: failed to forward chat message", error);
    }
  }

  private async establishConnection(): Promise<void> {
    const config = await this.loadConfig();
    this.status = "connecting";
    this.statusMessage = "Joining room";
    try {
      const joinInfo = await this.joinRoom();
      await this.openProtoo(joinInfo);
      this.status = "connected";
      this.statusMessage = `Connected to ${config.roomCode}`;
    } catch (error) {
      this.status = "error";
      this.statusMessage = error instanceof Error ? error.message : String(error);
      if (this.wantConnection) {
        this.scheduleReconnect();
      }
      throw error;
    }
  }

  private async joinRoom(): Promise<JoinInfo> {
    const config = await this.loadConfig();
    const url = buildApiUrl(config.serverUrl, "/api/join");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Easymeet-Client-Id": config.clientId ?? "",
      },
      body: JSON.stringify({
        identifier: config.roomCode,
        password: config.password ?? "",
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Join failed with status ${response.status}`);
    }
    const data = (await response.json()) as Record<string, unknown>;
    const roomId = String(data.roomId ?? "").trim();
    const peerId = String(data.peerId ?? "").trim();
    const wsToken = String(data.wsToken ?? "").trim();
    if (!roomId || !peerId || !wsToken) {
      throw new Error("Join response missing roomId, peerId, or wsToken");
    }
    return { roomId, peerId, wsToken };
  }

  private async openProtoo(joinInfo: JoinInfo): Promise<void> {
    await this.closeTransport();
    const config = await this.loadConfig();
    const wsUrl = buildWebSocketUrl(config.serverUrl, joinInfo, config.clientId ?? "");
    const transport = new WebSocketTransport(wsUrl, {
      origin: config.serverUrl,
      retry: { retries: 5, factor: 2, minTimeout: 1000, maxTimeout: 8000 },
    });
    this.transport = transport;
    const peer = new ProtooPeer(transport);
    this.protoo = peer;

    const joinPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const safeResolve = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const safeReject = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      const handleOpen = async () => {
        try {
          await peer.request("join", {
            displayName: config.displayName,
            device: { flag: "pi-easymeet", name: "pi-easymeet-bridge" },
            rtpCapabilities: null,
            sctpCapabilities: null,
            easymeet: { muted: true, videoEnabled: false },
          });
          safeResolve();
        } catch (error) {
          safeReject(error);
        }
      };

      transport.once("open", handleOpen);
      transport.once("close", () => {
        if (!this.closing) this.scheduleReconnect();
        safeReject(new Error("WebSocket closed before join complete"));
      });

      transport.on("disconnected", () => {
        if (!this.closing) this.scheduleReconnect();
      });

      transport.on("close", () => {
        this.status = this.wantConnection ? "connecting" : "idle";
        this.statusMessage = this.wantConnection ? "Reconnecting" : "";
      });

      peer.on("notification", (notification: { method: string; data: any }) => {
        if (notification.method !== "easymeet") return;
        const payload = notification.data || {};
        if (payload.type === "chat") {
          void this.handleIncomingChat(
            typeof payload.nick === "string" && payload.nick.trim().length
              ? payload.nick
              : "?",
            typeof payload.text === "string" ? payload.text : "",
            Array.isArray(payload.giphyUrls) ? payload.giphyUrls : [],
          );
        }
      });

      peer.on("request", (
        request: { method: string },
        accept: () => void,
        rejectRequest: (code: number, reason: string) => void,
      ) => {
        const unsupported = [
          "getRouterRtpCapabilities",
          "createWebRtcTransport",
          "connectWebRtcTransport",
          "restartIce",
          "produce",
          "newConsumer",
        ];
        if (unsupported.includes(request.method)) {
          rejectRequest(403, `${request.method} not supported by easymeet bridge`);
          return;
        }
        accept();
      });
    });

    await joinPromise;
  }

  private async sendChatMessage(text: string): Promise<void> {
    const peer = this.protoo;
    if (!peer || peer.closed) {
      console.warn("EasyMeet bridge: cannot send chat message, not connected");
      return;
    }
    try {
      await peer.notify("easymeet", {
        type: "chat",
        nick: this.config?.displayName ?? "pi",
        text,
        ts: Date.now(),
        giphyUrls: [],
      });
    } catch (error) {
      console.error("EasyMeet bridge: failed to send chat message", error);
    }
  }

  private shouldForwardMessage(nick: string, text: string): boolean {
    const config = this.config;
    if (!config) return true;

    const normalizedNick = nick.trim().toLowerCase();
    const ignoreList = Array.isArray(config.ignoreParticipants) ? config.ignoreParticipants : [];
    if (ignoreList.some((entry) => entry.toLowerCase() === normalizedNick)) {
      return false;
    }

    const allowList = Array.isArray(config.respondOnlyTo) ? config.respondOnlyTo : [];
    if (allowList.length > 0 && !allowList.some((entry) => entry.toLowerCase() === normalizedNick)) {
      return false;
    }

    if (config.requireMention === false) return true;
    const lower = text.toLowerCase();
    const wakeWords = Array.isArray(config.wakeWords) ? config.wakeWords : [];
    const hasWakeWord = wakeWords
      .map((w) => w.toLowerCase())
      .some((word) => word.length > 0 && lower.includes(word));
    if (hasWakeWord) return true;
    if (config.respondToQuestions && /[?？！⁇]/.test(text)) return true;
    return false;
  }

  private recordObservation(nick: string, text: string): void {
    try {
      const rendered = `${PROTOCOL_PREFIX} ${nick}: ${text}`;
      this.pi.sendMessage(
        {
          customType: "easymeet-observe",
          display: false,
          content: [{ type: "text", text: rendered }],
          timestamp: Date.now(),
        },
        { deliverAs: "nextTurn" },
      );
    } catch (error) {
      console.warn("EasyMeet bridge: failed to record observation", error);
    }
  }

  private async closeTransport(): Promise<void> {
    this.closing = true;
    try {
      this.protoo?.close();
      this.transport?.close();
    } catch (error) {
      console.warn("EasyMeet bridge: error closing transport", error);
    } finally {
      this.protoo = undefined;
      this.transport = undefined;
      this.closing = false;
    }
  }

  private scheduleReconnect(): void {
    if (!this.wantConnection) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.establishConnection().catch((error) => {
        this.status = "error";
        this.statusMessage = error instanceof Error ? error.message : String(error);
        this.scheduleReconnect();
      });
    }, 3000);
  }
}

export default function registerEasymeetBridge(pi: ExtensionAPI): void {
  const bridge = new EasymeetBridge(pi);

  pi.registerCommand("easymeet-setup", {
    description: "Configure EasyMeet connection settings",
    handler: async (_args, ctx) => {
      await bridge.promptForConfig(ctx);
    },
  });

  pi.registerCommand("easymeet-connect", {
    description: "Connect the EasyMeet bridge",
    handler: async (_args, ctx) => {
      try {
        await bridge.connect(ctx);
      } catch (_error) {
        // error already surfaced via notifications
      }
    },
  });

  pi.registerCommand("easymeet-disconnect", {
    description: "Disconnect the EasyMeet bridge",
    handler: async (_args, ctx) => {
      await bridge.disconnect(ctx);
    },
  });

  pi.registerCommand("easymeet-status", {
    description: "Show EasyMeet bridge status",
    handler: async (_args, ctx) => {
      const lines = bridge.getStatusLines();
      if (ctx.hasUI) ctx.ui.notify(lines.join(" | "), "info");
    },
  });

  pi.on("session_start", async (_event, _ctx) => {
    await bridge.loadConfig();
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await bridge.disconnect(ctx);
  });

  pi.on("before_agent_start", (event) => {
    const prompt = (event as { prompt?: unknown })?.prompt;
    bridge.handleBeforeAgentStart(prompt);
  });

  pi.on("agent_start", () => {
    bridge.setAgentActive(true);
  });

  pi.on("agent_end", async (event) => {
    bridge.setAgentActive(false);
    const messages = (event as { messages?: AgentMessage[] }).messages;
    if (messages) {
      await bridge.handleAgentEnd(messages);
    }
    bridge.resetTurnFlag();
  });

  pi.on("tool_call", (event) => {
    const toolName = String((event as { toolName?: unknown })?.toolName || "");
    if (!toolName) return undefined;
    if (!bridge.shouldBlockTool(toolName)) return undefined;
    return {
      block: true,
      reason: "EasyMeet bridge: system-level tools are disabled for chat prompts.",
    };
  });
}
