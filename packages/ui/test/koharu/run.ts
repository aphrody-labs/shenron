// SPDX-License-Identifier: MIT OR Apache-2.0
// bun:test shares one module registry per process, so mock.module() overrides leak between
// files. Each Koharu editor suite runs in its own `bun test` process with the DOM preloads.
const root = new URL("../../", import.meta.url).pathname;
const files = [...new Bun.Glob("test/koharu/**/*.test.{ts,tsx}").scanSync(root)].toSorted();
const extra = Bun.argv.slice(2);
let failed = 0;
for (const file of files) {
	const proc = Bun.spawn(
		[process.execPath, "test", "--timeout", "8000", "--preload", "@aphrody/bun-test-dom", "--preload", "./test/koharu/setup.ts", ...extra, file],
		{ cwd: root, stdout: "inherit", stderr: "inherit" },
	);
	if ((await proc.exited) !== 0) failed++;
}
console.log(`\n${files.length - failed}/${files.length} Koharu test files passed`);
process.exit(failed ? 1 : 0);
