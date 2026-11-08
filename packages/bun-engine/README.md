# bun-engine

Universal retro-emulation, firmware catalog, and WebAssembly runtime package for Bun.

## Features

- **Catalog & Firmware Validation**: Validates hashes, formats, and region descriptors for retro titles and systems.
- **Pure Bun FFI Runtime**: Direct FFI interfacing with Libretro cores and hardware decoders without node-gyp or external dependencies.
- **WebAssembly / WebOS Emulation Harness**: Browser-ready WebAssembly and Canvas pipelines for emulation previews and archival playback.

## Structure

- `src/console/` : Console definitions, hardware specifications, and system metadata.
- `src/firmware/` : BIOS and firmware integrity verification tools.
- `src/formats/` : Binary parsers for ROMs, disc images, and archive containers.
- `src/libretro/` : Libretro frontend bindings and video/audio frame buffer streaming.
- `web-emulation/` : Web-based runner scripts and qualification harnesses.
