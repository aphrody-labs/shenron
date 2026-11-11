---
name: filmcraft
description: Video editing, timeline manipulation, clip cutting, audio mixing, rendering, and export automation using FilmCraft CLI and MCP server. Use when the user asks to edit video, cut clips, export sequence, inspect timeline, or automate FilmCraft.
---

# FilmCraft

FilmCraft is a professional, GPU-accelerated video editing engine and NLE suite.
It provides a CLI (ilmcraft-cli) and an MCP server (ilmcraft) for complete headless and interactive timeline automation.

## Features & Capabilities

- **Command Execution**: Execute any timeline or engine command via ilmcraft-cli exec <command_id> [params...].
- **Media Inspection**: Probe video, audio, and image assets (ilmcraft-cli probe <media_file>).
- **Rendering**: Render exact timeline frames to high-resolution PNG (ilmcraft-cli render --seconds <time> --out <frame.png>).
- **Sequence Export**: Hardware-accelerated and software multi-codec export (H.264, HEVC, ProRes, DNxHR, AV1, APV, MXF, MP4, WebM) via ilmcraft-cli export <out_path> [--preset <preset>] [--format <format>].
- **Batch Processing**: Run automation scripts via ilmcraft-cli run <script.jsonl>.
- **Live GUI Bridge**: Connect to an interactive running desktop session using --bridge 127.0.0.1:<PORT>.

## Common CLI Workflows

`ash
# Inspect active sequence and project tree
filmcraft-cli --demo inspect

# List all available commands and presets
filmcraft-cli commands --json
filmcraft-cli export --list-presets

# Import media assets
filmcraft-cli --project myproject.fcproj import video.mp4 audio.wav

# Cut / Razor at specific timestamp
filmcraft-cli --project myproject.fcproj exec timeline.razor seconds=12.5

# Render a snapshot frame
filmcraft-cli --demo render --seconds 3.0 --out preview.png

# Export full timeline to H.264 MP4
filmcraft-cli --demo export output.mp4 --format h264 --quality 85
`

## MCP Tools Integration

When running under the agent via MCP (ilmcraft), the server exposes:
- engine_execute: Run any timeline, project, or sequence command.
- project_inspect: Inspect media pool, tracks, clips, and timeline status.
- ender_frame: Retrieve high-fidelity visual feedback of the active timeline.
- export_sequence: Automate final rendering pipelines.
