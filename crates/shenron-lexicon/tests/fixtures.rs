// SPDX-License-Identifier: Apache-2.0
//! Golden fixtures shared with `@aphrody/shenron-lexicon` (`packages/lexicon/test/fixtures.test.ts`):
//! both implementations read the same files of `data/lexicon/fixtures/`, so they cannot diverge.

use std::path::PathBuf;

use serde::Deserialize;
use serde_json::Value;
use shenron_lexicon::{
    Kind, Lang, Lexicon, LexiconData, MaskEntry, MaskOptions, Masker, SearchOptions, TokenOptions,
    find_tokens, fold, restore, validate, word_edges,
};

fn fixture<T: for<'de> Deserialize<'de>>(name: &str) -> T {
    let path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../data/lexicon/fixtures").join(name);
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|error| panic!("{}: {error}", path.display()))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Options {
    prefix: Option<String>,
    width: Option<usize>,
    max_tokens: Option<usize>,
}

impl Options {
    fn tokens(&self) -> TokenOptions {
        TokenOptions {
            prefix: self
                .prefix
                .clone()
                .unwrap_or_else(|| shenron_lexicon::DEFAULT_TOKEN_PREFIX.to_owned()),
            width: self.width,
        }
    }

    fn mask(&self) -> MaskOptions {
        MaskOptions { tokens: self.tokens(), max_tokens: self.max_tokens }
    }
}

#[derive(Deserialize)]
struct FoldCase {
    input: String,
    output: String,
}

#[test]
fn fold_json() {
    #[derive(Deserialize)]
    struct Doc {
        cases: Vec<FoldCase>,
    }
    for case in fixture::<Doc>("fold.json").cases {
        assert_eq!(fold(&case.input), case.output, "fold({:?})", case.input);
    }
}

#[derive(Deserialize)]
struct Entry {
    sources: Vec<String>,
    target: String,
}

#[derive(Deserialize)]
struct MaskCase {
    name: String,
    entries: Vec<Entry>,
    #[serde(default)]
    options: Options,
    input: String,
    masked: String,
    tokens: Vec<(String, String)>,
    overflow: usize,
    translation: Option<String>,
    restored: Option<String>,
    unresolved: Option<Vec<String>>,
    missing: Option<Vec<String>>,
}

#[test]
fn mask_json() {
    #[derive(Deserialize)]
    struct Doc {
        cases: Vec<MaskCase>,
    }
    for case in fixture::<Doc>("mask.json").cases {
        let entries = case
            .entries
            .into_iter()
            .map(|entry| MaskEntry::new(entry.sources, entry.target))
            .collect();
        let masked = Masker::new(entries, case.options.mask()).mask(&case.input);
        assert_eq!(masked.text, case.masked, "{}", case.name);
        assert_eq!(masked.table(), case.tokens, "{}", case.name);
        assert_eq!(masked.overflow, case.overflow, "{}", case.name);
        if let Some(translation) = case.translation {
            let restored = restore(&translation, &masked.table(), &case.options.tokens());
            assert_eq!(Some(restored.text), case.restored, "{}", case.name);
            assert_eq!(Some(restored.unresolved), case.unresolved, "{}", case.name);
            assert_eq!(Some(restored.missing), case.missing, "{}", case.name);
        }
    }
}

#[test]
fn restore_json() {
    #[derive(Deserialize)]
    struct Case {
        name: String,
        #[serde(default)]
        options: Options,
        table: Vec<(String, String)>,
        translation: String,
        restored: String,
        unresolved: Vec<String>,
        missing: Vec<String>,
    }
    #[derive(Deserialize)]
    struct Doc {
        cases: Vec<Case>,
    }
    for case in fixture::<Doc>("restore.json").cases {
        let restored = restore(&case.translation, &case.table, &case.options.tokens());
        assert_eq!(restored.text, case.restored, "{}", case.name);
        assert_eq!(restored.unresolved, case.unresolved, "{}", case.name);
        assert_eq!(restored.missing, case.missing, "{}", case.name);
    }
}

#[test]
fn tokens_json() {
    #[derive(Deserialize)]
    struct TokenCase {
        text: String,
        #[serde(default)]
        options: Options,
        found: Vec<String>,
    }
    #[derive(Deserialize)]
    struct EdgeCase {
        text: String,
        start: usize,
        end: usize,
        edges: bool,
    }
    #[derive(Deserialize)]
    struct Doc {
        tokens: Vec<TokenCase>,
        edges: Vec<EdgeCase>,
    }
    let doc: Doc = fixture("tokens.json");
    for case in doc.tokens {
        assert_eq!(find_tokens(&case.text, &case.options.tokens()), case.found, "{}", case.text);
    }
    for case in doc.edges {
        let chars: Vec<char> = case.text.chars().collect();
        assert_eq!(word_edges(&chars, case.start, case.end), case.edges, "{}", case.text);
    }
}

