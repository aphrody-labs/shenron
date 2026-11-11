# Awesome Lua 5.2 (PUC-Rio) Curated Ecosystem & Sovereign Reference

A curated list of libraries, tools, engines, decompilers, runtimes, and resources specifically designed or optimized for **Lua 5.2** (`PUC-Rio Lua 5.2.4`).

---

## 1. Core Runtime & Language Specifications
- **[Lua 5.2 Reference Manual](https://www.lua.org/manual/5.2/)**: The canonical reference manual by Roberto Ierusalimschy, Luiz Henrique de Figueiredo, and Waldemar Celes.
- **[A Look at the Design of Lua 5.2](https://www.lua.org/doc/cacm2018.pdf)**: Comprehensive paper exploring `_ENV` lexical environments, generational GC, and the removal of `setfenv`/`getfenv`.
- **[Lua 5.2 Bytecode Architecture](https://files.catbox.moe/lua52_bytecode.pdf)**: Detailed layout of 32-bit instructions, chunk headers, and the 40 standard opcodes.

---

## 2. Gaming Engines & Modding Ecosystems (Lua 5.2)
- **Dragon Ball Xenoverse 2**: Scripting of Parallel Quests, skill parameters, AI scripts, and camera sequences using Lua 5.2 chunks.
- **CryEngine 3.8+ / Crytek**: Uses Lua 5.2 for game logic, entity behavior trees, and UI scripting.
- **Defold Engine**: High-performance 2D game engine built around Lua 5.2 with zero garbage collection overhead during gameplay.
- **World of Warcraft (Patch 5.x - 7.x)**: UI scripting and add-on architecture powered by Lua 5.2.
- **Solar2D (formerly Corona SDK)**: Cross-platform mobile game engine leveraging Lua 5.2.

---

## 3. Rust + Lua 5.2 Integrations
- **[mlua](https://github.com/khvzak/mlua)**: High-level Rust bindings to Lua 5.4, 5.3, 5.2, 5.1 (including LuaJIT and Luau) with async/await, multi-threading, and serde support.
  ```toml
  mlua = { version = "0.11", features = ["lua52", "vendored"] }
  ```
- **[depot-re (Sovereign REA)](file:///C:/src/crates/depot/crates/depot-re)**: Integrated Rust 2024 disassembler and triage engine capable of reading precompiled Lua 5.2 chunks (`\x1bLua\x52`), parsing upvalues, prototypes, and disassembling all 40 opcodes.
- **[tree-sitter-lua](https://github.com/tree-sitter-grammars/tree-sitter-lua)**: Fast incremental Tree-Sitter AST grammar supporting full Lua 5.2 syntax (`goto`, `::label::`, `_ENV`).

---

## 4. Reverse Engineering & Bytecode Tooling
- **[depot re](file:///C:/src/crates/depot)**: Sovereign CLI with built-in Lua 5.2 chunk reader, opcode formatter, and symbol recovery.
- **[Unluac](https://sourceforge.net/projects/unluac/)**: Java-based decompiler for Lua 5.0 through 5.4 with full Lua 5.2 chunk support.
- **[LuaDec 5.2](https://github.com/viruscamp/luadec)**: Dedicated Lua 5.2 decompiler fork.
- **[ChunkSpy 5.2](http://chunkspy.lua-users.org/)**: Bytecode disassembler and structure inspector for understanding compiled binary chunks.

---

## 5. Web, Bun & Next.js Ecosystem
- **[`@rosegriffon/lua-plugin`](file:///C:/src/rosegriffon/packages/rg-lua)**:
  - Official Bun bundler plugin (`bunPluginLua`) supporting `import script from "./script.lua"`.
  - Next.js webpack/turbopack extension (`withLua`) for isomorphic client/server Lua loading.
  - Zero-dependency Lua 5.2 pure sandbox VM (`Lua52VM`) supporting `_ENV`, `bit32`, `table.pack`, and `rawlen`.
- **[Fengari](https://fengari.io/)**: Lua 5.3/5.2 written entirely in JavaScript for browser execution.
- **[Wasmoon](https://github.com/ceifa/wasmoon)**: Real Lua 5.2/5.4 VM compiled to WebAssembly with high-speed JS-to-Lua bindings.

---

## 6. Language Server & Developer Tooling
- **[LuaLS (lua-language-server)](https://github.com/LuaLS/lua-language-server)**: The de facto language server for Lua, configured for Lua 5.2 via `.luarc.json`:
  ```json
  {
    "runtime": { "version": "Lua 5.2", "builtin": { "bit32": "enable" } }
  }
  ```
- **[Luacheck](https://github.com/mpeterv/luacheck)**: Static analyzer and linter with native Lua 5.2 support (`--std lua52`).
