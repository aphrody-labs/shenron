const SMTP_HOST = "ssl0.ovh.net";
const SMTP_PORT = 465;
const DEFAULT_SMTP_USER = "contact@aphrody.com";
const DEFAULT_EMAIL_FROM = "Dragon Ball France <contact@aphrody.com>";
const MAX_MESSAGE_BYTES = 256 * 1024;
const RESPONSE_TIMEOUT_MS = 15_000;

type SmtpSocket = Awaited<ReturnType<typeof Bun.connect>>;

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function safeHeader(value: string, label: string): string {
  if (/[\r\n\0]/.test(value)) throw new Error(`Invalid SMTP ${label} header.`);
  return value;
}

function mailbox(value: string): string {
  const cleaned = safeHeader(value, "mailbox").trim();
  const match = /<([^<>\s]+@[^<>\s]+)>$/.exec(cleaned);
  const address = match?.[1] ?? cleaned;
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) {
    throw new Error("Invalid SMTP mailbox.");
  }
  return address;
}

function encodedSubject(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return safeHeader(value, "subject");
  return `=?UTF-8?B?${base64(safeHeader(value, "subject"))}?=`;
}

function smtpBody(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  const wrapped = base64(normalized);
  return wrapped.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function expected(reply: string, codes: number[], command: string): void {
  const code = Number(reply.slice(0, 3));
  if (!codes.includes(code)) throw new Error(`SMTP rejected ${command} (${code}).`);
}

export async function sendSmtpEmail(
  env: (name: string) => string | undefined,
  input: { to: string; subject: string; text: string },
): Promise<void> {
  const username = env("SMTP_USER") ?? DEFAULT_SMTP_USER;
  const password = env("SMTP_PASSWORD");
  const from = env("AUTH_EMAIL_FROM") ?? DEFAULT_EMAIL_FROM;
  if (!password) throw new Error("OVH SMTP is not configured.");

  const fromAddress = mailbox(from);
  const toAddress = mailbox(input.to);
  const subject = encodedSubject(input.subject);
  const body = smtpBody(input.text);
  const message = [
    `From: ${safeHeader(from, "from")}`,
    `To: ${toAddress}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@dragonballfr.com>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
    "",
  ].join("\r\n");
  if (new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES) {
    throw new Error("SMTP message exceeds the configured size limit.");
  }

  const lines: string[] = [];
  const waiters: Array<(line: string) => void> = [];
  let socketRef: SmtpSocket | null = null;
  let socketError: Error | null = null;
  let pending = "";
  const socket = await Bun.connect({
    hostname: SMTP_HOST,
    port: SMTP_PORT,
    tls: true,
    socket: {
      open(connected) {
        socketRef = connected;
      },
      data(_connected, chunk) {
        pending += new TextDecoder().decode(chunk);
        for (;;) {
          const end = pending.indexOf("\r\n");
          if (end < 0) break;
          const line = pending.slice(0, end);
          pending = pending.slice(end + 2);
          const waiter = waiters.shift();
          if (waiter) waiter(line);
          else lines.push(line);
        }
      },
      error(_connected, error) {
        socketError = error;
        while (waiters.length) waiters.shift()!("");
      },
      close(_connected, error) {
        if (error) socketError = error;
        while (waiters.length) waiters.shift()!("");
      },
    },
  });
  socketRef = socket;

  const readLine = async (): Promise<string> => {
    if (lines.length) return lines.shift()!;
    if (socketError) throw socketError;
    return await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = waiters.indexOf(receive);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error("SMTP response timed out."));
      }, RESPONSE_TIMEOUT_MS);
      const receive = (line: string) => {
        clearTimeout(timeout);
        if (!line && socketError) reject(socketError);
        else if (!line) reject(new Error("SMTP connection closed unexpectedly."));
        else resolve(line);
      };
      waiters.push(receive);
    });
  };

  const readReply = async (): Promise<string> => {
    const first = await readLine();
    const code = first.slice(0, 3);
    let reply = first;
    if (first[3] === "-") {
      for (let count = 0; count < 100; count += 1) {
        const line = await readLine();
        reply += `\n${line}`;
        if (line.startsWith(`${code} `)) return reply;
      }
      throw new Error("SMTP response exceeded its line limit.");
    }
    return reply;
  };

  const command = async (value: string, codes: number[], label: string) => {
    const active = socketRef;
    if (!active) throw new Error("SMTP socket is not connected.");
    active.write(`${value}\r\n`);
    const reply = await readReply();
    expected(reply, codes, label);
    return reply;
  };

  try {
    expected(await readReply(), [220], "greeting");
    const capabilities = await command("EHLO dragonballfr.com", [250], "EHLO");
    if (/^250[- ].*\bAUTH\b[^\r\n]*\bPLAIN\b/im.test(capabilities)) {
      await command(`AUTH PLAIN ${base64(`\0${username}\0${password}`)}`, [235], "AUTH PLAIN");
    } else {
      await command("AUTH LOGIN", [334], "AUTH LOGIN");
      await command(base64(username), [334], "SMTP username");
      await command(base64(password), [235], "SMTP password");
    }
    await command(`MAIL FROM:<${fromAddress}>`, [250], "MAIL FROM");
    await command(`RCPT TO:<${toAddress}>`, [250, 251], "RCPT TO");
    await command("DATA", [354], "DATA");
    const active = socketRef;
    if (!active) throw new Error("SMTP socket is not connected.");
    active.write(`${message.replace(/^\./gm, "..")}\r\n.\r\n`);
    expected(await readReply(), [250], "message delivery");
    await command("QUIT", [221], "QUIT");
  } finally {
    socketRef?.end();
  }
}
