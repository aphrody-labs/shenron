// SPDX-License-Identifier: Apache-2.0
//! The one Dragon Ball translation lexicon of Shenron (ja/fr/en).
//!
//! - [`Lexicon`]: the canonical terms (`data/lexicon/terms.json`, embedded by
//!   [`Lexicon::embedded`]): lookup by id or any form ([`Lexicon::resolve`]), localisation with
//!   the English → French fallback ([`Lexicon::label`]), ranked search ([`Lexicon::search`]).
//! - [`mask`]: term protection around a translation engine: longest-first masking by numbered
//!   tokens, tolerant restoration, report of invented and dropped tokens.
//! - [`fold`]: the search key of a form.
//!
//! `@aphrody/shenron-lexicon` (TypeScript) implements the same rules; both read the golden fixtures of
//! `data/lexicon/fixtures/`, so they cannot diverge. Owners: docs/architecture/lexicon.md.

pub mod fold;
pub mod lexicon;
pub mod mask;
pub mod types;

pub use fold::fold;
pub use lexicon::{
    Coverage, EMBEDDED_JSON, Filled, KindCoverage, Label, Lexicon, LexiconError, MatchField,
    SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT, SearchHit, SearchOptions, validate,
};
pub use mask::{
    DEFAULT_TOKEN_PREFIX, DEFAULT_TOKEN_WIDTH, MaskEntry, MaskOptions, Masked, MaskedToken, Masker,
    Occurrence, Restored, TokenOptions, find_occurrences, find_tokens, restore, word_edges,
};
pub use types::{Aliases, Kind, Lang, LexiconData, Source, SourceField, Term};
