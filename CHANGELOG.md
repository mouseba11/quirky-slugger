# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [semantic versioning](https://semver.org/) with the convention described in [`AGENTS.md`](AGENTS.md): a change that alters the output for existing inputs is not a patch.

## [1.0.0] - 2026-11-17

First public release.

### Added

- `quirkySlug(keywords, text, options)` returns `{ slug, title }`.
- `explain()`, `keywordWeights()` and `slugify()`.
- Pattern matching with TF-IDF and cosine similarity against a configurable control set of 20 title patterns (17 with triggers, 3 generic), with light stemming so word forms match.
- Keyword weights based on each keyword's share of the text, which influence pattern choice.
- Weighted choice among near-best patterns (`patternSpread`) and a random generic pattern when nothing matches.
- Plain and quirky templates, with `{adj}`, `{suffix}`, `{n}`, `{top}` and quirks mode (`quirks`, `quirkFactor`).
- `quirkyNumbers`, added to the `{n}` pool on the same quirk-factor roll that selects a quirky template.
- Shared templates (`sharedTemplates`, `sharedQuirkyTemplates`, `sharedFactor`).
- Connecting templates and connector words in four grammatical forms (`{connect}`, `{connecting}`, `{connection}`, `{connected}`).
- Joiner variants (`joinerVariants`, `joinerVariantFactor`), e.g. `and the`.
- Rudimentary language packs under `langs/` (`en`, `de`, `es`) via `options.lang` / `options.langsDir`, with per-pack `locale` rules.
- Titles with correct capitalisation, small words, restored apostrophes, a/an agreement, and the joiner only before the last keyword.
- Deterministic variety through `options.seed`.
- Example site (`npm start`) with Tester, Config, language dropdown, and a browser-only `localStorage` log.
- Documentation for people (`docs/ALGORITHM.md`) and for agents (`docs/ALGORITHM.agents.md`, `AGENTS.md`).
- Published as `@mouseba11/quirky-slugger` on npm and GitHub Packages.
