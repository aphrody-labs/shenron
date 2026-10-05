import { describe, expect, test } from "bun:test";
import { join } from "node:path";

// Discord refuse au démarrage toute commande dont un nom dépasse 32 caractères ou une
// description 100 : le vérificateur statique tourne donc avec la suite du bot.
describe("contraintes Discord des commandes slash", () => {
  test("noms, descriptions et choix dans les limites", () => {
    const run = Bun.spawnSync(
      [process.execPath, join(import.meta.dir, "../scripts/check-slash-lengths.ts")],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(run.stderr.toString()).toBe("");
    expect(run.exitCode).toBe(0);
  });
});
