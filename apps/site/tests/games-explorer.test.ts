import { describe, expect, it } from "bun:test";
import type { Game } from "@/lib/db-universe";
import { selectGames, type PlatformGroup, type SortOption } from "../src/lib/games-catalogue";

function filterAndSortGames(
  games: Game[],
  ratings: Record<string, { average: number; count: number }>,
  searchQuery: string,
  selectedPlatform: PlatformGroup,
  sortBy: SortOption,
) {
  return selectGames(games, ratings, {
    query: searchQuery,
    platform: selectedPlatform,
    sort: sortBy,
    locale: "fr",
  });
}

describe("GamesExplorer logic & canonical game metadata", () => {
  const mockGames: Game[] = [
    {
      id: 1,
      slug: "dragon-ball-sparking-zero",
      title: "Dragon Ball: Sparking! ZERO",
      title_ja: "ドラゴンボール Sparking! ZERO",
      platforms: "PS5, Xbox Series X/S, PC",
      release_date: 1728518400, // Octobre 2024
      developer: "Spike Chunsoft",
      publisher: "Bandai Namco",
      description: "Le nouvel opus de la lignée Budokai Tenkaichi avec plus de 180 personnages.",
      cover: "/covers/sparking-zero.webp",
      official_url: null,
      media: [],
    },
    {
      id: 2,
      slug: "dragon-ball-fighterz",
      title: "Dragon Ball FighterZ",
      title_ja: "ドラゴンボール ファイターズ",
      platforms: "PS4, Xbox One, Switch, PC",
      release_date: 1516924800, // Janvier 2018
      developer: "Arc System Works",
      publisher: "Bandai Namco",
      description: "Jeu de combat 2.5D en 3 contre 3 avec une direction artistique sublime.",
      cover: "/covers/fighterz.webp",
      official_url: null,
      media: [],
    },
    {
      id: 3,
      slug: "dragon-ball-z-dokkan-battle",
      title: "Dragon Ball Z: Dokkan Battle",
      title_ja: "ドラゴンボールZ ドッカンバトル",
      platforms: "iOS, Android",
      release_date: 1422576000, // Janvier 2015
      developer: "Akatsuki",
      publisher: "Bandai Namco",
      description: "Jeu mobile free-to-play combinant puzzle, stratégie et animations épiques.",
      cover: "/covers/dokkan.webp",
      official_url: null,
      media: [],
    },
    {
      id: 4,
      slug: "dragon-ball-z-super-butoden",
      title: "Dragon Ball Z: Super Butōden",
      title_ja: "ドラゴンボールZ 超武闘伝",
      platforms: "Super Famicom, SNES",
      release_date: 732672000, // Mars 1993
      developer: "TOSE",
      publisher: "Bandai",
      description: "Le jeu de combat pionnier avec écran partagé (split-screen).",
      cover: "/covers/butoden.webp",
      official_url: null,
      media: [],
    },
  ];

  const mockRatings = {
    "1": { average: 4.8, count: 120 },
    "2": { average: 4.9, count: 450 },
    "3": { average: 4.2, count: 890 },
    "4": { average: 4.0, count: 50 },
  };

  it("filtre correctement par plateforme", () => {
    const playstationGames = filterAndSortGames(
      mockGames,
      mockRatings,
      "",
      "playstation",
      "date-desc",
    );
    expect(playstationGames.map((g) => g.id)).toEqual([1, 2]);

    const nintendoGames = filterAndSortGames(mockGames, mockRatings, "", "nintendo", "date-desc");
    expect(nintendoGames.map((g) => g.id)).toEqual([2, 4]);

    const mobileGames = filterAndSortGames(mockGames, mockRatings, "", "mobile", "date-desc");
    expect(mobileGames.map((g) => g.id)).toEqual([3]);
  });

  it("recherche en plein texte multilingue et multi-champs", () => {
    // Recherche par titre japonais
    const resJa = filterAndSortGames(mockGames, mockRatings, "超武闘伝", "all", "date-desc");
    expect(resJa.length).toBe(1);
    expect(resJa[0].slug).toBe("dragon-ball-z-super-butoden");

    // Recherche par studio développeur
    const resDev = filterAndSortGames(
      mockGames,
      mockRatings,
      "Arc System Works",
      "all",
      "date-desc",
    );
    expect(resDev.length).toBe(1);
    expect(resDev[0].slug).toBe("dragon-ball-fighterz");

    // Recherche dans la description
    const resDesc = filterAndSortGames(mockGames, mockRatings, "puzzle", "all", "date-desc");
    expect(resDesc.length).toBe(1);
    expect(resDesc[0].slug).toBe("dragon-ball-z-dokkan-battle");
  });

  it("trie par note de fans et par date de sortie", () => {
    // Tri note décroissante
    const byRating = filterAndSortGames(mockGames, mockRatings, "", "all", "rating-desc");
    expect(byRating[0].slug).toBe("dragon-ball-fighterz"); // 4.9
    expect(byRating[1].slug).toBe("dragon-ball-sparking-zero"); // 4.8

    // Tri chronologique rétro (anciens d'abord)
    const byRetro = filterAndSortGames(mockGames, mockRatings, "", "all", "date-asc");
    expect(byRetro[0].slug).toBe("dragon-ball-z-super-butoden"); // 1993
    expect(byRetro[byRetro.length - 1].slug).toBe("dragon-ball-sparking-zero"); // 2024
  });
});
