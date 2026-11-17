---
name: "cli-just"
description: "Use `just` (just 1.59.0): Command runner for project recipes."
---

# just 1.59.0

Binary: `just`. Install: `cargo binstall just` or the official release.
Generated from the tool manual; do not edit. Regenerate with `just cli-skills`.

## `just --help`

```text
 Just a command runner - https://github.com/casey/just

Usage: just [OPTIONS] [ARGUMENTS]...

Arguments:
  [ARGUMENTS]...  Overrides and recipe(s) to run, defaulting to the first recipe in the justfile

Options:
      --alias-style <ALIAS_STYLE>
          Set list command alias display style [env: JUST_ALIAS_STYLE=] [default: right] [possible
          values: left, right, separate]
      --allow-missing
          Ignore missing recipe and module errors [env: JUST_ALLOW_MISSING=]
      --ceiling <CEILING>
          Do not ascend above <CEILING> directory when searching for a justfile. [env:
          JUST_CEILING=]
      --check
          Run `--fmt` in 'check' mode. Exits with 0 if justfile is formatted correctly. Exits with 1
          and prints a diff if formatting is required.
      --chooser <CHOOSER>
          Override binary invoked by `--choose` [env: JUST_CHOOSER=]
      --clear-shell-args
          Clear shell arguments
      --color <COLOR>
          Print colorful output [env: JUST_COLOR=] [default: auto] [possible values: always, auto,
          never]
      --command-color <COMMAND_COLOR>
          Echo recipe lines in <COMMAND-COLOR> [env: JUST_COMMAND_COLOR=] [possible values: black,
          blue, cyan, green, purple, red, yellow]
      --complete-aliases
          Auto-complete recipe aliases [env: JUST_COMPLETE_ALIASES=]
      --cygpath <CYGPATH>
          Use binary at <CYGPATH> to convert between unix and Windows paths [env: JUST_CYGPATH=]
          [default: cygpath]
      --default-list
          List recipes when no arguments are provided [env: JUST_DEFAULT_LIST=]
      --dotenv-command <COMMAND>
          Run <COMMAND> and load its output as an environment file [env: JUST_DOTENV_COMMAND=]
  -F, --dotenv-filename <DOTENV_FILENAME>
          Search for an environment file named <DOTENV-FILENAME> instead of `.env`
  -E, --dotenv-path <DOTENV_PATH>
          Load <DOTENV-PATH> as an environment file instead of searching for one
  -n, --dry-run
          Print what just would do without doing it [env: JUST_DRY_RUN=]
      --dump-format <FORMAT>
          Dump justfile as <FORMAT> [env: JUST_DUMP_FORMAT=] [default: just] [possible values: json,
          just]
      --evaluate-format <FORMAT>
          Print evaluated variables in <FORMAT> [env: JUST_EVALUATE_FORMAT=] [default: just]
          [possible values: just, shell]
      --explain
          Print recipe doc comment before running it [env: JUST_EXPLAIN=]
  -g, --global-justfile
          Use global justfile
      --group <GROUP>
          Only list recipes in <GROUP> [env: JUST_GROUP=]
      --highlight
          Highlight echoed recipe lines in bold [env: JUST_HIGHLIGHT=]
      --indentation <INDENTATION>
          Indent recipes bodies with <INDENTATION> [env: JUST_INDENTATION=]
      --jobs <N>
          Run at most <N> recipes simultaneously with the [parallel] attribute [env: JUST_JOBS=]
  -f, --justfile <JUSTFILE>
          Use <JUSTFILE> as justfile or `-` to read from standard input [env: JUST_JUSTFILE=]
      --justfile-name <NAME>
          Search for justfile named <NAME>, accepts multiple `,`-separated values and may be
          repeated [env: JUST_JUSTFILE_NAME=]
      --list-heading <TEXT>
          Print <TEXT> before list [env: JUST_LIST_HEADING=] [default: "Available recipes:\n"]
      --list-prefix <TEXT>
```
