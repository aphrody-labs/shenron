// SPDX-License-Identifier: Apache-2.0
//! Mapping of the 2D combat simulation space to the 3D Bevy scene, without any Bevy type so the
//! numbers stay testable on every target.
use crate::types::{ArenaId, FighterId};

/// Simulation pixels per Bevy world unit.
pub const PIXELS_PER_UNIT: f32 = 90.0;
/// Horizontal centre of the 960 pixel wide arena.
pub const ARENA_CENTER_X: f32 = 480.0;

/// Bevy world x of a simulation x.
#[must_use]
pub fn world_x(x: f32) -> f32 {
    (x - ARENA_CENTER_X) / PIXELS_PER_UNIT
}

/// Bevy world height above the ground of a simulation y (the y axis points down in the engine).
#[must_use]
pub fn world_height(y: f32, ground_y: f32) -> f32 {
    ((ground_y - y) / PIXELS_PER_UNIT).max(0.0)
}

/// Sky, ground and sunlight colors of an arena, as sRGB triples.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ArenaPalette {
    pub sky: [f32; 3],
    pub ground: [f32; 3],
    pub light: [f32; 3],
}

#[must_use]
pub fn arena_palette(arena: ArenaId) -> ArenaPalette {
    match arena {
        ArenaId::Paozu => ArenaPalette {
            sky: [0.55, 0.78, 0.95],
            ground: [0.30, 0.58, 0.28],
            light: [1.0, 0.97, 0.88],
        },
        ArenaId::Budokai => ArenaPalette {
            sky: [0.48, 0.70, 0.96],
            ground: [0.76, 0.73, 0.66],
            light: [1.0, 1.0, 0.95],
        },
        ArenaId::Wasteland => ArenaPalette {
            sky: [0.86, 0.60, 0.38],
            ground: [0.56, 0.40, 0.27],
            light: [1.0, 0.84, 0.65],
        },
        ArenaId::Namek => ArenaPalette {
            sky: [0.50, 0.86, 0.72],
            ground: [0.20, 0.56, 0.42],
            light: [0.9, 1.0, 0.85],
        },
        ArenaId::CellGames => ArenaPalette {
            sky: [0.32, 0.46, 0.74],
            ground: [0.80, 0.80, 0.83],
            light: [0.95, 0.97, 1.0],
        },
        ArenaId::Kaiohshin => ArenaPalette {
            sky: [0.90, 0.80, 0.96],
            ground: [0.95, 0.91, 0.80],
            light: [1.0, 0.96, 0.9],
        },
        ArenaId::KaioPlanet => ArenaPalette {
            sky: [0.98, 0.86, 0.42],
            ground: [0.40, 0.70, 0.30],
            light: [1.0, 0.95, 0.8],
        },
    }
}

/// Outfit, hair and skin colors of a fighter, as sRGB triples.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FighterPalette {
    pub outfit: [f32; 3],
    pub hair: [f32; 3],
    pub skin: [f32; 3],
}

#[must_use]
pub fn fighter_palette(id: FighterId) -> FighterPalette {
    const SKIN: [f32; 3] = [0.94, 0.76, 0.60];
    const BLACK: [f32; 3] = [0.08, 0.08, 0.12];
    match id {
        FighterId::Goku => FighterPalette { outfit: [0.96, 0.45, 0.06], hair: BLACK, skin: SKIN },
        FighterId::Vegeta => FighterPalette { outfit: [0.14, 0.24, 0.70], hair: BLACK, skin: SKIN },
        FighterId::Gohan => FighterPalette { outfit: [0.45, 0.20, 0.62], hair: BLACK, skin: SKIN },
        FighterId::Piccolo => FighterPalette {
            outfit: [0.50, 0.22, 0.70],
            hair: [0.35, 0.75, 0.32],
            skin: [0.35, 0.75, 0.32],
        },
        FighterId::Trunks => {
            FighterPalette { outfit: [0.36, 0.38, 0.86], hair: [0.52, 0.34, 0.80], skin: SKIN }
        },
        FighterId::Frieza => FighterPalette {
            outfit: [0.92, 0.92, 0.96],
            hair: [0.62, 0.34, 0.76],
            skin: [0.93, 0.93, 0.97],
        },
        FighterId::Cell => FighterPalette {
            outfit: [0.40, 0.70, 0.28],
            hair: [0.28, 0.52, 0.22],
            skin: [0.46, 0.76, 0.34],
        },
        FighterId::Buu => FighterPalette {
            outfit: [0.98, 0.62, 0.72],
            hair: [0.98, 0.62, 0.72],
            skin: [0.98, 0.70, 0.78],
        },
        FighterId::Yamcha => FighterPalette { outfit: [0.90, 0.52, 0.12], hair: BLACK, skin: SKIN },
        FighterId::Krilin => FighterPalette { outfit: [0.95, 0.50, 0.10], hair: SKIN, skin: SKIN },
        FighterId::JackieChun => {
            FighterPalette { outfit: [0.20, 0.55, 0.30], hair: [0.92, 0.92, 0.92], skin: SKIN }
        },
        FighterId::Beerus => FighterPalette {
            outfit: [0.10, 0.10, 0.12],
            hair: [0.62, 0.56, 0.78],
            skin: [0.62, 0.56, 0.78],
        },
    }
}

/// Saiyans whose hair takes the transformation color.
#[must_use]
pub fn hair_follows_form(id: FighterId) -> bool {
    matches!(id, FighterId::Goku | FighterId::Vegeta | FighterId::Gohan | FighterId::Trunks)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arena_center_maps_to_world_origin() {
        assert_eq!(world_x(ARENA_CENTER_X), 0.0);
        assert_eq!(world_x(ARENA_CENTER_X + PIXELS_PER_UNIT), 1.0);
    }

    #[test]
    fn height_is_zero_on_the_ground_and_never_negative() {
        assert_eq!(world_height(330.0, 330.0), 0.0);
        assert_eq!(world_height(420.0, 330.0), 0.0);
        assert_eq!(world_height(240.0, 330.0), 1.0);
    }

    #[test]
    fn every_fighter_and_arena_has_a_valid_palette() {
        let fighters = [
            FighterId::Goku,
            FighterId::Vegeta,
            FighterId::Gohan,
            FighterId::Piccolo,
            FighterId::Trunks,
            FighterId::Frieza,
            FighterId::Cell,
            FighterId::Buu,
            FighterId::Yamcha,
            FighterId::Krilin,
            FighterId::JackieChun,
            FighterId::Beerus,
        ];
        let arenas = [
            ArenaId::Paozu,
            ArenaId::Budokai,
            ArenaId::Wasteland,
            ArenaId::Namek,
            ArenaId::CellGames,
            ArenaId::Kaiohshin,
            ArenaId::KaioPlanet,
        ];
        let in_range = |color: [f32; 3]| color.iter().all(|c| (0.0..=1.0).contains(c));
        for id in fighters {
            let palette = fighter_palette(id);
            assert!(in_range(palette.outfit) && in_range(palette.hair) && in_range(palette.skin));
        }
        for arena in arenas {
            let palette = arena_palette(arena);
            assert!(in_range(palette.sky) && in_range(palette.ground) && in_range(palette.light));
        }
    }
}
