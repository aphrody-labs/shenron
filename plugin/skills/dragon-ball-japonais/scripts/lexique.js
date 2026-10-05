// @bun
// Généré par scripts/plugin/build-references.ts — ne pas éditer.
// Sources : packages/lexicon/src/fold.ts, packages/lexicon/src/index.ts, packages/lexicon/src/lexicon.ts, packages/lexicon/src/mask.ts, packages/lexicon/src/types.ts, scripts/plugin/src/lexique.ts
// Révision : 11f7dbc (2026-10-05)
// scripts/plugin/src/lexique.ts
import { join } from "path";

// packages/lexicon/src/types.ts
var LANGS = ["ja", "fr", "en"];
var KINDS = [
  "character",
  "technique",
  "transformation",
  "race",
  "place",
  "item",
  "event",
  "title",
  "saga",
  "arc",
  "organization",
  "other"
];
var LEGACY_KIND = {
  character: "personnage",
  technique: "technique",
  transformation: "transformation",
  race: "race",
  place: "planete",
  item: "autre",
  event: "autre",
  title: "autre",
  saga: "saga",
  arc: "arc",
  organization: "autre",
  other: "autre"
};
// packages/lexicon/src/fold.ts
var ACCENTED = "\xE0\xE1\xE2\xE3\xE4\xE5\xE7\xE8\xE9\xEA\xEB\xEC\xED\xEE\xEF\xF1\xF2\xF3\xF4\xF5\xF6\xF9\xFA\xFB\xFC\xFD\xFF\u0101\u0103\u0105\u0107\u0109\u010B\u010D\u010F\u0113\u0115\u0117\u0119\u011B\u011D\u011F\u0121\u0123\u0125\u0129\u012B\u012D\u012F\u0135\u0137\u013A\u013C\u013E\u0144\u0146\u0148\u014D\u014F\u0151\u0155\u0157\u0159\u015B\u015D\u015F\u0161\u0163\u0165\u0169\u016B\u016D\u016F\u0171\u0173\u0175\u0177\u017A\u017C\u017E";
var BASE = "aaaaaaceeeeiiiinooooouuuuyyaaaccccdeeeeegggghiiiijklllnnnooorrrssssttuuuuuuwyzzz";
var BASE_OF = new Map([...ACCENTED].map((c, index) => [c, BASE[index]]));
var ALPHANUMERIC = /^[\p{Alphabetic}\p{N}]$/u;
function foldChar(c) {
  let out = "";
  for (const lower of c.toLowerCase()) {
    const code = lower.codePointAt(0);
    if (code >= 768 && code <= 879)
      continue;
    out += BASE_OF.get(lower) ?? lower;
  }
  return out;
}
function fold(text) {
  let out = "";
  for (const raw of text) {
    let code = raw.codePointAt(0);
    if (code >= 65281 && code <= 65374)
      code -= 65248;
    else if (code === 12288)
      code = 32;
    for (const c of foldChar(String.fromCodePoint(code))) {
      let point = c.codePointAt(0);
      if (point >= 12449 && point <= 12534)
        point -= 96;
      const folded = String.fromCodePoint(point);
      if (ALPHANUMERIC.test(folded))
        out += folded;
    }
  }
  return out;
}
function codePoints(text) {
  let n = 0;
  for (const _ of text)
    n++;
  return n;
}

