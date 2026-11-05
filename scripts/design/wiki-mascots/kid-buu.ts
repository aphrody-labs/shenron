// SPDX-License-Identifier: Apache-2.0
/** Original vector construction from the inspected FighterZ pose; no bitmap tracing. */
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { arcs, inkStroke } from "../../../packages/ui/src/toriyama-svg/geometry";

const root = resolve(import.meta.dir, "../../..");
const reference = resolve(root, "apps/site/public/wiki-scene/kid-buu-fighterz.png");
const referenceSha = "72b26a82de0500ab0a08288e9f576781c4e5c140fac6feb66f72480bf902a3f0";
const samples = {
  skin: [290, 305],
  skinLight: [287, 285],
  skinShade: [239, 350],
  cloth: [264, 560],
  clothShade: [389, 723],
  gold: [57, 875],
  dark: [61, 836],
  belt: [275, 427],
  mouth: [299, 247],
} as const;

// Flat interpretation of the inspected reference. Fills are authored, not claimed pixel matches.
const color = {
  ink: "#342737",
  skin: "#e793ae",
  skinLight: "#ffd3de",
  skinShade: "#bf5c88",
  skinDeep: "#8c426a",
  cloth: "#f5f4e8",
  clothShade: "#b2c5bc",
  clothDeep: "#637a7b",
  gold: "#c9a454",
  goldLight: "#f1d88a",
  dark: "#313b3e",
  darkLight: "#536264",
  mouth: "#54203f",
  teeth: "#fff8e7",
  iris: "#ef626b",
};
type Color = keyof typeof color;
const ink = inkStroke(502, 0.46);
export function kidBuuSvg(): string {
  const parts: string[] = [];
  function shape(id: string, d: string, fill: Color, outline = true) {
    parts.push(
      `<path id="${id}" d="${d}" fill="${color[fill]}"${outline ? ` stroke="${color.ink}" stroke-width="${ink}"` : ""}/>`,
    );
  }
  function line(id: string, d: string, width = ink * 0.68, stroke: Color = "ink") {
    parts.push(
      `<path id="${id}" d="${d}" fill="none" stroke="${color[stroke]}" stroke-width="${width}"/>`,
    );
  }

  // Feet extend beyond the loose trousers; neither foot is cropped out of the canvas.
  shape(
    "left-boot",
    "M99 765 Q130 779 151 805 L120 848 Q88 879 58 896 Q29 922 7 910 Q1 900 13 880 L63 804Z",
    "dark",
  );
  shape(
    "left-boot-gold",
    "M60 811 Q80 830 113 839 L93 863 Q68 884 44 898 Q20 914 8 909 L20 884 Q49 863 60 811Z",
    "gold",
  );
  shape("left-boot-glint", "M27 887 Q59 873 76 854 L62 877 Q39 898 18 903Z", "goldLight", false);
  shape(
    "right-boot",
    "M366 767 Q395 761 423 786 L444 841 Q460 865 488 898 Q505 918 491 927 Q473 934 447 918 L387 874 Q369 845 355 812Z",
    "dark",
  );
  shape(
    "right-boot-gold",
    "M411 822 Q425 837 443 842 Q456 867 485 898 Q500 914 491 920 Q475 926 454 908 L409 871 Q410 848 411 822Z",
    "gold",
  );
  shape(
    "right-boot-glint",
    "M432 854 Q457 887 485 907 Q472 907 455 891 L433 873Z",
    "goldLight",
    false,
  );

  const trousers =
    "M200 477 Q243 499 289 479 L330 465 Q350 497 357 539 Q395 573 414 625 Q437 662 451 698 Q463 733 442 762 Q429 787 410 795 Q379 803 352 780 L313 730 Q286 695 267 658 Q251 681 241 717 Q228 756 198 781 Q172 806 140 799 Q102 799 77 777 Q48 757 39 722 Q28 693 51 663 Q76 631 92 594 Q104 548 142 516Z";
  shape("trousers", trousers, "cloth");
  parts.push(
    `<defs><clipPath id="cloth-clip"><path d="${trousers}"/></clipPath></defs><g clip-path="url(#cloth-clip)">`,
  );
  shape(
    "cloth-left-shadow",
    "M187 472 Q163 521 150 578 Q130 610 121 653 Q96 699 105 741 Q111 772 146 806 L127 835 L65 782 L59 690 L103 568 L124 507Z",
    "clothShade",
    false,
  );
  shape(
    "cloth-left-depth",
    "M154 545 Q145 594 128 634 Q135 674 116 711 Q127 687 150 658 Q158 617 160 581Z",
    "clothDeep",
    false,
  );
  shape(
    "cloth-crotch-shadow",
    "M243 476 Q253 536 275 569 Q281 600 267 627 L231 698 Q244 644 235 609 Q224 573 231 539Z",
    "clothShade",
    false,
  );
  shape(
    "cloth-right-shadow",
    "M301 473 Q323 522 325 566 Q348 592 362 646 Q369 707 401 742 Q420 769 407 817 L440 826 L467 763 L441 655 L399 573Z",
    "clothShade",
    false,
  );
  shape(
    "cloth-right-depth",
    "M349 591 Q351 645 378 694 L365 676 Q349 654 340 623Z",
    "clothDeep",
    false,
  );
  shape(
    "cloth-cuff-left",
    "M99 772 Q125 796 153 802 L189 786 L176 814 L131 835 L97 808Z",
    "clothDeep",
    false,
  );
  shape(
    "cloth-cuff-right",
    "M351 780 Q387 808 421 792 L416 823 L378 832 L351 808Z",
    "clothDeep",
    false,
  );
  parts.push("</g>");
  for (const [index, d] of [
    "M199 482 Q179 520 173 550",
    "M218 492 Q211 548 221 580",
    "M159 592 Q151 620 152 645",
    "M121 670 Q107 711 115 739",
    "M179 686 Q164 722 142 742",
    "M290 497 Q303 541 306 570",
    "M314 597 Q326 641 339 668",
    "M378 707 Q394 734 397 759",
    "M218 716 Q209 746 193 765",
  ].entries())
    line(`cloth-fold-${index}`, d);

  // The low arm hangs diagonally; the other fist projects towards the viewer.
  shape(
    "low-arm",
    "M221 231 Q183 225 156 257 Q142 270 141 291 Q124 311 124 335 Q113 355 111 375 L91 416 Q79 433 76 457 L122 486 Q143 449 157 414 L181 362 Q204 333 219 300Z",
    "skin",
  );
  shape(
    "low-arm-shadow",
    "M187 257 Q169 285 160 329 L132 401 Q118 428 112 463 L123 477 Q146 441 160 402 L189 342 Q203 321 208 291Z",
    "skinShade",
    false,
  );
  shape(
    "low-arm-light",
    "M164 280 Q146 313 137 338 L114 385 Q132 366 145 345 L166 302Z",
    "skinLight",
    false,
  );
  line("low-deltoid", "M173 264 Q189 268 197 286 Q199 301 188 315");
  line("low-biceps", "M145 332 Q153 347 166 345 M127 380 Q140 391 151 386");
  shape("low-wrist", "M89 428 Q109 433 132 449 L111 494 Q86 499 61 474Z", "dark");
  shape("low-wrist-gold", "M63 462 Q84 480 115 481 L111 495 Q79 499 58 478Z", "gold");
  shape(
    "low-hand",
    "M66 480 Q86 494 108 494 L101 516 Q107 528 96 540 Q90 554 76 551 Q62 563 49 553 Q34 558 25 545 Q13 540 16 526 Q12 511 26 503 L42 491Z",
    "skin",
  );
  shape(
    "low-hand-light",
    "M37 508 Q49 498 60 501 L80 513 L68 538 L39 537 L27 528Z",
    "skinLight",
    false,
  );
  line(
    "low-hand-knuckles",
    "M36 509 L49 519 L44 537 M56 502 L69 514 L61 541 M80 506 L90 517 L81 538 M28 537 L37 545 M50 544 L57 551",
  );

  const torso =
    "M233 232 Q209 233 193 255 Q183 278 193 306 L209 344 Q212 388 207 438 L197 460 Q221 489 266 487 Q300 483 323 459 L312 417 Q307 365 333 313 Q355 288 353 260 Q349 232 323 218 L285 223Z";
  shape("torso", torso, "skin");
  parts.push(
    `<defs><clipPath id="torso-clip"><path d="${torso}"/></clipPath></defs><g clip-path="url(#torso-clip)">`,
  );
  shape(
    "torso-side-shadow",
    "M204 244 Q193 268 213 302 Q224 329 223 361 Q235 390 219 432 L203 450 L178 377 L171 287Z",
    "skinShade",
    false,
  );
  shape(
    "torso-right-shadow",
    "M315 240 Q331 258 320 286 Q300 307 299 342 Q289 378 302 419 L316 448 L345 393 L365 273Z",
    "skinShade",
    false,
  );
  shape(
    "chest-left-light",
    "M218 256 Q239 246 255 258 L265 286 Q246 305 220 291 Q208 277 218 256Z",
    "skinLight",
    false,
  );
  shape(
    "chest-right-light",
    "M278 252 Q301 239 315 249 Q326 266 312 283 L284 290 L273 276Z",
    "skinLight",
    false,
  );
  shape(
    "abdomen-light",
    "M252 308 Q268 303 280 313 L278 336 L255 340 L247 326Z",
    "skinLight",
    false,
  );
  shape("abdomen-side-light", "M251 352 L273 351 L279 371 L269 388 L248 380Z", "skinLight", false);
  parts.push("</g>");
  line("sternum", "M265 248 Q272 267 267 287 L271 302");
  line("pectorals", "M215 292 Q241 304 266 290 Q291 302 316 285");
  line(
    "abdominal-muscles",
    "M242 316 Q258 309 273 315 M248 343 Q265 338 281 345 M244 373 Q260 381 277 373 M253 405 Q260 417 266 405 M245 433 Q266 438 283 430",
  );
  line("left-ribs", "M209 320 L223 329 M212 341 L228 350 M214 364 L230 371");
  line("right-ribs", "M304 318 L292 329 M301 341 L286 351 M301 365 L286 375");

  parts.push('<g transform="translate(0 28)">');
  shape("belt", "M205 414 Q258 435 317 415 L328 446 Q269 481 192 446Z", "dark");
  shape("belt-buckle", "M241 430 Q262 438 283 430 L291 460 Q267 474 238 461Z", "gold");
  // The emblem is geometry, never a font-dependent letter or embedded graphic.
  shape(
    "majin-emblem",
    "M247 440 L253 442 L263 454 L271 442 L279 440 L279 459 L273 461 L273 450 L264 461 L254 450 L253 460 L247 458Z",
    "ink",
    false,
  );
  parts.push("</g>");

  shape("neck", "M251 213 L293 202 L315 238 Q291 257 266 245 L245 232Z", "skinShade");
  shape(
    "head",
    "M214 160 Q191 175 195 206 Q197 230 222 247 Q247 270 277 271 Q302 267 317 248 Q334 229 333 200 Q327 176 305 164 L267 149Z",
    "skin",
  );
  shape(
    "head-side-shadow",
    "M203 179 Q198 204 219 219 L234 241 Q253 259 277 261 Q251 276 227 254 Q202 237 195 211Z",
    "skinShade",
    false,
  );
  shape(
    "head-light",
    "M250 173 Q277 157 302 177 L310 194 Q283 197 267 211 L250 207Z",
    "skinLight",
    false,
  );
  shape(
    "head-tentacle",
    "M237 184 Q213 164 229 117 Q244 74 274 32 Q298 3 322 8 Q348 6 353 30 Q358 49 343 84 Q338 95 329 88 Q325 84 329 72 L337 47 Q340 30 329 28 Q317 28 310 52 Q300 93 286 125 Q274 158 269 183 Q250 194 237 184Z",
    "skin",
  );
  shape(
    "tentacle-shadow",
    "M329 14 Q346 21 343 39 Q339 63 333 79 L333 87 Q344 67 347 41 Q350 22 338 15Z M313 43 Q310 83 287 126 Q271 158 267 180 L250 183 Q254 146 276 113 Q301 76 310 46Z",
    "skinShade",
    false,
  );
  shape(
    "tentacle-light",
    "M289 27 Q306 11 318 17 Q295 40 279 75 Q255 112 247 150 Q239 155 237 141 Q245 101 269 64Z",
    "skinLight",
    false,
  );
  line("tentacle-contour", "M247 169 Q254 133 274 106 Q296 73 304 52");
  shape("left-eye", "M223 211 L261 220 L256 226 Q237 225 223 211Z", "ink");
  shape("right-eye", "M279 219 L315 204 L306 220 L281 228Z", "ink");
  shape("left-iris", "M249 218 L253 219 L252 224 L249 223Z", "iris", false);
  shape("right-iris", "M288 218 L291 217 L291 224 L288 225Z", "iris", false);
  line("brow", "M233 204 Q252 212 268 211 M278 210 Q300 199 317 195", ink);
  line("nose", "M273 223 L269 235 L278 235");
  shape("mouth", "M250 240 Q273 249 300 234 Q295 257 279 261 Q262 260 250 240Z", "mouth");
  shape("upper-teeth", "M254 242 Q276 249 296 237 L291 245 Q275 254 259 248Z", "teeth", false);
  line("cheek-lines", "M237 233 L245 235 M303 231 L310 227 M257 257 Q265 266 275 266");
  for (const [index, [x, y, radius]] of [
    [229, 190, 2.2],
    [235, 176, 2.3],
    [303, 184, 2],
    [311, 176, 2],
    [278, 173, 1.8],
  ].entries()) {
    const d = arcs(
      [
        [x - radius, y],
        [x, y - radius],
        [x + radius, y],
        [x, y + radius],
      ],
      [radius * 0.41],
      true,
    );
    shape(`head-pore-${index}`, d, "skinDeep", false);
  }

  shape(
    "raised-arm",
    "M322 229 Q339 197 369 199 Q391 197 406 218 L421 247 Q420 267 401 281 Q378 293 355 277 L337 264Z",
    "skin",
  );
  shape(
    "raised-arm-shadow",
    "M333 246 Q355 229 373 238 Q393 256 411 251 Q408 279 384 281 Q357 277 333 256Z",
    "skinShade",
    false,
  );
  shape(
    "raised-arm-light",
    "M347 214 Q368 202 384 217 L391 234 Q374 229 363 235 L347 230Z",
    "skinLight",
    false,
  );
  shape("raised-wrist", "M369 203 Q388 198 404 209 L419 238 L395 258 L373 239Z", "dark");
  shape(
    "raised-wrist-gold",
    "M382 198 Q397 198 408 212 L422 234 L414 242 Q399 222 385 220Z",
    "gold",
  );
  shape(
    "raised-fist",
    "M329 194 Q331 177 348 176 Q362 166 372 176 Q388 170 397 183 Q411 185 411 199 Q424 210 414 225 L399 240 Q385 249 374 238 L354 231 Q332 229 330 214Z",
    "skin",
  );
  shape(
    "raised-fist-light",
    "M340 190 Q349 182 360 189 L369 201 Q387 193 398 206 L398 223 Q385 234 374 222 L354 217 L339 213Z",
    "skinLight",
    false,
  );
  line(
    "raised-knuckles",
    "M349 180 L359 197 L354 215 M372 178 L382 194 L379 204 M397 187 L402 199 M332 213 L345 220 M366 220 L373 231",
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="939" viewBox="0 0 512 939" role="img" aria-labelledby="kid-buu-full-title kid-buu-full-desc"><title id="kid-buu-full-title">Kid Buu — original measured vector illustration</title><desc id="kid-buu-full-desc">Complete stylized figure constructed from inspected FighterZ reference proportions. Original vector artwork; not an official game illustration or automatic trace.</desc><g stroke-linecap="round" stroke-linejoin="round">${parts.join("\n")}</g></svg>\n`;
}

if (import.meta.main) {
  const source = await Bun.file(reference).bytes();
  if (Bun.CryptoHasher.hash("sha256", source, "hex") !== referenceSha)
    throw new Error("Kid Buu reference changed");
  const image = new Bun.Image(source) as Bun.Image & {
    rgba(): Promise<{ width: number; height: number; channels: number; data: Uint8Array }>;
  };
  if (typeof image.rgba !== "function") throw new Error("Qualified native RGBA decoding required");
  const decoded = await image.rgba();
  if (decoded.width !== 512 || decoded.height !== 939 || decoded.channels !== 4)
    throw new Error("Unexpected reference dimensions");
  const sampled = Object.fromEntries(
    Object.entries(samples).map(([name, [x, y]]) => {
      const offset = (y * decoded.width + x) * 4;
      return [name, { x, y, rgba: Array.from(decoded.data.slice(offset, offset + 4)) }];
    }),
  );
  const output = resolve(root, "packages/ui/assets/wiki-mascots/kid-buu-full.svg");
  const svg = kidBuuSvg();
  if (Bun.argv.includes("--check")) {
    if ((await Bun.file(output).text()) !== svg) throw new Error("Kid Buu SVG drift");
    console.log(JSON.stringify({ status: "checked", output }));
  } else {
    await mkdir(dirname(output), { recursive: true });
    await Bun.write(output, svg);
    const report = resolve(
      root,
      "var/reports/wiki-scene-20261103/kid-buu-svg/reference-measurements.json",
    );
    await mkdir(dirname(report), { recursive: true });
    await Bun.write(
      report,
      JSON.stringify(
        {
          reference: {
            path: "apps/site/public/wiki-scene/kid-buu-fighterz.png",
            sha256: referenceSha,
            width: 512,
            height: 939,
            sourceUrl: "https://dba.bn-ent.net/character/images/majinBoo/portrait.png",
          },
          method:
            "Visual anchor estimates and direct pixel probes; hand-authored cubic contours, no automatic tracing.",
          estimatedAnchors: {
            head: [277, 211],
            raisedFist: [373, 207],
            lowFist: [62, 524],
            belt: [265, 473],
            crotch: [267, 658],
            leftFoot: [57, 882],
            rightFoot: [464, 899],
          },
          sampled,
          authoredPalette: color,
          inkWidth: ink,
          outputSha256: Bun.CryptoHasher.hash("sha256", svg, "hex"),
          paths: svg.match(/<path\b/g)?.length,
          qualification:
            "Rendered comparison inspected at 512/256/160/85/32/16 widths. Original stylized anatomy differs from FighterZ; faithful raster remains the portal mascot.",
        },
        null,
        2,
      ) + "\n",
    );
    console.log(JSON.stringify({ output, report, paths: svg.match(/<path\b/g)?.length }));
  }
}
