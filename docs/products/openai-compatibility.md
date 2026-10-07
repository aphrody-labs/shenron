# OpenAI, Codex, and ChatGPT compatibility

This page describes Shenron's integration boundaries with OpenAI products. Runtime behavior is
defined by the code and manifests. Check OpenAI's official documentation for current submission
requirements.

## Compatible surfaces

- **Local model:** Shenron Chat v2 runs through Aphrody's local `llama-server` router. It exposes
  the OpenAI-compatible `/v1/models` and `/v1/chat/completions` endpoints on loopback. The router
  is not a public service. Shenron selects `shenron-chat-v2` and Gemma by stable model IDs;
  Shenron Chat v2 is Qwen3-4B with the Shenron LoRA. Aphrody owns provisioning and inference.
- **Shenron API:** The current chat contract is `POST /api/v1/chat`, which streams Shenron SSE
  events for sources, tools, the selected model, and completion. The catalog is
  `GET /api/v1/models`. This is not the OpenAI Chat Completions schema. Chat requires an owner
  identity; the model catalog is public.
- **Remote MCP:** `https://dragonballfr.com/mcp` uses MCP Streamable HTTP. The
  `plugin/openai/` package declares this server, portable `SKILL.md` workflows, `plugin.json`
  metadata, starter prompts, and review cases. Its workflows are limited to public read-only
  research, citations, and Dragon Ball source hierarchy.
- **Local marketplace:** `.agents/plugins/marketplace.json` points to the portable package for
  installation and testing in ChatGPT desktop Work mode/Codex. Local and repository marketplaces
  do not install it in ChatGPT Web or publish it to OpenAI's universal directory.
- **A2A:** `/api/a2a` and `/.well-known/agent-card.json` speak A2A 1.0 while preserving a legacy
  dialect for existing peers. A2A is a separate protocol, not an OpenAI API. OpenAI agents
  connect to Shenron capabilities through the plugin's MCP integration. A bridge from an A2A
  peer to an OpenAI model is a separate client that speaks A2A to the peer and calls the OpenAI
  API.

## Boundaries and remaining work

Shenron does not currently publish `/v1/chat/completions` as a façade for its production API.
Do not describe `/api/v1/chat` as OpenAI-compatible or expose the loopback llama.cpp router to
the Internet. Any future OpenAI façade must translate messages and Shenron SSE events to the
Chat Completions schema, preserve owner authentication, rate limits, cancellation, and citations,
and reject unsupported fields instead of silently ignoring them.

Before public OpenAI submission, rebuild the production MCP server from this source and verify
its anonymous tool list: only public tools may appear, and each must declare `readOnlyHint`,
`destructiveHint`, and `openWorldHint`. Write and administration tools remain behind MCP access
controls and are excluded from the public plugin.

One-click installation in ChatGPT Web requires a public listing in OpenAI's universal plugin
directory. Submission requires developer portal access, domain verification, a passing MCP scan,
test cases, a demonstration, and OpenAI review. A local manifest cannot perform those steps.
This work does not submit or deploy the plugin.

## Official references

- [Agent Plugins](https://developers.openai.com/plugins/build/plugins)
- [Skills](https://developers.openai.com/plugins/build/skills)
- [Submit a Claude Code plugin to OpenAI](https://developers.openai.com/plugins/guides/submit-claude-plugin)
- [Upload and submit a plugin](https://developers.openai.com/plugins/deploy/submission)
- [Chat Completions API](https://developers.openai.com/api/docs/guides/text?api-mode=chat)
