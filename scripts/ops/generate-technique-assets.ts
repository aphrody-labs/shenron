import { runRemoteSql } from "./remote-sql";
import * as fs from "fs";

interface Technique {
  id: number;
  slug: string;
  name: string;
  type: string | null;
  image: string | null;
  creator_id: number | null;
  debut_chapter_id: number | null;
  debut_episode_id: number | null;
}

// 1. Icon SVGs per category / energy type
export function generateTechniqueSvg(type: string | null, name: string): string {
  const t = (type || "").toLowerCase();
  let bgGrad1 = "#1a1a2e";
  let bgGrad2 = "#16213e";
  let coreColor = "#00f2fe";
  let auraColor = "#4facfe";
  let symbolPath = "";

  if (t === "kikoha" || /kamehameha|kikoho|garric|beam|cannon|flash|blast/i.test(name)) {
    // Energy blast / Ki beam
    bgGrad1 = "#1e130c";
    bgGrad2 = "#3a1c06";
    coreColor = "#fff2a3";
    auraColor = "#ff7b00";
    symbolPath = `
      <circle cx="64" cy="64" r="28" fill="url(#coreGrad)" filter="url(#glow)"/>
      <path d="M 64 24 Q 74 64 114 64 Q 74 64 64 104 Q 54 64 14 64 Q 54 64 64 24 Z" fill="${coreColor}" opacity="0.9"/>
      <circle cx="64" cy="64" r="14" fill="#ffffff"/>
      <circle cx="86" cy="42" r="5" fill="${coreColor}" opacity="0.8"/>
      <circle cx="42" cy="86" r="4" fill="${coreColor}" opacity="0.8"/>
    `;
  } else if (t === "ultimate" || /genkidama|final|supernova|explosion/i.test(name)) {
    // Ultimate devastating sphere
    bgGrad1 = "#1a0b2e";
    bgGrad2 = "#2e0854";
    coreColor = "#f39c12";
    auraColor = "#e74c3c";
    symbolPath = `
      <circle cx="64" cy="64" r="34" fill="url(#coreGrad)" filter="url(#glow)"/>
      <circle cx="64" cy="64" r="22" fill="#ffffff" opacity="0.95"/>
      <circle cx="64" cy="64" r="12" fill="${coreColor}"/>
      <path d="M 30 64 A 34 34 0 0 1 98 64" stroke="#ffffff" stroke-width="3" fill="none" opacity="0.6" stroke-dasharray="6,4"/>
      <path d="M 64 30 A 34 34 0 0 1 64 98" stroke="#ffffff" stroke-width="3" fill="none" opacity="0.6" stroke-dasharray="6,4"/>
    `;
  } else if (t === "corps-a-corps" || /loup|poing|kick|punch|frappe|combo|enchaînement/i.test(name)) {
    // Physical combat / Martial impact
    bgGrad1 = "#200e0e";
    bgGrad2 = "#3d1313";
    coreColor = "#ff416c";
    auraColor = "#ff4b2b";
    symbolPath = `
      <path d="M 64 20 L 76 52 L 108 64 L 76 76 L 64 108 L 52 76 L 20 64 L 52 52 Z" fill="url(#coreGrad)" filter="url(#glow)"/>
      <circle cx="64" cy="64" r="16" fill="#ffffff"/>
      <line x1="38" y1="38" x2="90" y2="90" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
      <line x1="90" y1="38" x2="38" y2="90" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
    `;
  } else if (t === "support" || /téléportation|teleportation|morsure|remanente|afterimage|vol|flight/i.test(name)) {
    // Agility / Dimension / Support
    bgGrad1 = "#09203f";
    bgGrad2 = "#537895";
    coreColor = "#43e97b";
    auraColor = "#38f9d7";
    symbolPath = `
      <circle cx="64" cy="64" r="30" stroke="url(#coreGrad)" stroke-width="4" fill="none" filter="url(#glow)" stroke-dasharray="8,6"/>
      <circle cx="64" cy="64" r="18" fill="url(#coreGrad)" opacity="0.8"/>
      <circle cx="64" cy="64" r="8" fill="#ffffff"/>
      <path d="M 64 16 L 64 34 M 64 94 L 64 112 M 16 64 L 34 64 M 94 64 L 112 64" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
    `;
  } else if (t === "amplification" || t === "awoken" || /kaioken|saiyen|blue|ultra instinct|potentiel/i.test(name)) {
    // Awakening / Power surge
    bgGrad1 = "#2b0a1a";
    bgGrad2 = "#52082d";
    coreColor = "#ff0844";
    auraColor = "#ffb199";
    symbolPath = `
      <path d="M 64 18 C 78 40 96 50 88 80 C 82 100 46 100 40 80 C 32 50 50 40 64 18 Z" fill="url(#coreGrad)" filter="url(#glow)"/>
      <path d="M 64 36 C 72 50 82 56 76 76 C 72 88 56 88 52 76 C 46 56 56 50 64 36 Z" fill="#ffffff" opacity="0.9"/>
      <circle cx="64" cy="68" r="8" fill="${coreColor}"/>
    `;
  } else {
    // Standard Ki / Special technique
    bgGrad1 = "#0f2027";
    bgGrad2 = "#203a43";
    coreColor = "#00c6ff";
    auraColor = "#0072ff";
    symbolPath = `
      <circle cx="64" cy="64" r="26" fill="url(#coreGrad)" filter="url(#glow)"/>
      <circle cx="64" cy="64" r="14" fill="#ffffff"/>
      <polygon points="64,26 74,54 102,64 74,74 64,102 54,74 26,64 54,54" fill="${coreColor}" opacity="0.75"/>
    `;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${bgGrad2}"/>
      <stop offset="100%" stop-color="${bgGrad1}"/>
    </radialGradient>
    <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="60%" stop-color="${coreColor}"/>
      <stop offset="100%" stop-color="${auraColor}"/>
    </radialGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  <rect width="128" height="128" rx="24" fill="url(#bgGrad)"/>
  <rect width="124" height="124" x="2" y="2" rx="22" fill="none" stroke="${coreColor}" stroke-width="1.5" stroke-opacity="0.3"/>
  ${symbolPath}
</svg>`;
}

async function main() {
  const techniques: Technique[] = JSON.parse(fs.readFileSync("scripts/ops/all_techniques.json", "utf8"));
  console.log(`Loaded ${techniques.length} techniques.`);

  // Prepare local svg dir
  const outDir = "scripts/ops/techniques_svg";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const updates: { id: number; image: string }[] = [];

  for (const t of techniques) {
    if (t.image && t.image.trim() !== "") {
      continue;
    }
    // Generate dedicated SVG icon
    const svg = generateTechniqueSvg(t.type, t.name);
    const fileName = `${t.slug}.svg`;
    fs.writeFileSync(`${outDir}/${fileName}`, svg, "utf8");
    
    // DB asset path
    const assetPath = `./assets/techniques/${fileName}`;
    updates.push({ id: t.id, image: assetPath });
  }

  console.log(`Generated ${updates.length} SVG technique icons.`);

  // Write batch sql update
  const sqlStatements = updates.map(
    (u) => `UPDATE bot.db_techniques SET image = '${u.image}' WHERE id = ${u.id};`
  );
  fs.writeFileSync("scripts/ops/update_techniques_images.sql", sqlStatements.join("\n"), "utf8");
  console.log(`Wrote update_techniques_images.sql (${sqlStatements.length} updates).`);
}

main();
