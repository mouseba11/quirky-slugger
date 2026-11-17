# AGENTS.md

Guidance for AI agents (and humans in a hurry) working on **quirky-slugger**.

quirky-slugger turns keywords (themes) plus up to 256 words of text into a URL slug and a matching title. It scores the text against a configurable list of title **patterns** with TF-IDF and cosine similarity, picks a **template**, and fills it in. It is local, deterministic and has **no runtime dependencies**.

Read order for a non-trivial change:

1. This file (rules and recipes).
2. [`docs/ALGORITHM.agents.md`](docs/ALGORITHM.agents.md) (exact specification, seed and salt table, invariants).
3. [`docs/ALGORITHM.md`](docs/ALGORITHM.md) if you need the plain-language explanation to write user-facing text.

## Commands

```
npm test            # node test.js. Plain assert, no framework. Prints "all tests passed".
npm start           # example site on http://localhost:4000 (PORT env var overrides)
npm run pack:check  # npm pack --dry-run: lists exactly what would be published
```

Run `npm test` after every change. It takes about 10 seconds because it runs statistical surveys over hundreds of seeds.

## Repository map

| Path | What it is | Change it when |
| --- | --- | --- |
| `index.js` | The whole algorithm and the public API (`quirkySlug`, `explain`, `keywordWeights`, `slugify`), including `options.lang` / locale hooks. | The **method** changes. |
| `quirky-slugger.config.json` | Shared algorithm settings only (`maxWords`, `patternSpread`, default `lang`, the `...Factor` values, …). | You change scoring / length / quirk / joiner-variant defaults. |
| `langs/*.json` | Language packs (`en`, `de`, `es`): **patterns**, templates, connectors, stop words, joiner, `locale`. | You want different **wording**, a new pattern, or a new language. Most content changes belong here. |
| `langs/samples.json` | Example-site sample keywords/text per language. Not published. | The demo sample changes. |
| `package.json` | Name (`@mouseba11/quirky-slugger`), scripts, and the `files` whitelist that decides what is published. | A file must be added to or kept out of the package, or you add a language pack. |
| `test.js` | Test suite. Uses a pinned wrapper plus statistical surveys. | You change behaviour or defaults. |
| `example/server.js` | Zero-dependency HTTP server. Serves `/api/config`, `/api/langs`, `/api/lang/:code`, `/api/samples`, `POST /api/slug`. | The API or options change. |
| `example/index.html` | Demo page with Tester, Config, and a Language dropdown. | New `explain` fields or languages should be shown. |
| `example/settings-help.json` | The **?** text for each config setting. One array of paragraphs per key. | The explanation of a setting changes. |
| `docs/ALGORITHM.md` | Human explanation. | Behaviour that users should understand changes. |
| `docs/ALGORITHM.agents.md` | Exact specification. | **Any** change to `index.js` or the defaults it describes. |
| `README.md` | Package documentation (install, API, languages, config, templates). | The API, config keys or placeholders change. |
| `CHANGELOG.md` | Version history. | Every release, and any output-changing change. |

Published: `index.js`, the config file, `langs/en.json`, `langs/de.json`, `langs/es.json`, `docs/`, `AGENTS.md`, `CHANGELOG.md` (plus `README.md`, `LICENSE` and `package.json`, which npm always includes). Not published: `example/`, `test.js`, `langs/samples.json`. Run `npm run pack:check` to confirm.

## Rules