#[derive(Deserialize)]
struct ResolveCase {
    query: String,
    id: Option<String>,
}

#[derive(Deserialize)]
struct LabelCase {
    id: String,
    lang: Lang,
    text: String,
    from: Lang,
    fallback: bool,
}

#[derive(Deserialize)]
struct SearchCase {
    query: String,
    kind: Option<Kind>,
    limit: Option<usize>,
    hits: Vec<(String, u32, String, String)>,
}

#[derive(Deserialize)]
struct LexiconMaskCase {
    target: Lang,
    input: String,
    masked: String,
    tokens: Vec<(String, String)>,
    translation: Option<String>,
    restored: Option<String>,
}

#[derive(Deserialize)]
struct Checks {
    #[serde(default)]
    resolve: Vec<ResolveCase>,
    #[serde(default)]
    labels: Vec<LabelCase>,
    #[serde(default)]
    search: Vec<SearchCase>,
    #[serde(default)]
    mask: Vec<LexiconMaskCase>,
}

fn check_lexicon(lexicon: &Lexicon, checks: &Checks) {
    for case in &checks.resolve {
        let id = lexicon.resolve(&case.query).map(|term| term.id.clone());
        assert_eq!(id, case.id, "resolve {:?}", case.query);
    }
    for case in &checks.labels {
        let term = lexicon.get(&case.id).unwrap_or_else(|| panic!("no term {}", case.id));
        let label = lexicon.label(term, case.lang);
        assert_eq!(
            (label.text, label.lang, label.fallback),
            (case.text.as_str(), case.from, case.fallback),
            "label {} {}",
            case.id,
            case.lang
        );
    }
    for case in &checks.search {
        let hits: Vec<(String, u32, String, String)> = lexicon
            .search(&case.query, SearchOptions { kind: case.kind, limit: case.limit })
            .into_iter()
            .map(|hit| {
                (hit.term.id.clone(), hit.score, hit.field.as_str().to_owned(), hit.form.to_owned())
            })
            .collect();
        assert_eq!(hits, case.hits, "search {:?}", case.query);
    }
    for case in &checks.mask {
        let masked = lexicon.masker(case.target, MaskOptions::default()).mask(&case.input);
        assert_eq!(masked.text, case.masked, "mask {}", case.input);
        assert_eq!(masked.table(), case.tokens, "mask {}", case.input);
        if let Some(translation) = &case.translation {
            let restored = restore(translation, &masked.table(), &TokenOptions::default());
            assert_eq!(Some(&restored.text), case.restored.as_ref(), "restore {translation}");
            assert!(restored.unresolved.is_empty(), "restore {translation}");
        }
    }
}

#[test]
fn lexicon_json() {
    #[derive(Deserialize)]
    struct Invalid {
        name: String,
        doc: Value,
    }
    #[derive(Deserialize)]
    struct Doc {
        lexicon: Value,
        #[serde(flatten)]
        checks: Checks,
        coverage: Value,
        invalid: Vec<Invalid>,
    }
    let doc: Doc = fixture("lexicon.json");
    let lexicon = Lexicon::from_json(&doc.lexicon.to_string()).expect("fixture lexicon");
    check_lexicon(&lexicon, &doc.checks);
    assert_eq!(serde_json::to_value(lexicon.coverage()).expect("coverage"), doc.coverage);
    for case in doc.invalid {
        let parsed: Result<LexiconData, _> = serde_json::from_value(case.doc.clone());
        let rejected = parsed.map_or(true, |data| !validate(&data).is_empty());
        assert!(rejected, "accepted invalid document: {}", case.name);
        assert!(Lexicon::from_json(&case.doc.to_string()).is_err(), "{}", case.name);
    }
}

#[test]
fn embedded_json() {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Doc {
        min_terms: usize,
        #[serde(flatten)]
        checks: Checks,
    }
    let doc: Doc = fixture("embedded.json");
    let lexicon = Lexicon::embedded();
    assert!(lexicon.len() >= doc.min_terms, "{} terms", lexicon.len());
    check_lexicon(lexicon, &doc.checks);
}
