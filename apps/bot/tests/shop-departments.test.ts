import "./setup";
import { describe, expect, test } from "bun:test";
import { container } from "tsyringe";
import { DatabaseService } from "~/db/index";
import { shopItems } from "~/db/schema";
import { makeInteraction } from "./_mock";

describe("boutique : rayons proposés", () => {
  test("un rayon sans objet en vente n'apparaît pas dans le menu", async () => {
    const dbs = container.resolve(DatabaseService);
    await dbs.db.delete(shopItems);
    await dbs.db.insert(shopItems).values([
      { key: "badge_test", type: "badge", name: "Badge", price: 10, enabled: true },
      { key: "color_test", type: "color", name: "Couleur", price: 10, enabled: true },
      { key: "card_off", type: "card", name: "Carte", price: 0, enabled: false },
    ]);
    const { ShopPanelCommands } = await import("~/commands/economy/Shop");
    const cmd = container.resolve(ShopPanelCommands);
    const interaction = makeInteraction();
    await cmd.openShop(interaction as never);
    const payload = interaction.reply.mock.calls[0]![0] as { components: { toJSON(): any }[] };
    const options = payload.components[0]!.toJSON().components[0].options.map((o: any) => o.value);
    expect(options).toEqual(["badge", "color"]);
  });

  test("une boutique vide le dit au lieu d'ouvrir un menu", async () => {
    const dbs = container.resolve(DatabaseService);
    await dbs.db.delete(shopItems);
    const { ShopPanelCommands } = await import("~/commands/economy/Shop");
    const interaction = makeInteraction();
    await container.resolve(ShopPanelCommands).openShop(interaction as never);
    const payload = interaction.reply.mock.calls[0]![0] as {
      content: string;
      components?: unknown;
    };
    expect(payload.content).toContain("vide");
    expect(payload.components).toBeUndefined();
  });
});