1. **No runtime dependencies.** Node built-ins only. CommonJS, `'use strict'`, 2-space indent, single quotes, semicolons.
2. **Stay deterministic.** No `Math.random`, `Date`, network or global state in `index.js`. Variety comes from `options.seed`.
3. **Output depends on list order.** `pick(list, salt)` uses `hash(seed + salt) % list.length`. Adding, removing or reordering any template, adjective, suffix, number or connector word changes the result for existing inputs. That is acceptable, but record it in `CHANGELOG.md` and prefer **appending** to lists. Never change a salt string or the seed format casually (see the salt table in the spec).
4. **Prefer config over code.** A new kind of title is a new pattern. A new phrase is a new template. A new word is a new list entry. Only touch `index.js` when the method itself must change.
5. **Keep the slug and the title in sync.** They come from the same template and the same chosen words. Never build them separately.
6. **Grammar is authored, not computed.** The code does not inflect words (no gender/case engine). The one exception is `pluralFactor`: an eligible keyword may gain a trailing `s` in the slug and the title. A keyword ending in `s` or a vowel (`a e i o u y`) is never eligible. Fit is otherwise guaranteed by separate word lists per grammatical form and by templates written to match. Language support is rudimentary: the shipped packs demonstrate the hooks. Proper localisation is left as an exercise for other quirky sluggers. If you add a word, check it in **every** template that uses its placeholder.
7. **Do not add logging or debug output** to `index.js`. Use `explain()` to inspect a result.
8. **Keep docs and code in step.** If you change behaviour, update `docs/ALGORITHM.agents.md` and the matching `README.md` section in the same change.
9. **Do not modify unrelated code.** Keep changes focused on the request.

## Inspect before you change

`explain()` shows everything that led to a result. This is the first thing to run when a title looks wrong.

```js
const q = require('./index.js');
const e = q.explain('baked beans, toast, tea', 'some text', { seed: 'x', quirks: true });
e.pattern; e.score; e.scores; e.candidates; e.template;
e.sharedTemplate; e.connectTemplate;
e.connectors; e.keywords; e.pluralFactor; e.plurals;
```

To reproduce a result, keep the exact keywords, text (it is part of the seed), config and seed.

To render every template of a pattern for review:

```js
const c = require('./langs/en.json');
for (const t of c.patterns.find(p => p.id === 'review').templates) {
  console.log(q('baked beans, toast, tea', 'x', {
    config: {
      patterns: [{ id: 'p', triggers: [], templates: [t] }],
      connectors: c.connectors,
      joinerVariantFactor: 0,
      pluralFactor: 0
    }
  }).title);
}
```

(A custom `patterns` list empties the shared and connecting pools, so only that template can be chosen.)

## Recipes

### Add a language

1. Copy `langs/en.json` to `langs/xx.json` (two-letter code).
2. Fill `locale`: `id`, `label`, `titleCase` (`en` | `de` | `es`), `article` (`en-a-an` or `none`), optional `joinerAlt`, and `smallWords`.
3. Rewrite `joiner`, stop words, connectors, quirky modifiers, numbers, all template pools, and every pattern’s triggers/templates. Prefer fixed articles inside templates; avoid frames that need gender agreement with unknown keywords.
4. Keep template characters to `[a-z0-9{}.,:;?!'-]` (accents belong in titles via keywords, not template literals, so validation and slugs stay clean).
5. Add a sample under `langs/samples.json` with ~50/40/10 keyword weights if it is a three-keyword demo.
6. Add `langs/xx.json` to the `files` list in `package.json`. It is an explicit whitelist (so `samples.json` stays out), and a pack that is not listed is not published.
7. The example site picks up new packs from the `langs/` folder automatically (`GET /api/langs`).
8. Add smoke tests (load pack, non-empty slug/title, `explain().lang`, weight check if you added a sample).
9. Update README / CHANGELOG. Keep the note that language support is rudimentary and further work is left to other quirky sluggers.

### Add a pattern

1. Append an object to `patterns` in `langs/en.json` (and the other packs, if the pattern should exist in every language):

   ```json
   { "id": "interview",
     "triggers": ["interview", "asked", "conversation"],
     "templates": ["an-interview-with-{kw1}", "{kw}:-the-interview"],
     "quirkyTemplates": ["a-{adj}-chat-about-{kw}"] }
   ```

