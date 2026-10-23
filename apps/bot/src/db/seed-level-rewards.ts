/**
 * No longer seeds `level_rewards`.
 *
 * This script used to write, for every level 1 to 10, a role of the old Saiyan ladder
 * (level 9 = Ultra Instinct, level 10 = Perfect Ultra Instinct) and a zeni bonus of
 * 1000 x level, for ALL races. After the 2026-10-22 incident (tables emptied then
 * restored), that seed recreated the table with the old ladder and its XP multiplier
 * roles came back at low levels.
 *
 * Transformation roles live in `race_level_roles` (per race, editable from the admin);
 * `level_rewards` only carries the zeni, threshold and banner of a level and is set
 * explicitly (`/config level-reward-set`, `/api/levels/rewards`). Nothing is guessed
 * here any more. The command stays so that `db:seed-all` keeps working.
 */
console.log(
  "level_rewards is no longer seeded: configure it with /config level-reward-set or /api/levels/rewards.",
);
