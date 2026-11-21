---
name: filmcraft
description: Edit timelines, cut clips, render frames and export sequences with the FilmCraft CLI (`filmcraft-cli`) and its MCP server. Use when the user asks to edit video, cut clips, export a sequence, inspect a timeline or automate FilmCraft.
---

# FilmCraft

Source: `github.com/aphrody-labs/filmcraft` (no copy in this repository). `filmcraft-cli` drives the headless engine, or the running app with `--bridge`. `filmcraft-cli --help` is the authority for options.

## CLI

```sh
filmcraft-cli --demo inspect                       # project tree and active sequence as JSON
filmcraft-cli commands --json                      # every command id with its parameters
filmcraft-cli export --list-presets                # export presets
filmcraft-cli --project p.fcproj import a.mp4 b.wav
filmcraft-cli --project p.fcproj --save exec timeline.razor seconds=12.5
filmcraft-cli --project p.fcproj run script.jsonl  # one {"id","params"} per line
filmcraft-cli --demo render --seconds 3.0 --out preview.png
filmcraft-cli --demo export out.mp4 --format h264 --quality 85
filmcraft-cli probe media.mp4                      # media info as JSON
```

`--bridge 127.0.0.1:<PORT>` sends commands to a running app started with `filmcraft --control <PORT>`; it cannot be combined with `--project` or `--demo`, and `render` is headless only.

## MCP server

`filmcraft-cli mcp` (add `--bridge 127.0.0.1:<PORT>` for the live app, `--demo` or `--project` for headless). Tools: `command_list`, `command_run`, `command_batch`, `doc_inspect`, `project_inspect`, `sequence_inspect`, `media_import`, `render_frame`, `render_preview`, and the `ui_*` tools in bridge mode. Export runs through `command_run` with `file.exportMedia` or through `filmcraft-cli export`.
