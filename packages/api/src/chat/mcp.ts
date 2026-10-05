// SPDX-License-Identifier: Apache-2.0
/**
 * Minimal MCP client over stdio (newline-delimited JSON-RPC 2.0) for the `dragonball.*` tools
 * of `shenron-mcp`: lazy start, `initialize` handshake, `tools/call` with a timeout, restart
 * after the server exits. Runtime class: `bun`.
 */

export interface McpToolResult {
  ok: boolean;
  /** Parsed JSON of the first text content, or the raw text. */
  value: unknown;
  error?: string;
}

export interface McpClient {
  call(name: string, args: Record<string, unknown>, timeoutMs?: number): Promise<McpToolResult>;
  tools(): Promise<string[]>;
  close(): void;
}

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export function createStdioMcpClient(o: {
  command: readonly string[];
  env?: Record<string, string | undefined>;
  clientName?: string;
}): McpClient {
  let child: ReturnType<typeof Bun.spawn<"pipe", "pipe", "ignore">> | null = null;
  let ready: Promise<void> | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const fail = (error: Error) => {
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      p.reject(error);
      pending.delete(id);
    }
  };

  const send = (message: Record<string, unknown>) => {
    if (!child) throw new Error("MCP server not running");
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
    child.stdin.flush();
  };

  const request = (method: string, params: unknown, timeoutMs: number): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        send({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error as Error);
      }
    });

  const start = (): Promise<void> => {
    if (ready) return ready;
    ready = (async () => {
      const proc = Bun.spawn([...o.command], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "ignore",
        env: { ...process.env, ...o.env } as Record<string, string>,
      });
      child = proc;
      void proc.exited.then(() => {
        child = null;
        ready = null;
        fail(new Error("MCP server exited"));
      });
      void (async () => {
        const reader = proc.stdout.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let index: number;
          while ((index = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, index).trim();
            buffer = buffer.slice(index + 1);
            if (!line) continue;
            let message: { id?: number; result?: unknown; error?: { message?: string } };
            try {
              message = JSON.parse(line);
            } catch {
              continue;
            }
            if (typeof message.id !== "number") continue;
            const p = pending.get(message.id);
            if (!p) continue;
            pending.delete(message.id);
            clearTimeout(p.timer);
            if (message.error) p.reject(new Error(message.error.message ?? "MCP error"));
            else p.resolve(message.result);
          }
        }
      })();
      await request(
        "initialize",
        {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: o.clientName ?? "shenron-chat", version: "1.0.0" },
        },
        15_000,
      );
      send({ method: "notifications/initialized" });
    })().catch((error) => {
      ready = null;
      child?.kill();
      child = null;
      throw error;
    });
    return ready;
  };

  return {
    async call(name, args, timeoutMs = 10_000) {
      try {
        await start();
        const result = (await request("tools/call", { name, arguments: args }, timeoutMs)) as {
          content?: { type: string; text?: string }[];
          isError?: boolean;
        };
        const text = result.content?.find((c) => c.type === "text")?.text ?? "";
        let value: unknown = text;
        try {
          value = JSON.parse(text);
        } catch {
          // plain text result
        }
        if (result.isError)
          return {
            ok: false,
            value,
            error:
              typeof value === "string" ? value.slice(0, 300) : JSON.stringify(value).slice(0, 300),
          };
        return { ok: true, value };
      } catch (error) {
        return {
          ok: false,
          value: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    async tools() {
      await start();
      const result = (await request("tools/list", {}, 10_000)) as { tools?: { name: string }[] };
      return (result.tools ?? []).map((t) => t.name);
    },
    close() {
      child?.kill();
      child = null;
      ready = null;
    },
  };
}

/** Tools asked for one question: wiki always, then intent-specific ones. */
export function pickTools(
  question: string,
): { name: string; args: Record<string, unknown>; kind: string }[] {
  const q = question.toLowerCase();
  const tools: { name: string; args: Record<string, unknown>; kind: string }[] = [
    { name: "dragonball.wiki_search", args: { query: question, limit: 5 }, kind: "wiki" },
  ];
  if (/\b(databook|daizenshu+|chōzensh|chozensh|guide|artbook|interview|v-?jump)\b/.test(q))
    tools.push({
      name: "dragonball.databooks_plates",
      args: { q: question, limit: 5 },
      kind: "databook",
    });
  if (/\b(manga|tome|chapitre|planche|case|bulle)\b/.test(q))
    tools.push({
      name: "dragonball.manga_search_pages",
      args: { query: question, limit: 5 },
      kind: "manga_page",
    });
  if (/\b(canon|canonique|officiel|non-canon|filler)\b/.test(q))
    tools.push({ name: "dragonball.canon_check", args: { question }, kind: "canon" });
  return tools;
}

/** Citable items of a tool result (title, url, snippet), whatever its exact shape. */
export function toolItems(
  value: unknown,
): { title: string; url: string | null; snippet: string }[] {
  const out: { title: string; url: string | null; snippet: string }[] = [];
  const visit = (node: unknown, depth: number) => {
    if (out.length >= 5 || depth > 3 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const r = node as Record<string, unknown>;
    const title = [r.title, r.name, r.titre, r.label].find((v) => typeof v === "string") as
      | string
      | undefined;
    const url = [r.url, r.href, r.lien, r.readUrl].find((v) => typeof v === "string") as
      | string
      | undefined;
    if (title && (url || typeof r.snippet === "string" || typeof r.extrait === "string")) {
      const snippet = [r.snippet, r.extrait, r.text, r.texte, r.verdict, r.summary].find(
        (v) => typeof v === "string",
      ) as string | undefined;
      out.push({
        title,
        url: url ?? null,
        snippet: (snippet ?? "").replace(/\s+/g, " ").slice(0, 400),
      });
      return;
    }
    for (const child of Object.values(r)) visit(child, depth + 1);
  };
  visit(value, 0);
  return out;
}
