// SPDX-License-Identifier: Apache-2.0
/** Original hand-constructed drawing measured from the inspected Toei Kai full-body reference.
 * Paths are authored by anatomical part; no raster tracing, segmentation or bitmap embedding.
 */
import { arcs, inkStroke, meche, type Point } from "../../../packages/ui/src/toriyama-svg/geometry";

export const GOKU_REFERENCE = {
  path: "apps/site/public/wiki-scene/goku-kai.png",
  sourceUrl: "https://www.toei-anim.co.jp/tv/dragon_kai/character/img/1/imgChara.png",
  sourcePage: "https://www.toei-anim.co.jp/tv/dragon_kai/character/",
  sha256: "addd845e503d035ae52288a5fab68a4a481840a01c92b6cf868f36a0a28f53c0",
  width: 326,
  height: 590,
  opaqueBounds: { left: 36, top: 4, right: 211, bottom: 585 },
} as const;

/** Source pixel-frequency samples, not the unmeasured legacy Goku palette. */
export const GOKU_COLOURS = {
  ink: "#101112",
  hair: "#000000",
  hairEdge: "#292b2c",
  skin: "#ffdece",
  skinShade: "#e9a590",
  skinLight: "#fffefe",
  orange: "#ff6708",
  orangeShade: "#aa4d06",
  orangeDeep: "#643404",
  orangeLight: "#ffac76",
  blue: "#18376a",
  blueDeep: "#071b38",
  belt: "#212e6b",
  beltLight: "#3e54b6",
  trim: "#9a331b",
  gold: "#efbc35",
  goldLight: "#ffe276",
  white: "#fffefe",
} as const;
const C = GOKU_COLOURS;
const stroke = inkStroke(176, 0.6);
const shape = (d: string, fill: string, width = stroke, edge: string = C.ink) =>
  `<path d="${d}" fill="${fill}" stroke="${edge}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
const patch = (d: string, fill: string) => `<path d="${d}" fill="${fill}"/>`;
const line = (d: string, width = 0.65, colour: string = C.ink) =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const group = (id: string, paths: string[]) => `<g id="goku-${id}">${paths.join("")}</g>`;

/** Original anatomical construction in the 326x590 source coordinate system. */
export function gokuSvg(): string {
  const parts: string[] = [];

  parts.push(
    group("boots", [
      shape(
        "M68 475L105 476Q111 486 110 500L106 521L104 546L79 553L59 559L38 555Q43 545 57 537L64 525L66 501Z",
        C.blueDeep,
      ),
      patch("M73 481L96 480Q102 495 98 509L91 520L69 526L66 518L69 494Z", C.blue),
      patch("M67 527L88 525L74 543L59 554L43 553L56 539Z", C.blue),
      shape("M69 478L73 479L71 521L67 524Z", C.trim, 0.6),
      shape(
        "M64 530L67 532L48 550L43 554L102 543L104 546L79 554L58 559L38 555L41 550Z",
        C.trim,
        0.7,
      ),
      line("M56 538L62 539M58 541L65 543M51 551L57 551M103 526L102 537", 0.8),
      shape(
        "M145 486L175 476Q181 490 183 510L183 530L187 548L192 568L187 580L180 586L161 574Q155 566 153 552L149 537Q142 529 141 516Z",
        C.blueDeep,
      ),
      patch("M148 491L160 487L167 519L164 529L150 531L144 520L144 507Z", C.blue),
      patch("M153 535L164 534L173 561L179 579L163 569L157 557Z", C.blue),
      shape("M160 485L164 483L171 524L168 531Z", C.trim, 0.65),
      shape(
        "M168 535L172 533L179 563L182 580L188 569L191 566L190 576L180 586L160 574L155 565L165 575L178 582Z",
        C.trim,
        0.6,
      ),
      line(
        "M150 526Q155 527 162 525M171 523L181 521M157 548L166 543M173 545L182 546M160 555L166 551",
        0.8,
      ),
    ]),
  );

  parts.push(
    group("left-arm", [
      shape("M53 184Q48 194 48 207L48 219Q50 226 57 228L64 226Q69 219 66 208L60 188Z", C.skin),
      patch("M56 190L52 203L52 216L56 225L60 227L65 222L64 209Z", C.skinShade),
      patch("M51 194L49 208L50 217L52 217L55 193Z", C.skinLight),
      line("M55 192L52 211M53 224L60 226M61 224L60 234", 0.65),
      shape(
        "M53 225Q47 238 45 251Q44 259 48 272L50 278L63 281Q65 267 67 252L66 234L62 226Z",
        C.skin,
      ),
      patch("M58 229Q53 241 54 253L58 272L62 278L65 263L66 240Z", C.skinShade),
      patch("M50 233L46 250L48 263L51 271L51 250L54 233Z", C.skinLight),
      shape("M49 271Q56 274 65 273L63 291Q55 293 48 289L50 283Z", C.blue),
      patch("M49 273L53 274L53 287L49 287Z", C.beltLight),
      line("M49 287Q56 290 63 288", 0.6),
      shape("M49 290L63 292L65 301L62 318L58 323L53 318L46 315L46 307Z", C.skin),
      patch("M60 294L64 300L61 316L57 320L54 315L58 304Z", C.skinShade),
      line("M50 306L54 303L57 309L55 316M48 313L51 309M60 310L58 320", 0.7),
    ]),
  );

  parts.push(
    group("trousers", [
      shape(
        "M77 246L143 245Q153 251 156 268L156 295L162 325L171 360L176 379L174 391Q182 411 183 429L188 451L187 462L179 475L162 484L147 493L138 487L125 474L119 463Q119 471 110 476L98 481L71 482L62 476L57 466L59 452L57 439L60 417L56 398L59 370L65 338L62 322L64 295L69 267Z",
        C.orangeShade,
      ),
      patch(
        "M77 250L88 251Q80 270 79 291L80 316L85 337L80 359L80 383L83 403L81 425L74 445L67 454L62 443L64 425L68 418L60 397L62 374L68 336L65 322L67 294L72 268Z",
        C.orange,
      ),
      patch(
        "M113 250L132 250L139 263L140 250Q151 253 154 270L154 297L161 326L168 353L174 378L162 401L146 418L132 412L123 394L115 368L108 338L106 305L110 273Z",
        C.orange,
      ),
      patch(
        "M82 257L78 276L77 296L82 320L87 336L79 375L87 355L90 340L95 355L101 377L106 407L106 431L116 459L119 463L113 436L113 410L109 382L103 356L96 331L88 311L84 288L86 266Z",
        C.orangeDeep,
      ),
      patch("M173 390L176 403L170 427L159 447L149 457L143 462L153 437L162 416Z", C.orange),
      patch("M181 428L185 447L181 462L166 474L153 484L146 490L154 472L166 453L174 443Z", C.orange),
      patch("M60 449L67 460L77 465L87 454L97 438L91 459L83 475L74 480L65 474L59 465Z", C.orange),
      patch("M96 460L105 466L114 466L109 473L99 478L85 479Z", C.orangeDeep),
      patch("M118 408L128 420L137 425L149 417L135 429L127 426Z", C.orangeDeep),
      patch("M119 430L129 448L141 461L149 451L142 467L133 477L127 467Z", C.orangeDeep),
      line(
        "M88 253Q79 279 82 301L89 319L83 335M93 257L91 271M106 254L103 266M117 252L122 269L120 255M132 252L129 262",
        0.75,
      ),
      line(
        "M90 322L97 346L104 365M96 343L94 369L104 397M101 376L102 413L108 430M106 409L119 438M92 352L86 374L88 359M87 370L86 395M82 395L78 414M65 408L69 421",
        0.8,
      ),
      line(
        "M62 434L67 449L77 437M69 454L78 464L87 449M81 476L96 464M108 457L112 467M155 341L155 387Q153 406 140 419Q134 423 126 412",
        0.9,
      ),
      line(
        "M173 399L164 423L158 437M167 417L161 447M181 434L177 454L168 468M158 463L148 480M123 427L127 446L135 459M141 480L144 486",
        0.7,
      ),
    ]),
  );

  parts.push(
    group("neck", [
      shape(
        "M111 116L140 104L145 116L150 129L162 136L146 145L127 152L93 155L92 147L104 137L108 125Z",
        C.skin,
      ),
      patch("M111 120L122 130L137 114L133 134L122 144L114 146L109 136Z", C.skinShade),
      patch("M143 114L148 129L155 135L143 138L142 127Z", C.skinLight),
      patch("M100 141L105 141L100 150L94 151Z", C.skinLight),
      line(
        "M111 124L113 139M136 117L129 135M142 115L144 128M118 142L129 138L142 141M105 140L111 141",
        0.7,
      ),
    ]),
  );

  parts.push(
    group("gi", [
      shape(
        "M91 135L83 139L76 143L55 151Q50 165 51 179L48 183L54 191L57 208Q62 223 74 232L141 232L157 222L164 219L174 198L190 184L208 184L211 173L207 165L210 158Q195 146 178 141L170 136L166 126L157 126L146 138L127 147L108 154L92 154L91 149L99 137L95 135Z",
        C.orangeShade,
      ),
      patch("M56 153L82 143L73 157L63 177L60 189L54 180Z", C.orange),
      patch("M57 153L78 145L74 149L59 155L54 174L54 160Z", C.orangeLight),
      patch(
        "M76 153L83 144L91 139L86 153L79 169L77 191L80 208L95 216L118 204L108 220L87 229L74 230L64 218L60 204L65 184Z",
        C.orange,
      ),
      patch("M152 138L160 128L166 129L169 137L155 142L142 154L148 143Z", C.orange),
      patch("M170 140L179 143L199 153L207 157L194 156L175 146L163 146Z", C.orange),
      patch(
        "M83 152L94 146L91 153Q104 159 127 150L147 140Q134 160 119 179L92 205L82 184L77 169Z",
        C.blueDeep,
      ),
      patch("M92 154Q107 160 133 147L123 156L106 163L95 165L85 162Z", C.blue),
      patch("M82 168L94 179L116 167L101 183L92 184L82 175Z", C.blue),
      patch("M84 181L94 193L108 181L92 200Z", C.blue),
      line("M85 160L89 166M79 171L92 187M87 194L92 203", 0.7),
      shape(
        "M192 161Q201 160 207 165L208 173L212 181L207 187L194 185L180 193L171 202L166 199L174 184L181 175Z",
        C.blueDeep,
      ),
      patch("M195 164L204 166L205 174L209 181L204 184L192 184L178 193L176 185L183 177Z", C.blue),
      line(
        "M66 158L62 180M76 155L71 178L69 193M149 150L136 174L114 197M145 167L135 188L120 202M156 158L149 177L144 188M164 163L160 183L165 197L157 217",
        0.8,
      ),
      line("M86 226L111 217M108 219L95 229M130 218L142 222M148 223L155 219", 0.8),
    ]),
  );

  parts.push(
    group("right-arm", [
      shape(
        "M183 190Q194 182 204 187L201 197L203 211L203 228L206 241L202 253L202 266L195 281L187 288L175 282L172 271L173 254L179 238Q172 231 170 221L171 202Z",
        C.skin,
      ),
      patch(
        "M183 194L177 202L176 222L180 233L181 242L177 255L177 271L181 282L175 280L173 270L174 254L180 237L173 225L173 205Z",
        C.skinShade,
      ),
      patch("M194 193L200 189L200 202L202 226L201 236L196 228L198 216L197 200Z", C.skinLight),
      patch("M185 242L181 258L181 275L186 283L191 276L190 258L185 274L183 266Z", C.skinShade),
      patch("M199 246L201 253L198 266L191 280L191 272L196 258Z", C.skinLight),
      line(
        "M184 198L183 229M176 226L180 235M199 227L202 240M186 247L184 264M191 256L187 276M179 242L176 252",
        0.75,
      ),
      shape("M174 279Q183 285 194 282L189 300L171 298L168 294Z", C.blue),
      patch("M174 282L179 284L175 297L170 295Z", C.blueDeep),
      line("M177 297L187 298", 0.6),
      shape(
        "M172 297L188 301L184 315L182 321L176 323L171 327L165 327L161 324L158 322L156 317L161 309L164 302Z",
        C.skin,
      ),
      patch(
        "M172 299L170 308L164 314L163 323L166 326L160 323L158 318L162 309L165 303Z",
        C.skinShade,
      ),
      line("M166 309L163 315L164 322M173 315L171 324M180 314L177 322M158 316L162 318", 0.75),
    ]),
  );

  parts.push(
    group("belt", [
      shape(
        arcs(
          [
            [75, 228],
            [95, 232],
            [121, 229],
            [143, 226],
            [148, 231],
            [145, 237],
            [148, 242],
            [145, 250],
            [122, 251],
            [98, 252],
            [76, 250],
            [72, 245],
            [75, 241],
            [72, 237],
          ] as readonly Point[],
          [1.1, 1, -1, 1, 1, -1, 1, 1, 1, 1, 1, -1, 1, -1],
        ),
        C.belt,
        0.85,
      ),
      patch("M75 232L95 235L118 232L143 229L140 234L119 239L96 239L76 237Z", C.blueDeep),
      patch("M77 239L96 242L119 236L140 235L132 240L107 246L78 247L75 244Z", C.blue),
      patch(
        "M77 231L82 233L80 238L75 237ZM75 241L81 242L80 246L75 245ZM78 247L84 248L82 251L77 250Z",
        C.beltLight,
      ),
      patch("M101 246L132 240L144 240L140 244L124 245L105 250L91 251Z", C.blueDeep),
      line(
        "M80 237L99 238L124 232M79 242L92 243M111 239L132 236M84 249L110 243M116 248L140 246",
        0.65,
      ),
    ]),
  );

  parts.push(
    group("face", [
      shape(
        "M103 76L121 66L137 73L144 84Q151 81 152 90L149 101L143 108L141 116L128 125L117 129L109 125L102 120L99 111L95 99L96 86Z",
        C.skin,
        0.8,
      ),
      patch("M104 78L115 71L108 88L102 98L101 110L106 122L101 117L97 101L97 89Z", C.skinShade),
      patch("M138 101L143 102L140 114L127 125L117 128L111 125L119 123L130 117Z", C.skinShade),
      patch("M116 78L126 74L130 78L121 85L113 91L110 89Z", C.skinLight),
      patch("M143 88L148 85L150 89L148 98L144 103L141 103L143 98Z", C.skinShade),
      line("M144 90Q149 85 148 92L145 96L146 91L144 94M142 98L144 97", 0.65),
      shape("M100 93L104 95L109 104L104 106L101 101Z", C.white, 0.6),
      shape("M116 96L130 88L131 101L121 104L117 102Z", C.white, 0.6),
      patch("M103 96L105 96L107 102L105 103L103 100Z", C.hair),
      patch("M122 93L125 92L126 99L123 100L122 98Z", C.hair),
      patch("M100 93L103 94L108 100L105 99L102 96Z", C.hair),
      patch("M115 94L129 85L132 85L130 88L117 96Z", C.hair),
      line(
        "M110 102L107 109L111 108M110 110L113 111L115 110M116 114L121 114L119 116L116 116M116 121L119 122",
        0.65,
      ),
      line("M101 107L104 109M103 111L105 112M121 105L130 104", 0.5),
    ]),
  );

  parts.push(
    group("hair", [
      shape(
        "M99 6Q124 14 130 31L134 46Q146 51 151 65L173 54L156 66L194 61L165 76L199 73L167 92L173 94L144 108L144 99L148 90Q148 83 143 85L137 90L132 92L135 84L129 79L123 75L113 84L109 91L110 80L114 69L104 82L99 94L94 89L95 101L87 102L68 105L79 94L83 92L62 88L43 88Q57 69 77 67Q68 44 47 32Q74 23 86 26L96 30L105 40Z",
        C.hair,
        0.9,
        C.hairEdge,
      ),
      patch(
        "M49 32Q68 25 85 26L94 30L86 28L74 29L58 33Q71 42 79 62L78 66L74 58Q66 42 49 32Z",
        C.hairEdge,
      ),
      patch("M100 8Q122 16 129 32L131 43L126 30Q120 19 103 12L106 33Z", C.hairEdge),
      patch("M46 86Q59 71 75 70L70 74L62 76L53 83L68 83L78 88L63 87Z", C.hairEdge),
      patch("M90 65Q84 79 90 90L96 96L90 91Q81 81 90 65Z", C.hairEdge),
      patch(meche([111, 83], [119, 64], 6, 0.06), C.hairEdge),
      line("M78 63Q61 55 40 59", 0.8, C.hairEdge),
      line("M154 64L173 54", 0.8, C.hairEdge),
    ]),
  );

  parts.push(
    group("laces", [
      shape("M61 519Q77 527 106 520L106 523Q79 531 61 523Z", C.gold, 0.55),
      shape(
        "M65 522Q58 517 57 523L56 527L61 525L66 523Q64 532 60 531L62 526L66 523L71 531L74 530L70 524Z",
        C.gold,
        0.55,
      ),
      line("M59 522L63 522M67 524L69 529M71 526L75 524M77 526L80 527", 0.5, C.goldLight),
      shape("M148 527Q162 534 184 526L184 529Q166 537 149 530Z", C.gold, 0.55),
      shape(
        "M168 532L165 533Q160 536 160 541L163 539L168 534L166 542L170 538L170 533Q176 535 178 540L181 539Q181 533 172 531Z",
        C.gold,
        0.55,
      ),
      line("M151 530L157 531M164 536L162 539M174 534L177 538", 0.5, C.goldLight),
    ]),
  );

  const metadata = JSON.stringify({
    kind: "original-stylized-vector",
    officialIllustration: false,
    source: GOKU_REFERENCE,
    construction: "manually authored anatomical closed paths; no automatic vectorization or bitmap",
    geometryOwner: "packages/ui/src/toriyama-svg/geometry.ts",
  })
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="28 0 192 592" width="192" height="592" role="img" aria-labelledby="goku-full-title goku-full-description"><title id="goku-full-title">Son Goku</title><desc id="goku-full-description">Original stylized full-body vector drawing informed by the inspected Toei Kai reference; not an official illustration.</desc><metadata>${metadata}</metadata>${parts.join("")}</svg>\n`;
}

if (import.meta.main) {
  const output = new URL("../../../packages/ui/assets/wiki-mascots/goku-full.svg", import.meta.url);
  const svg = gokuSvg();
  await Bun.write(output, svg);
  console.log(
    JSON.stringify({
      output: output.pathname,
      bytes: new TextEncoder().encode(svg).length,
      paths: (svg.match(/<path\b/g) ?? []).length,
      images: 0,
    }),
  );
}
