// Minimal newline-delimited JSON-RPC server with the framing of `web-cli mcp` (serveStdio):
// initialize, notifications/initialized, tools/list, tools/call. Spawned by client.test.ts as
// `<bun> fixture-server.ts mcp`; it records nothing and touches no network.
import { createInterface } from "node:readline";

const tools = [
  { name: "browser_navigate", description: "Navigate", inputSchema: { type: "object" } },
  { name: "browser_markdown", description: "Markdown", inputSchema: { type: "object" } },
  { name: "browser_evaluate", description: "Evaluate", inputSchema: { type: "object" } },
];
let url = "about:blank";

function reply(id: number, result: unknown) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}
function text(value: unknown) {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
  };
}

createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line) as { id?: number; method: string; params?: any };
  if (message.id === undefined) return;
  switch (message.method) {
    case "initialize":
      return reply(message.id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "fixture-web-mcp", version: "0.0.1" },
      });
    case "tools/list":
      return reply(message.id, { tools });
    case "tools/call": {
      const { name, arguments: args } = message.params;
      if (name === "browser_navigate") {
        url = args.url;
        return reply(message.id, text({ url }));
      }
      if (name === "browser_markdown")
        return reply(message.id, text(`# Fixture\n\nSource: ${url}\n\nbody`));
      if (name === "browser_evaluate")
        return reply(
          message.id,
          text({ result: { value: { title: "Fixture", html: `<html>${url}</html>` } } }),
        );
      return reply(message.id, {
        isError: true,
        content: [{ type: "text", text: `unknown tool ${name}` }],
      });
    }
    default:
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } })}\n`,
      );
  }
});
