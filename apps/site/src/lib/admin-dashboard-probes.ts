import net from "node:net";
import tls from "node:tls";

/** A listening socket is insufficient: authentication and PING must both succeed. */
export async function pingDashboardRedis(rawUrl: string, timeoutMs = 1_000): Promise<void> {
  const url = new URL(rawUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:")
    throw new Error("Invalid Redis protocol");
  const command = (args: string[]) =>
    `*${args.length}\r\n${args.map((arg) => `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`).join("")}`;
  const password = decodeURIComponent(url.password);
  const username = decodeURIComponent(url.username);
  const commands = password
    ? [command(username ? ["AUTH", username, password] : ["AUTH", password]), command(["PING"])]
    : [command(["PING"])];
  await new Promise<void>((resolve, reject) => {
    const options = { host: url.hostname.replace(/^\[|\]$/g, ""), port: Number(url.port || 6379) };
    const socket = url.protocol === "rediss:" ? tls.connect(options) : net.connect(options);
    let received = "";
    let responses = 0;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error("Redis timeout")), timeoutMs);
    socket.once(url.protocol === "rediss:" ? "secureConnect" : "connect", () =>
      socket.write(commands.join("")),
    );
    socket.once("error", () => finish(new Error("Redis connection failed")));
    socket.once("end", () => finish(new Error("Redis connection closed")));
    socket.on("data", (chunk) => {
      received += chunk.toString();
      if (received.length > 1_024) return finish(new Error("Invalid Redis response"));
      let end: number;
      while ((end = received.indexOf("\r\n")) >= 0) {
        const line = received.slice(0, end);
        received = received.slice(end + 2);
        const expected = commands.length === 2 && responses === 0 ? "+OK" : "+PONG";
        if (line !== expected) return finish(new Error("Redis PING or authentication failed"));
        responses++;
        if (responses === commands.length) return finish();
      }
    });
  });
}