2. Use **intent words** as triggers (`recipe`, `review`, `breakfast`). **Do not use** nouns likely to be keywords (`toast`, `beans`): keywords are boosted, so a keyword that is also a trigger forces its pattern. Remember triggers are stemmed (`bake` also matches `baked`, `baking` and keywords containing them).
3. Give at least one template that works with a single keyword (`needs <= 1`: no `{rest}`, `{kw2}` or connector placeholders).
4. Add a test (or extend an existing one) that text with those triggers picks the pattern. See "Statistical surveys" below if variety assertions change.
5. Update the pattern list in `README.md` and `docs/ALGORITHM.md`, and the counts in `docs/ALGORITHM.agents.md`.
6. Run `npm test`.

### Add a template

Add it to the right list: a pattern's `templates` or `quirkyTemplates`, `sharedTemplates` / `sharedQuirkyTemplates` (any pattern), `connectTemplates` / `connectQuirkyTemplates` (joins or compares two or more keywords).

Checklist:

- Characters: lowercase letters, digits, hyphens, `{placeholders}`, and `, : ; ? ! '` only. `test.js` enforces this for the defaults.
- Hyphens separate words. Punctuation goes straight after the word it belongs to: `{kw}:-a-closer-look`, `what-do-{kw}-have-in-common?`.
- Write apostrophes without the apostrophe only for the supported contractions (`dont`, `doesnt`, `didnt`, `isnt`, `cant`, `wont`, `youre`, `youll`, `whats`, `thats`). Otherwise reword. (A literal `'` is allowed and is kept in the title but not the slug.)
- Do not use `and` between keywords. The code adds the joiner only before the last keyword. Use `{kw}` or `{kw1}` with `{rest}`.
- Avoid a verb that must agree with a keyword (`{kw1}-meets-{rest}`): the keyword may be singular or plural. Use a participle, a gerund, or a plural verb with the whole list (`what-do-{kw}-have-in-common?`).
- Use a literal `a-` before a placeholder if you need an article that adapts (`a-{adj}-{suffix}`). `a` becomes `an` before a vowel sound.
- Only use `{adj}` and `{suffix}` in quirky lists. Plain templates should not need quirkiness.
- Render it (see "Inspect before you change") and read it aloud, in both title and slug form, with 1, 2 and 3 keywords.

### Add a word to `{adj}`, `{suffix}`, `{n}` or a connector list

- `quirkyModifiers.adjectives`: must work in `the-{adj}-history-of-{kw}`, `a-{adj}-{suffix}` and similar. Multi-word values use hyphens (`oddly-specific`).
- `quirkyModifiers.suffixes`: a noun phrase that works after `a-{adj}-` (`rabbit-hole`).
- `connectors.verbs`: base form that takes `{kw}` as its object (`how-to-{connect}-{kw}`).
- `connectors.gerunds`: `-ing` form with the same object.
- `connectors.nouns`: singular noun that works after `a` or `the` and before `between` (`the-{connection}-between-{kw}`).
- `connectors.participles`: past participle **including its preposition** (`paired-with`, `tied-to`).
- `numbers`: plain `{n}` strings. A digit or a word (`2`, `two`). Always in the pool. Append rather than insert.
- `quirkyNumbers`: extra `{n}` values, appended only when the quirk roll hits. A phrase is allowed (`A bunch`). It is title-cased in the title and hyphenated in the slug.

Check every template that uses that placeholder. Append rather than insert, so fewer existing results change.

### Add a new placeholder

A placeholder name appears in **five** places. Update all of them:

1. The two placeholder regex constants in `index.js`, `PLACEHOLDER_RE` and `PLACEHOLDER_SPLIT` (inside `explain`). Both list every name; search for `kw\d*|rest|n|top|adj|suffix`.
2. `valueFor` in `index.js` (and a `used.<name>` entry plus the `explain()` return value if you want it exposed).
3. `needs()` in `index.js`, if the placeholder implies a minimum number of keywords.
4. The allowed-placeholder regex in `test.js` (the loop that validates every default template).
5. The placeholder table in `README.md`, `docs/ALGORITHM.md` and `docs/ALGORITHM.agents.md` (including the regex quoted in spec section 1.5).

