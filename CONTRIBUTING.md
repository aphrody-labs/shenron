# Contribution Guidelines for Shenron

Thank you for contributing to Shenron. Shenron is the sovereign technical platform behind dragonballfr.com.

## Architecture and Core Principles

- **Runtime Pureness**: 100% Upstream Bun v1.4.4+ and Rust 2024. Node.js, npm, yarn, and pnpm are strictly prohibited.
- **Strict Zero-Emoji Policy**: No emojis in source code, documentation, pull requests, commit messages, or log outputs.
- **No Human In The Loop (NHITL)**: Scripts and workflows must run non-interactively with deterministic exits and comprehensive error logs.
- **Immutable References**: Factual data, IDs, and cryptographic hashes must originate from verified upstream references.

## Development Workflow

1. Install dependencies:
   ```sh
   just install
   ```

2. Validate codebase before opening a PR:
   ```sh
   just check
   just lint
   just format-check
   just test
   ```

3. Commit conventions:
   Use standard Conventional Commits with concise, lowercase descriptions:
   - `feat(site): add oembed json endpoint`
   - `fix(gateway): resolve asset upstream redirect`
   - `docs(runbooks): document rclone r2 synchronization`

## Pull Request Lifecycle

- Pull requests trigger continuous integration workflows on GitHub Actions checking formatting, type safety, clippy rules, and test suites.
- All checks must pass before merging.
- Squash and merge is the preferred merge strategy to maintain a clean linear Git history.
