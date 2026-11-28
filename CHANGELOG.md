# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [semantic versioning](https://semver.org/) with the convention described in [`AGENTS.md`](AGENTS.md): a change that alters the output for existing inputs is not a patch.

## [Unreleased]

### Added

- The example site is part of the published package: `example/` (`server.js`, `index.html`, `settings-help.json`) and `langs/samples.json`. From an install, `node node_modules/@mouseba11/quirky-slugger/example/server.js` or `npm explore @mouseba11/quirky-slugger -- npm start`. From a clone, `npm start`.
- `pluralFactor` (default `0.3`), shown as Plurals in the example config. An eligible keyword has that chance of its English plural in the slug and the title. See Changed for the rule.
- Five purpose patterns for scientific and academic pages, in all three packs, placed after `objects` and before the generic three: `method`, `finding`, `survey`, `case` and `definition`. Each has short intent-word triggers, plain templates that work with one keyword, and quirky templates.
- Triggers: `science` takes `mechanism`. `review` takes `unboxing`, `recommend` and `buyer`.
- Templates appended to `science` (four plain, two quirky) and `statistics` (two plain), and four appended to `sharedTemplates`: `notes-on-{kw}`, `a-note-on-{kw}`, `{kw}:-an-overview` and `a-brief-introduction-to-{kw}`. Any pattern can now draw a plain frame from the shared pool. `de` and `es` have translations.
- "How to ... in {n} easy steps" titles. Three shared templates (`how-to-get-started-with-{kw}-in-{n}-easy-steps`, `{kw}-in-{n}-easy-steps`, `{n}-easy-steps-to-getting-started-with-{kw}`), one shared quirky template, and appended `howto` templates (`how-to-master-{kw}-in-{n}-easy-steps`, `how-to-get-started-with-{kw}-in-{n}-steps`, `how-to-pair-{kw1}-with-{rest}-in-{n}-easy-steps`, plus two quirky). About 4% of titles on a page that matches no pattern are now one of these. `de` and `es` have translations. quirky-persona's `howto` pattern is marked `outranksCount`, so these titles get the Instructor persona rather than the List editor (see `docs/ALGORITHM.agents.md` 1.3). Use a quirky-persona release that has `outranksCount`, and its `method`, `finding`, `survey`, `case` and `definition` patterns, so the academic titles get a matching persona.
- The English `case` pattern avoids the word "case" (`a-clinical-study-of-{kw}`, `clinical-notes:-{kw}`) and the `survey` pattern says "a survey of the literature", because quirky-persona reads "the case for" as an opinion and "review" as a product review.

### Changed

- **Plurals are English morphology, for the English pack only.** `pluralFactor` now runs only when the merged `locale.article` is `en-a-an`. A German or Spanish call no longer adds a trailing `s`, and `plurals` is `[]`. For English, only a single word of letters, lowercase or Capitalized, is eligible: `toast` → `toasts`, `tea` → `teas`, `city` → `cities`, `study` → `studies`, `analysis` → `analyses`, `index` → `indices`, `jazz` → `jazzes`. A phrase (`baked beans`, `protein folding`), an acronym or mixed-case name (`CRISPR`, `iPhone`), a word with a digit or hyphen, and mass or abstract nouns (`research`, `evidence`, `data`, `entropy`, `energy`, `gravity`, `metabolism`, `mitochondria`, `bacteria`) stay as written. A single-word proper noun can take an `s`. The roll and its salt (`|plural|i`) are unchanged.
- **`fold` matches a plural `-ings` word to its `-ing` trigger.** After the trailing `s` is dropped, an `ing` ending on a word longer than 5 letters is dropped too, so `findings` and `finding` both become `find`. Before, `findings` never matched a `finding` trigger. Text containing `-ings` words can score differently.
- **Triggers removed to stop academic pages landing on the wrong voice.** `review` loses the bare word `review`, `news` loses `report`, `explainer` loses `study`, `research`, `science`, `chemistry` and `physics`, `culture` loses `literature`, and `health` loses `protein`. A page whose only review signal is the word `review` now falls to a generic pattern. `de` and `es` lose the equivalent words.
- `de` and `es` received the same pattern ids, in the same order, with plain translations. They now have 34 patterns (31 with triggers) and 16 shared templates. English has 34 patterns (31 with triggers) and 18 shared templates.
- Existing seeds can produce a different title. Appended templates change `hash % length` for `science`, `statistics` and the shared pool. Removed triggers and the new patterns change which pattern wins for some text.
- An install that has already saved its own patterns (for example Babble, in `data/quirky-slug.json`) keeps them. It gets the new plural and `fold` code, but none of the new patterns, until it resets to the built-in config. A config can hold at most 40 patterns in Babble, so 34 leaves room for six.
- `{n}` is a string. The plain pools are `2`, `3`, `5` and the words `two`, `three`, `five` (German `zwei`, `drei`, `fünf`; Spanish `dos`, `tres`, `cinco`). The example editor keeps those words instead of dropping anything that is not a digit.

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
