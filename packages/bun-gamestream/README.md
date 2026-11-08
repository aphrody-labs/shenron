# bun-gamestream

Low-latency video and input streaming client/server engine for Shenron.

## Features

- **Sub-frame Latency Input Forwarding**: WebRTC DataChannels / WebSocket low-overhead transport for controller events.
- **Hardware-Accelerated Decoding**: WebCodecs / WebGPU canvas rendering on the client with zero copy where supported.
- **Pure Bun Host Server**: Minimal runtime overhead hosting stream sessions, controller mapping, and state synchronization.

## Architecture

- `src/server.ts` : Session coordinator and socket relay implementation.
- `src/client/` : Browser-side WebCodecs canvas renderer and Gamepad API input loop.
