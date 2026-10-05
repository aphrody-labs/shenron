import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { botFile, uiAssetsDir } from "../src/lib/asset-files";

const BOT = resolve(import.meta.dir, "..");

// Un bot déployé sans build du site n'a pas `apps/site/public/` rempli par le predev :
// favicons, icônes et PNG de marque se lisent dans leur source `packages/ui/assets/`.
describe("botFile", () => {
	test("favicons et PNG de marque viennent de packages/ui/assets", () => {
		for (const relative of ["public/favicon.ico", "public/icon-192.png", "assets/marque/emoji-128.png"]) {
			const path = botFile(relative, BOT);
			expect(path.startsWith(`${uiAssetsDir(BOT)}/`)).toBe(true);
			expect(existsSync(path)).toBe(true);
		}
	});

	test("les autres alias gardent leur copie canonique", () => {
		const font = botFile("assets/fonts/Inter-Bold.ttf", BOT);
		expect(font.replaceAll("\\", "/")).toEndWith("/apps/site/public/fonts/Inter-Bold.ttf");
		expect(botFile("assets/dbz/xv2-catalog.json", BOT).replaceAll("\\", "/")).toEndWith(
			"/apps/bot/assets/dbz/xv2-catalog.json"
		);
	});
});
