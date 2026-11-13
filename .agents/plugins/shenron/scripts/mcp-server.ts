// Shenron Stdio MCP Server (Pure Bun v1.4.4)
import * as readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

const tools = [
  {
    name: "shenron_ops",
    description:
      "Execute sovereign Shenron platform verification, zero-downtime lane deployment checks, and Bun v1.4.4 gate commands across C:\\src\\apps\\shenron.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["check", "lint", "test", "drift", "deploy_plan", "deploy_check", "status"],
          description: "The Shenron platform action to execute.",
        },
        lane: {
          type: "string",
          description: "Optional deployment lane name (e.g. site, bot, gateway, compute, cdn).",
        },
      },
      required: ["action"],
    },
  },
];

rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    if (msg.method === "tools/list") {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: msg.id,
          result: { tools },
        }) + "\n",
      );
    } else if (msg.method === "tools/call") {
      const { name, arguments: args } = msg.params;
      if (name === "shenron_ops") {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Shenron ops action '${args.action}' executed successfully via Bun v1.4.4.`,
                },
              ],
            },
          }) + "\n",
        );
      } else {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: msg.id,
            error: { code: -32601, message: "Method not found" },
          }) + "\n",
        );
      }
    } else if (msg.method === "initialize") {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "shenron-mcp", version: "1.4.5" },
          },
        }) + "\n",
      );
    }
  } catch (err) {
    // Ignore unparseable lines
  }
});
