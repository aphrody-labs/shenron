# Koharu Translator

koharu-translator provides one segment-preserving translation interface for
local GGUF models and hosted providers.

Model metadata is provider-neutral: each model has a stable provider ID, a
display name, and (for local models) selectable GGUF quantizations. Every
provider module owns its connection config, defaults, request mapping, and
model catalog or discovery.

The crate owns only provider connectivity. Provider settings such as base URLs
are persisted under `[providers]`; credentials remain in the platform keychain.
Translation model selection, target language, instructions, and generation
options belong to the caller. `koharu-pipeline` owns those values as the
configuration of its translation processor.

`Translator` is an execution engine. A caller supplies a `ModelSelection`,
`GenerationConfig`, and `TranslationRequest` for each operation. The engine
keeps the selected local model resident when possible and reads live provider
connection settings without owning workflow configuration.

## Glossary

A `Glossary` protects domain terms from the engine. Matched source terms (longest first,
no overlap, on word edges for katakana and Latin terms) become numbered tokens such as
`Zeta001`; after translation each token, however the engine spelled it (`Zêta001`,
`ZETA 001`), is replaced by the official target form. A token the table does not know makes
the request fail with `GlossaryTokens` rather than reach the page.

Entries are `{ "source", "target" }` objects; `ja` and `fr` are accepted as aliases so
Shenron's `data/lexique-db-canonique.json` loads as is. A glossary is chosen, in this order, by
`TranslationRequest::with_glossary`, `Translator::with_glossary`, then the process default
(`set_default_glossary`). `Translator::from_config` also reads `KOHARU_GLOSSARY` (path of a
JSON file; a set but unreadable file is an error) and `KOHARU_GLOSSARY_TARGET` (language the
glossary applies to, for instance `fr`; default: every target language).
