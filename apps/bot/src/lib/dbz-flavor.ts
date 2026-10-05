/**
 * Textes DBZ-thémés des passages de palier (`levelUpMessage`, 3 variantes par
 * niveau). La quête quotidienne est rendue par le template `daily_quest`.
 */
import { formatXP, xpRequiredForLevel } from "./xp";

function pick<T>(arr: readonly T[]): T {
	return arr[Math.floor(Math.random() * arr.length)]!;
}

// ─── Level up ─────────────────────────────────────────────────────────────

/**
 * Trois variantes par palier — sélection aléatoire à chaque level-up.
 * Les paliers 1-10 correspondent à LEVEL_THRESHOLDS (1 k → 9 M).
 */
const LEVEL_FLAVORS: Record<number, readonly string[]> = {
	1: [
		"💨 **Premier souffle** — tu dépasses l'humain moyen. Chi-Chi approuve (pour une fois).",
		"🌱 **Aura visible** — Roshi te laisse arroser le jardin. C'est un début.",
		"🥚 **Sortie de la coquille** — tu viens de dépasser Yamcha. De peu.",
	],
	2: [
		"🥋 **Niveau Krilin** — tu t'entraînes sérieusement au dojo Turtle.",
		"🎯 **Contrôle du ki** — Ten Shin Han t'accorde un hochement de tête.",
		"🧢 **Chauve honorable** — Nimbus tolère ton poids.",
	],
	3: [
		"⚔️ **Saga Saiyan** — tu tiendrais tête à Nappa (pas longtemps, mais quand même).",
		"👊 **Kaio-ken débloqué** — la route du Serpent ne t'effraie plus.",
		"🪐 **Gravité 10×** — tu marches droit là où Gokū rampait hier.",
	],
	4: [
		"🌍 **Saga Namek** — les soldats de Freezer commencent à transpirer.",
		"🟢 **Contact Namekien** — Piccolo te concède un sourire en coin.",
		"🛸 **Vaisseau Bulma** — tu atteins la vitesse supra-lumière mentalement.",
	],
	5: [
		"☢️ **Saga Cyborgs** — Dr. Gero a mis ton nom sur sa liste.",
		"🤖 **C-17 t'observe** — il hausse les sourcils. C'est déjà beaucoup.",
		"🧬 **Cell Phase 1** esquive un peu moins bien tes attaques.",
	],
	6: [
		"💪 **Super Saiyan débloqué** — cheveux dorés, aura qui chauffe les murs.",
		"🟡 **Le Légendaire** — une colère suffisante, une transformation suffisante.",
		"🦁 **Route de Gokū** — le scouter de Freezer a explosé rien qu'en te voyant.",
	],
	7: [
		"🌟 **Super Saiyan 2** — la foudre crépite, le sol recule.",
		"⚡ **Moment Gohan vs Cell** — ton ki devient cassant comme du verre.",
		"💥 **Électricité statique divine** — ta coiffure refuse de redescendre.",
	],
	8: [
		"🦁 **Super Saiyan 3** — tes cheveux touchent le sol, la planète tremble.",
		"🌋 **Tension planétaire** — le Kaiō du Nord te supplie de te calmer.",
		"🫠 **Forme coûteuse** — tu la tiens 10 minutes, puis tu dors 3 jours.",
	],
	9: [
		"🌌 **Super Saiyan Blue** — union du Saiyan et du Kaio-ken, aura turquoise.",
		"🐉 **Beerus hoche la tête** — il ne dort plus pendant ton combat.",
		"🧘 **Whis lève les yeux** de sa tasse. C'est un compliment.",
	],
	10: [
		"⚡ **IT'S OVER 9 000 000 !** — Ultra Instinct, forme argentée, mouvements purs.",
		"👑 **Mastered Ultra Instinct** — Jiren hésite. Jiren n'hésite jamais.",
		"🌠 **Zeno-sama applaudit** depuis sa tour. Ça n'arrive jamais.",
	],
};

export function levelUpMessage(userId: string, newLevel: number): string {
	const reqXp = xpRequiredForLevel(newLevel);
	const threshold = Number.isFinite(reqXp) ? { level: newLevel, xp: reqXp } : undefined;
	const variants = LEVEL_FLAVORS[newLevel];
	const flavor = variants ? pick(variants) : undefined;
	const header = threshold
		? `<@${userId}> a atteint les **${formatXP(threshold.xp)} unités** !`
		: `<@${userId}> monte en puissance !`;
	return flavor ? `${header}\n${flavor}` : header;
}