Give any random choice its own salt string so it stays independent of the others, and add it to the salt table in the spec.

### Change a default setting

Edit the key in `quirky-slugger.config.json` (or in `langs/*.json` for pack content such as `joiner` or `joinerVariants`), then update the default in `README.md` (configuration table), `docs/ALGORITHM.md` (if it is quoted), and `docs/ALGORITHM.agents.md` (section 1.2). Update any test thresholds that depend on it.

### Change the algorithm

1. Read `docs/ALGORITHM.agents.md` sections 3 to 5. Note which invariants (section 7) you could affect.
2. Make the change in `index.js`.
3. Update the spec first-hand: formulas, salts, edge cases. The spec must describe the code, not the other way around.
4. Update the explanatory text in `docs/ALGORITHM.md` and `README.md`.
5. If `explain()` gains or loses a field, update the `README.md` field table, `example/index.html` if it displays it, and the spec's `ExplainResult`.
6. Add tests. Decide whether the change is a breaking change in output (see "Versioning").

## Testing

`test.js` is a single script of `assert` calls. A failing assertion throws and shows the line. There are two styles of test.

- **Pinned tests.** A wrapper adds `{ patternSpread: 1, sharedFactor: 0, connectFactor: 0, joinerVariantFactor: 0, pluralFactor: 0 }` so the best pattern always wins, no pool is mixed in, the joiner is the plain `and`, and keywords are not pluralized. Most tests use it. It returns just the slug string.
- **Statistical surveys.** They run `explain` over hundreds of seeds and assert counts, for example "at least 120 distinct quirky titles" or "the connecting pool is used 30 to 50 percent of the time". If you shrink the defaults or change a factor and one fails, either the change cost variety (reconsider it) or the threshold should move deliberately (update it **and** the table in spec section 9).

New tests go in the matching section of `test.js`. When a test should be independent of default data, give it its own `patterns` config. A custom `patterns` list empties the shared and connecting pools, so only your templates can be chosen.

## Versioning

The project follows semantic versioning with one convention: **a change that alters the output for existing inputs is not a patch.** That includes new or reordered templates and words (because of the position-based `pick`), changed defaults, and any change to the seed format or salts.

| Change | Release |
| --- | --- |
| Bug fix with no output change; docs; tests | patch |
| New pattern, template, word or option; default data changes | minor |
| Removed or renamed API, option or config key; changed seed format or salts; changed default behaviour that callers rely on | major |

Add an entry to `CHANGELOG.md` for each release. `npm test` first, then `npm run pack:check`. Publish with `npm run publish:npm` (npmjs.org) and `npm run publish:github` (GitHub Packages). The package name is `@mouseba11/quirky-slugger`.

## Common pitfalls

- A pattern's trigger accidentally matches a common keyword (via stemming), so the pattern wins every time. Check `explain().scores`.
- A pattern with only multi-keyword templates (`{rest}`, connectors) falls back to using them with one keyword and renders gaps. Always include a single-keyword-friendly template.
- Keyword order matters for `{kw1}` and `{rest}` and for the seed. `"a, b"` and `"b, a"` give different results.
- The text is part of the seed. One character of difference gives a different choice, which is fine, but it means "stable output for a stable input" only holds if the text is identical.
- A custom `patterns` list silently drops the shared and connecting pools. If your custom output has no variety, check that.
- Do not rely on `explain().pattern` for a pattern without an `id`: it is `null`, while `scores` uses `pattern-<index>`.
- A `...Factor` that is missing or not a number counts as 0 (the feature switches off silently), for example `quirkFactor: undefined` means quirky templates are never used. `pluralFactor: 0` keeps every keyword as given; a keyword ending in `s` or a vowel is never pluralized anyway.
- Do not copy a template into a pattern when it is already in the shared or connecting pool for the same mode: it doubles that title's odds. (The `connection` pattern's overlap with the connecting pool is deliberate.)