// packages/lexicon/src/mask.ts
var DEFAULT_TOKEN_PREFIX = "Zeta";
var DEFAULT_TOKEN_WIDTH = 3;
function charClass(c) {
  if (c === undefined)
    return null;
  const code = c.codePointAt(0);
  if (code >= 12449 && code <= 12538 || code >= 12540 && code <= 12543 || code >= 12784 && code <= 12799 || code >= 65382 && code <= 65439)
    return "katakana";
  if (code >= 48 && code <= 57 || code >= 65 && code <= 90 || code >= 97 && code <= 122 || code >= 192 && code <= 591)
    return "latin";
  return null;
}
function wordEdges(chars, start, end) {
  const first = charClass(chars[start]);
  if (first && start > 0 && charClass(chars[start - 1]) === first)
    return false;
  const last = charClass(chars[end - 1]);
  if (last && charClass(chars[end]) === last)
    return false;
  return true;
}
function sameChars(chars, at, source) {
  if (at + source.length > chars.length)
    return false;
  for (let k = 0;k < source.length; k++)
    if (chars[at + k] !== source[k])
      return false;
  return true;
}
function patterns(entries) {
  const byInitial = new Map;
  entries.forEach((entry, index) => {
    if (!entry.target)
      return;
    for (const source of entry.sources) {
      const chars = [...source];
      if (chars.length < 2)
        continue;
      const list = byInitial.get(chars[0]) ?? [];
      list.push([chars, source, index]);
      byInitial.set(chars[0], list);
    }
  });
  return byInitial;
}
function findOccurrences(text, entries) {
  return occurrencesIn([...text], entries);
}
function occurrencesIn(chars, entries) {
  const byInitial = patterns(entries);
  const candidates = [];
  chars.forEach((initial, start) => {
    for (const [source, spelling, index] of byInitial.get(initial) ?? []) {
      const end = start + source.length;
      if (sameChars(chars, start, source) && wordEdges(chars, start, end)) {
        candidates.push({ start, end, source: spelling, index, entry: entries[index] });
      }
    }
  });
  const ordered = candidates.toSorted((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const taken = new Uint8Array(chars.length);
  const kept = [];
  for (const candidate of ordered) {
    let free = true;
    for (let k = candidate.start;k < candidate.end; k++) {
      if (taken[k]) {
        free = false;
        break;
      }
    }
    if (!free)
      continue;
    taken.fill(1, candidate.start, candidate.end);
    kept.push(candidate);
  }
  return kept.toSorted((a, b) => a.start - b.start);
}
function width(options) {
  const value = options.width ?? DEFAULT_TOKEN_WIDTH;
  return Math.min(9, Math.max(1, Math.trunc(value)));
}
function prefix(options) {
  return options.prefix || DEFAULT_TOKEN_PREFIX;
}
function tokenOf(n, options = {}) {
  return `${prefix(options)}${String(n).padStart(width(options), "0")}`;
}
function maskText(text, entries, options = {}) {
  const ceiling = 10 ** width(options) - 1;
  const max = Math.min(options.maxTokens ?? ceiling, ceiling);
  const chars = [...text];
  const tokens = [];
  const slotOf = new Map;
  let overflow = 0;
  let out = "";
  let cursor = 0;
  for (const occurrence of occurrencesIn(chars, entries)) {
    let slot = slotOf.get(occurrence.index);
    if (slot === undefined) {
      if (tokens.length >= max) {
        slot = null;
        overflow++;
      } else {
        slot = tokens.length;
        tokens.push({
          token: tokenOf(slot + 1, options),
          number: slot + 1,
          target: occurrence.entry.target,
          index: occurrence.index,
          entry: occurrence.entry
        });
      }
      slotOf.set(occurrence.index, slot);
    }
    if (slot === null)
      continue;
    out += chars.slice(cursor, occurrence.start).join("") + tokens[slot].token;
    cursor = occurrence.end;
  }
  out += chars.slice(cursor).join("");
  return { text: out, tokens, overflow };
}
var WHITE_SPACE = /^\p{White_Space}$/u;
var isDigit = (c) => c !== undefined && c >= "0" && c <= "9";
function tokenAt(chars, start, folded, fixed) {
  let i = start;
  for (const expected of folded) {
    const c = chars[i];
    if (c === undefined || [...foldChar(c)][0] !== expected)
      return null;
    i++;
  }
  const separator = chars[i];
  if (separator !== undefined && (separator === "-" || separator === "_" || WHITE_SPACE.test(separator)))
    i++;
  const digitsStart = i;
  if (fixed !== undefined) {
    for (let k = 0;k < fixed; k++)
      if (!isDigit(chars[digitsStart + k]))
        return null;
    i = digitsStart + fixed;
  } else {
    while (isDigit(chars[i]))
      i++;
    const digits = i - digitsStart;
    if (digits < 3 || digits > 4)
      return null;
  }
  return { end: i, number: Number(chars.slice(digitsStart, i).join("")) };
}
function foldedPrefix(options) {
  return [...prefix(options)].map((c) => [...foldChar(c)][0]);
}
function scanTokens(chars, folded, fixed) {
  const found = [];
  let i = 0;
  while (i < chars.length) {
    const hit = tokenAt(chars, i, folded, fixed);
    if (hit) {
      found.push(chars.slice(i, hit.end).join(""));
      i = hit.end;
    } else
      i++;
  }
  return found;
}
var isWordChar = (c) => c !== undefined && /^[\p{Alphabetic}\p{N}]$/u.test(c);
function sameFolded(left, right) {
  return left.length === right.length && left.every((c, k) => c.toLowerCase() === right[k].toLowerCase());
}
var trimBlanksEnd = (s) => s.replace(/[ \t]+$/, "");
function endsWithWord(out, form) {
  const trimmed = [...trimBlanksEnd(out)];
  const start = trimmed.length - form.length;
  if (start < 0)
    return false;
  return sameFolded(trimmed.slice(start), form) && (start === 0 || !isWordChar(trimmed[start - 1]));
}
function startsWithWord(chars, from, form) {
  let i = from;
  while (chars[i] === " " || chars[i] === "\t")
    i++;
  if (i + form.length > chars.length)
    return false;
  return sameFolded(chars.slice(i, i + form.length), form) && !isWordChar(chars[i + form.length]);
}
function numberOf(token) {
  const match = /(\d+)$/.exec(token);
  return match ? Number(match[1]) : null;
}
function restoreTokens(translation, table, options = {}) {
  const forms = new Map;
  for (const [token, form] of table) {
    const number = numberOf(token);
    if (number !== null && !forms.has(number))
      forms.set(number, { token, form });
  }
  const folded = foldedPrefix(options);
  const fixed = options.width === undefined ? undefined : width(options);
  const chars = [...translation];
  const seen = new Set;
  let out = "";
  let i = 0;
  while (i < chars.length) {
    const hit = tokenAt(chars, i, folded, fixed);
    if (!hit) {
      out += chars[i];
      i++;
      continue;
    }
    const known = forms.get(hit.number);
    if (!known) {
      out += chars.slice(i, hit.end).join("");
      i = hit.end;
      continue;
    }
    seen.add(hit.number);
    const form = [...known.form];
    if (endsWithWord(out, form)) {
      out = trimBlanksEnd(out);
      i = hit.end;
    } else if (startsWithWord(chars, hit.end, form)) {
      i = hit.end;
      while (chars[i] === " " || chars[i] === "\t")
        i++;
    } else {
      out += known.form;
      i = hit.end;
    }
  }
  const unresolved = [...new Set(scanTokens([...out], folded, fixed))];
  const missing = [...forms].filter(([number]) => !seen.has(number)).map(([, { token }]) => token);
  return { text: out, unresolved, missing };
}
// packages/lexicon/src/lexicon.ts
var emptyCounts = () => ({ ja: 0, fr: 0, en: 0, romaji: 0 });
var SEARCH_DEFAULT_LIMIT = 20;
var SEARCH_MAX_LIMIT = 100;
var ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function validateLexicon(data) {
  const issues = [];
  const doc = data;
  if (!doc || typeof doc !== "object" || Array.isArray(doc))
    return ["not a lexicon object"];
  if (doc.version !== 1)
    issues.push(`version must be 1, got ${String(doc.version)}`);
  if (!Array.isArray(doc.terms))
    return [...issues, "terms is not an array"];
  const ids = new Set;
  const japanese = new Map;
  doc.terms.forEach((term, index) => {
    const at = `terms[${index}]${term && typeof term.id === "string" ? ` (${term.id})` : ""}`;
    if (!term || typeof term !== "object") {
      issues.push(`${at}: not an object`);
      return;
    }
    const allowed = new Set(["id", "kind", "ja", "fr", "en", "romaji", "aliases", "sources"]);
    for (const key of Object.keys(term))
      if (!allowed.has(key))
        issues.push(`${at}: unknown field ${key}`);
    if (typeof term.id !== "string" || !ID_PATTERN.test(term.id))
      issues.push(`${at}: id must be a lowercase ASCII slug`);
    else if (ids.has(term.id))
      issues.push(`${at}: duplicate id`);
    else
      ids.add(term.id);
    if (!KINDS.includes(term.kind))
      issues.push(`${at}: unknown kind ${String(term.kind)}`);
    for (const lang of LANGS) {
      const value = term[lang];
      if (typeof value !== "string")
        issues.push(`${at}: ${lang} must be a string`);
      else if (value !== value.trim())
        issues.push(`${at}: ${lang} has outer blanks`);
      else if (lang !== "en" && !value)
        issues.push(`${at}: ${lang} is empty`);
    }
    if (term.romaji !== undefined && (typeof term.romaji !== "string" || !term.romaji.trim()))
      issues.push(`${at}: romaji must be a non-empty string`);
    const spellings = [term.ja, ...term.aliases?.ja ?? []];
    if (term.aliases !== undefined) {
      if (typeof term.aliases !== "object" || term.aliases === null || Array.isArray(term.aliases))
        issues.push(`${at}: aliases must be an object`);
      else
        for (const [lang, list] of Object.entries(term.aliases)) {
          if (!LANGS.includes(lang))
            issues.push(`${at}: aliases.${lang} is not a language`);
          else if (!Array.isArray(list) || list.length === 0 || list.some((v) => typeof v !== "string" || !v.trim() || v !== v.trim()))
            issues.push(`${at}: aliases.${lang} must list trimmed non-empty strings`);
          else if (new Set(list).size !== list.length || list.includes(term[lang]))
            issues.push(`${at}: aliases.${lang} repeats a form`);
        }
    }
    for (const spelling of spellings) {
      if (typeof spelling !== "string")
        continue;
      const owner = japanese.get(spelling);
      if (owner !== undefined && owner !== term.id)
        issues.push(`${at}: Japanese spelling ${spelling} already belongs to ${owner}`);
      japanese.set(spelling, term.id);
    }
    if (term.sources !== undefined) {
      if (!Array.isArray(term.sources) || term.sources.some((s) => !s || typeof s.ref !== "string" || !s.ref.trim() || s.lang !== undefined && ![...LANGS, "romaji"].includes(s.lang)))
        issues.push(`${at}: sources must be { lang?, ref } objects`);
    }
  });
  return issues;
}

class LexiconError extends Error {
  issues;
  constructor(issues) {
    super(`invalid lexicon: ${issues.slice(0, 5).join("; ")}${issues.length > 5 ? "; \u2026" : ""}`);
    this.issues = issues;
  }
}
function formsOf(term) {
  const forms = [];
  for (const lang of LANGS)
    if (term[lang])
      forms.push({ key: fold(term[lang]), field: lang, form: term[lang], alias: false });
  if (term.romaji)
    forms.push({ key: fold(term.romaji), field: "romaji", form: term.romaji, alias: true });
  for (const lang of LANGS)
    for (const alias of term.aliases?.[lang] ?? [])
      forms.push({ key: fold(alias), field: lang, form: alias, alias: true });
  return forms.filter((form) => form.key !== "");
}
function scoreOf(form, query) {
  if (form.key === query)
    return form.alias ? 90 : 100;
  if (form.key.startsWith(query))
    return form.alias ? 60 : 70;
  if (form.key.includes(query))
    return form.alias ? 40 : 50;
  if (codePoints(form.key) >= 2 && query.includes(form.key))
    return 20;
  return 0;
}

class Lexicon {
  version;
  terms;
  #byId;
  #forms;
  constructor(data) {
    this.version = data.version;
    this.terms = data.terms;
    this.#byId = new Map(data.terms.map((term) => [term.id, term]));
    this.#forms = data.terms.map(formsOf);
  }
  static parse(data) {
    const issues = validateLexicon(data);
    if (issues.length)
      throw new LexiconError(issues);
    return new Lexicon(data);
  }
  get size() {
    return this.terms.length;
  }
  get(id) {
    return this.#byId.get(id);
  }
  resolve(idOrForm) {
    const byId = this.#byId.get(idOrForm.trim().toLowerCase());
    if (byId)
      return byId;
    const key = fold(idOrForm);
    if (!key)
      return;
    for (const pass of [false, true]) {
      for (let index = 0;index < this.terms.length; index++) {
        const hit = this.#forms[index].some((form) => form.alias === pass && form.key === key);
        if (hit)
          return this.terms[index];
      }
    }
    return;
  }
  label(term, lang) {
    const text = term[lang];
    if (text)
      return { text, lang, fallback: false };
    return { text: term.fr, lang: "fr", fallback: true };
  }
  search(query, options = {}) {
    const key = fold(query);
    if (!key)
      return [];
    const limit = Math.min(SEARCH_MAX_LIMIT, Math.max(1, Math.trunc(options.limit ?? SEARCH_DEFAULT_LIMIT)));
    const hits = [];
    this.terms.forEach((term, index) => {
      if (options.kind && term.kind !== options.kind)
        return;
      let best = null;
      for (const form of this.#forms[index]) {
        const score = scoreOf(form, key);
        if (score === 0)
          continue;
        const length = codePoints(form.key);
        if (!best || score > best.score || score === best.score && length < best.length)
          best = { term, score, field: form.field, form: form.form, alias: form.alias, length };
      }
      if (best)
        hits.push(best);
    });
    const ranked = hits.toSorted((a, b) => b.score - a.score || a.length - b.length || (a.term.id < b.term.id ? -1 : a.term.id > b.term.id ? 1 : 0));
    return ranked.slice(0, limit).map(({ length: _length, ...hit }) => hit);
  }
  maskEntries(target) {
    return this.terms.map((term) => ({
      sources: [term.ja, ...term.aliases?.ja ?? []],
      target: term[target],
      value: term
    }));
  }
  mask(text, target, options = {}) {
    return maskText(text, this.maskEntries(target), options);
  }
  legacyEntries() {
    const rows = [];
    for (const term of this.terms) {
      for (const ja of [term.ja, ...term.aliases?.ja ?? []]) {
        rows.push({ ja, fr: term.fr, kind: LEGACY_KIND[term.kind], length: codePoints(ja) });
      }
    }
    const collator = new Intl.Collator("und");
    return rows.toSorted((a, b) => b.length - a.length || collator.compare(a.ja, b.ja));
  }
  coverage() {
    const fields = [...LANGS, "romaji"];
    const coverage = { total: this.terms.length, filled: emptyCounts(), byKind: {} };
    for (const term of this.terms) {
      const kind = coverage.byKind[term.kind] ??= { total: 0, ...emptyCounts() };
      kind.total++;
      for (const field of fields) {
        if (term[field]) {
          coverage.filled[field]++;
          kind[field]++;
        }
      }
    }
    return coverage;
  }
}
// scripts/plugin/src/lexique.ts
async function chargerLexique(dossier = join(import.meta.dir, "..", "references")) {
  const brut = await Bun.file(join(dossier, "lexique-canonique.json")).json();
  const lexique = Lexicon.parse({ version: 1, terms: brut.donnees });
  return { revision: brut.revision, date: brut.date, lexique };
}
var ligne = (t) => `${t.ja}	${t.fr}	${t.en || "\u2014"}	${t.kind}`;
async function texteArgument(valeur) {
  if (valeur === "-" || valeur === undefined)
    return (await Bun.stdin.text()).trim();
  return valeur;
}
async function main(args) {
  const json = args.includes("--json");
  const cible = args.includes("--en") ? "en" : "fr";
  const reste = args.filter((a) => a !== "--json" && a !== "--en");
  const [commande, ...suite] = reste;
  const { revision, date, lexique } = await chargerLexique();
  const entete = `lexique ${lexique.size} termes \u2014 instantan\xE9 ${revision} (${date})`;
  const iTable = suite.indexOf("--table");
  const fichierTable = iTable >= 0 ? suite[iTable + 1] : undefined;
  const mots = iTable >= 0 ? suite.slice(0, iTable) : suite;
  const valeur = mots.length ? mots.join(" ") : undefined;
  if (commande === "cherche") {
    if (!valeur)
      return usage();
    const trouves = lexique.search(valeur, { limit: 30 });
    if (json)
      console.log(JSON.stringify({ revision, date, requete: valeur, resultats: trouves.map((h) => h.term) }, null, 2));
    else {
      console.log(entete);
      if (!trouves.length) {
        console.log(`aucun terme pour \xAB ${valeur} \xBB : non \xE9tabli dans le lexique (ce n'est pas une preuve de faute)`);
      }
      for (const h of trouves)
        console.log(ligne(h.term));
    }
    return 0;
  }
  if (commande === "termes") {
    const texte = await texteArgument(valeur);
    const occ = findOccurrences(texte, lexique.maskEntries("fr")).map((o) => ({
      debut: o.start,
      ja: o.source,
      fr: o.entry.value.fr,
      en: o.entry.value.en,
      kind: o.entry.value.kind,
      id: o.entry.value.id
    }));
    if (json)
      console.log(JSON.stringify({ revision, date, occurrences: occ }, null, 2));
    else {
      console.log(entete);
      for (const o of occ)
        console.log(`${o.debut}	${o.ja}	${o.fr}	${o.en || "\u2014"}	${o.kind}`);
      if (!occ.length)
        console.log("aucun terme du lexique dans ce texte");
    }
    return 0;
  }
  if (commande === "masque") {
    const texte = await texteArgument(valeur);
    const masked = lexique.mask(texte, cible);
    const table = Object.fromEntries(masked.tokens.map((t) => [t.token, t.target]));
    const termesTrouves = masked.tokens.map((t) => ({
      jeton: t.token,
      id: t.entry.value.id,
      ja: t.entry.value.ja,
      fr: t.entry.value.fr,
      en: t.entry.value.en,
      kind: t.entry.value.kind
    }));
    console.log(JSON.stringify({
      revision,
      date,
      cible,
      masque: masked.text,
      table,
      termes: termesTrouves,
      debordement: masked.overflow
    }, null, 2));
    return 0;
  }
  if (commande === "restaure") {
    const texte = await texteArgument(valeur);
    if (!fichierTable)
      return usage();
    const brut = fichierTable.trim().startsWith("{") ? JSON.parse(fichierTable) : await Bun.file(fichierTable).json();
    const objet = brut.table ?? brut;
    const { text, unresolved, missing } = restoreTokens(texte, Object.entries(objet));
    if (json)
      console.log(JSON.stringify({ texte: text, residuels: unresolved, manquants: missing }, null, 2));
    else {
      console.log(text);
      if (unresolved.length)
        console.error(`jetons non restaur\xE9s : ${unresolved.join(", ")} \u2014 traduction \xE0 refuser`);
      if (missing.length)
        console.error(`jetons absents de la traduction : ${missing.join(", ")}`);
    }
    return unresolved.length ? 2 : 0;
  }
  return usage();
}
function usage() {
  console.error("usage : bun lexique.js cherche <terme> | termes <texte> | masque <texte> [--en] | restaure <traduction> --table <table.json> [--json]");
  return 1;
}
if (import.meta.main)
  process.exit(await main(Bun.argv.slice(2)));
export {
  chargerLexique
};
