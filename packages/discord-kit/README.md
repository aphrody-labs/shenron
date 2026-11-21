# @aphrody/shenron-discord-kit

<!-- catalog:begin unit -->

> Unified Discord bot core kit: pre-flight intent negotiation, memory-bounded caching, resilient interaction dispatching, lifecycle management and guards for Bun.

| Type        | Path                   |
| :---------- | :--------------------- |
| Bun package | `packages/discord-kit` |

**Commands**

The package defines no scripts: the root `just check` and `just test` cover it.

<!-- catalog:end -->

Shared Discord bot core kit, private workspace package `@aphrody/shenron-discord-kit`, used by the Shenron and Rose Griffon bots.

## Features

- **Preflight Intent Negotiation**: Verifies approved privileged gateway intents (`GuildMembers`, `GuildPresences`, `MessageContent`) against Discord REST API `/applications/@me` before constructing `Client`, gracefully downgrading to fallback intents rather than crashing the gateway connection with code 4014 ("Disallowed intents").
- **Production Cache Limits & Sweepers**: Preset `makeCache` and `sweepers` configuration calibrated for long-running Bun 24/7 gateway processes to prevent memory leaks from message, thread, and reaction accumulation.
- **Resilient Interaction Dispatcher**: `safeExecuteInteraction` safely handles autocomplete, deferred, replied, and unreplied interactions, recovering failed commands and preventing hanging Discord UI states.
- **Commands Safety**: Diagnoses Discord API `Invalid Form Body` errors with detailed `rawError` path logging.
- **Guards**: `NotBot` (drops automated bot events) and `createMonoGuildGuard` (restricts private bots to a designated production server).
- **Graceful Lifecycle**: Structured SIGTERM and SIGINT cleanup sequence.

## Implementation ownership

Messaging (`./messaging`), REST with retries (`./rest`), guards, command registration, cache and bot lifecycle helpers live in `src/`. Transport tests keep Bun's native multipart primitives.
