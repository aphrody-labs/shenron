// SPDX-License-Identifier: Apache-2.0
/**
 * Original, schematic Age 1000 arena inspired by publicly described Xenoverse 3
 * locations. Coordinates and geometry are original and are not game assets.
 */
export interface MapLandmark {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "university" | "capsule" | "plaza" | "transit" | "glacier";
}

export interface MapRegion {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export const AGE1000_MAP = {
  title: "AGE 1000 — West City (carte schématique originale)",
  sourceBasis:
    "Official Xenoverse 3 descriptions: West City, its university, plazas and a glacier mission.",
  width: 1200,
  height: 760,
  regions: [
    {
      id: "downtown",
      label: "Centre urbain",
      x: 270,
      y: 160,
      width: 610,
      height: 430,
      color: "#284258",
    },
    { id: "university", label: "Campus", x: 65, y: 135, width: 250, height: 210, color: "#325969" },
    {
      id: "capsule-quarter",
      label: "Quartier Capsule",
      x: 825,
      y: 110,
      width: 300,
      height: 235,
      color: "#35536c",
    },
    { id: "harbor", label: "Esplanade", x: 865, y: 490, width: 260, height: 180, color: "#274b5c" },
    {
      id: "glacier-gate",
      label: "Porte d’expédition",
      x: 65,
      y: 505,
      width: 250,
      height: 165,
      color: "#536a79",
    },
  ] satisfies MapRegion[],
  landmarks: [
    {
      id: "west-city-university",
      label: "Université de West City",
      x: 115,
      y: 205,
      width: 145,
      height: 82,
      kind: "university",
    },
    {
      id: "great-saiya-hq",
      label: "Quartier général de l’escouade",
      x: 360,
      y: 190,
      width: 165,
      height: 78,
      kind: "plaza",
    },
    {
      id: "central-plaza",
      label: "Place centrale",
      x: 565,
      y: 320,
      width: 155,
      height: 100,
      kind: "plaza",
    },
    {
      id: "capsule-labs",
      label: "Complexe Capsule",
      x: 900,
      y: 180,
      width: 150,
      height: 90,
      kind: "capsule",
    },
    {
      id: "monorail",
      label: "Station du monorail",
      x: 680,
      y: 525,
      width: 130,
      height: 54,
      kind: "transit",
    },
    {
      id: "glacier-outpost",
      label: "Avant-poste glaciaire",
      x: 115,
      y: 545,
      width: 150,
      height: 74,
      kind: "glacier",
    },
  ] satisfies MapLandmark[],
  routes: [
    { id: "campus-to-plaza", from: [260, 245], to: [565, 355] },
    { id: "plaza-to-capsule", from: [720, 340], to: [900, 225] },
    { id: "plaza-to-transit", from: [645, 420], to: [745, 525] },
    { id: "transit-to-expedition", from: [680, 550], to: [265, 575] },
  ],
} as const;
