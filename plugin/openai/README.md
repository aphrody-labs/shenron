# Shenron for Codex and ChatGPT

This Agent Plugins package provides sourced Dragon Ball research workflows and Shenron's public Dragon Ball MCP. It preserves the Claude Code plugin in the parent directory and does not require a DBFR token.

## Install in ChatGPT

The repository declares a project marketplace in `.agents/plugins/marketplace.json`. In ChatGPT desktop Work mode, add the repository marketplace, open the **DBFR** source, then select **Shenron → Install plugin**. Restart the desktop app if the source was just added. Local and repo marketplaces are for authoring, testing, and team distribution; they do not install the plugin in ChatGPT Web or publish it to OpenAI's universal public directory.

The portable manifest and `mcp.json` follow OpenAI's documented Agent Plugins format. Codex and ChatGPT discover the three `SKILL.md` workflows under `skills/` and the public Streamable HTTP MCP server at `https://dragonballfr.com/mcp`. The skills are limited to public research and verifiable citations. Shenron exposes A2A as a separate protocol; OpenAI agents connect to Shenron's capabilities through MCP.

## OpenAI public directory

One-click installation in ChatGPT Web requires publication in OpenAI's universal plugin directory. This requires a separate submission at [platform.openai.com/plugins](https://platform.openai.com/plugins), developer identity and domain verification, a passing MCP scan, and OpenAI review. The submission also needs an accessible demonstration video. A Claude or local marketplace does not publish the plugin to the universal ChatGPT/Codex directory.

Production MCP check (2026-10-08, release `docker-5c09af18`): the anonymous `tools/list` of `https://dragonballfr.com/mcp` returns 48 public tools, none of them a deposit or write tool, and each declares `readOnlyHint: true`, `openWorldHint` and `destructiveHint`. Recheck it after every production deployment and before running OpenAI's scan.

The five positive and three negative review cases are in `plugin.json`. The demonstration, domain verification, and portal review remain external submission steps.

References: [Package your plugin](https://developers.openai.com/plugins/build/plugins), [Submit a Claude Code plugin to OpenAI](https://developers.openai.com/plugins/guides/submit-claude-plugin), and [Upload and submit your plugin](https://developers.openai.com/plugins/deploy/submission).
