/** Install Omar's posted public key for the omar accounts on VPS and dbfr. */

const raw = Bun.argv[2]?.trim();
if (!raw || raw.includes("...")) {
  console.error("Usage: bun scripts/dev/install-omar-public-key.ts '<ssh-ed25519 public key>'");
  process.exit(2);
}

const match = /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256) ([A-Za-z0-9+/]+={0,3})(?:\s+.*)?$/.exec(raw);
if (!match) {
  console.error("Expected a complete ed25519, RSA, or NIST P-256 SSH public key.");
  process.exit(2);
}

const publicKey = `${match[1]} ${match[2]} omar-codex`;
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const remoteScript = `set -eu
file=/etc/ssh/authorized_keys.d/omar
test -f "$file"
key=${shellQuote(publicKey)}
grep -qxF -- "$key" "$file" || printf '%s\\n' "$key" >> "$file"
chown root:root "$file"
chmod 0644 "$file"
`;

for (const host of ["vps", "dbfr"]) {
  const result = Bun.spawnSync(
    ["aphrody-infra", "ssh", "exec", "--host", host, "--cmd", `sudo -n sh -c ${shellQuote(remoteScript)}`],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (!result.success) process.exit(result.exitCode ?? 1);
}

console.log("Omar's public key is installed on VPS and dbfr.");
