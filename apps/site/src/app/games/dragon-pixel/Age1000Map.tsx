// SPDX-License-Identifier: Apache-2.0
import { AGE1000_MAP } from "./age1000-map";

const REGION_COLORS: Record<string, string> = {
  university: "#f3c86a",
  capsule: "#71d4d2",
  plaza: "#ff9f68",
  transit: "#c5afff",
  glacier: "#b8e7f5",
};

export default function Age1000Map() {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 text-white shadow-xl" aria-labelledby="age1000-map-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="age1000-map-title" className="text-xl font-bold">Carte d’expédition · AGE 1000</h2>
          <p className="text-sm text-white/65">West City et accès glaciaire · schéma de jeu original</p>
        </div>
        <span className="rounded-full border border-cyan-200/25 px-3 py-1 text-xs text-cyan-100">prototype Dragon Pixel</span>
      </div>
      <div className="overflow-x-auto rounded-xl bg-[#101d2a]">
        <svg viewBox={`0 0 ${AGE1000_MAP.width} ${AGE1000_MAP.height}`} role="img" aria-labelledby="map-svg-title map-svg-desc" className="block min-w-[740px] w-full">
          <title id="map-svg-title">Carte schématique originale de West City en AGE 1000</title>
          <desc id="map-svg-desc">Cinq quartiers reliés à pied et par une station de monorail : campus, centre urbain, quartier Capsule, esplanade et porte d’expédition glaciaire.</desc>
          <defs>
            <pattern id="city-grid" width="36" height="36" patternUnits="userSpaceOnUse">
              <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#a9d4e5" strokeOpacity=".08" strokeWidth="1" />
            </pattern>
            <linearGradient id="sky" x2="0" y2="1">
              <stop stopColor="#17334b" />
              <stop offset="1" stopColor="#172434" />
            </linearGradient>
          </defs>
          <rect width="1200" height="760" fill="url(#sky)" />
          <rect width="1200" height="760" fill="url(#city-grid)" />
          <path d="M315 365H565M720 365L900 225M645 420L745 525M680 550H265" stroke="#9fd6df" strokeOpacity=".5" strokeWidth="12" strokeLinecap="round" strokeDasharray="2 19" />
          {AGE1000_MAP.regions.map((region) => (
            <g key={region.id}>
              <rect x={region.x} y={region.y} width={region.width} height={region.height} rx="28" fill={region.color} fillOpacity=".72" stroke="#d6f5ff" strokeOpacity=".3" strokeWidth="2" />
              <text x={region.x + 18} y={region.y + 30} fill="#fff" fillOpacity=".9" fontSize="17" fontWeight="700">{region.label}</text>
            </g>
          ))}
          {AGE1000_MAP.routes.map((route) => (
            <line key={route.id} x1={route.from[0]} y1={route.from[1]} x2={route.to[0]} y2={route.to[1]} stroke="#f8dc91" strokeWidth="4" strokeOpacity=".8" />
          ))}
          {AGE1000_MAP.landmarks.map((landmark) => (
            <g key={landmark.id}>
              <rect x={landmark.x} y={landmark.y} width={landmark.width} height={landmark.height} rx="14" fill="#111a25" stroke={REGION_COLORS[landmark.kind]} strokeWidth="3" />
              <circle cx={landmark.x + 18} cy={landmark.y + 18} r="6" fill={REGION_COLORS[landmark.kind]} />
              <text x={landmark.x + 14} y={landmark.y + landmark.height / 2 + 22} fill="white" fontSize="15" fontWeight="600">{landmark.label}</text>
            </g>
          ))}
          <g transform="translate(1030 415)">
            <circle r="26" fill="#67e8f9" fillOpacity=".15" stroke="#67e8f9" strokeWidth="3" />
            <circle r="8" fill="#67e8f9" />
            <text x="37" y="6" fill="#d6fbff" fontSize="15" fontWeight="700">Point de départ</text>
          </g>
          <text x="590" y="80" fill="#e1eff8" fillOpacity=".85" fontSize="24" fontWeight="800" letterSpacing="4">WEST CITY · AGE 1000</text>
          <text x="1038" y="716" fill="#bfd3dc" fontSize="13">N ↑</text>
          <path d="M1053 690V658m0 0-9 15m9-15 9 15" stroke="#bfd3dc" strokeWidth="3" fill="none" />
        </svg>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/55">Géométrie, noms de secteurs et repères dessinés pour ce prototype. La carte ne contient aucun modèle, texture ou capture extraite du jeu.</p>
    </section>
  );
}
