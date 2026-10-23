/**
 * Import right after `./setup` and before the application modules: gives the in-process API
 * server of a test its own free port (the bot reads `API_PORT` once, when its env is parsed).
 */
const probe = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") });
Bun.env.API_PORT = String(probe.port);
Bun.env.API_HOST = "127.0.0.1";
Bun.env.API_ENABLED = "true";
probe.stop(true);
