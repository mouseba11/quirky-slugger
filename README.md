# quirky-slugger

Turn a few **keywords** (themes) and a little **text** into a matching URL **slug** and **title**.

```js
const quirkySlug = require('@mouseba11/quirky-slugger');

quirkySlug('beans, toast', 'Here is a quick recipe: heat the beans in a pan, toast the bread and serve.');
// -> { slug: 'why-beans-and-toast-belong-together',
//      title: 'Why Beans and Toast Belong Together' }
```

- **Local and deterministic.** No network, no AI service, no dependencies. The same input (and seed) always gives the same result.
- **Text-aware.** The text decides what kind of title fits (a recipe, a review, a history, a comparison...) by matching it against a configurable set of title patterns.
- **Theme-aware.** Keywords are treated as themes. Titles often connect, join or compare them: `The Common Thread Between Baked Beans, Toast and Tea`.
- **Quirky when you want it.** An optional quirks mode adds adjectives and playful endings: `The Improbable Art of Baked Beans, Toast and Tea`.
- **Easy to configure.** The title patterns live in JSON language packs you can extend or replace.
- **Language hooks.** Rudimentary packs for `en`, `de` and `es` show how switching works. Proper language support is left as an exercise for other quirky sluggers.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [API](#api)
- [Titles](#titles)
- [Languages](#languages)
- [Configuration](#configuration)
- [Templates and placeholders](#templates-and-placeholders)
- [Plurals](#plurals)
- [Quirks mode](#quirks-mode)
- [Connecting the keywords](#connecting-the-keywords)
- [Getting more (or less) variety](#getting-more-or-less-variety)
- [Example site](#example-site)
- [Documentation](#documentation)
- [Development](#development)
- [Releasing](#releasing)
- [License](#license)

## Install

From the public npm registry:

```
npm install @mouseba11/quirky-slugger
```

From [GitHub Packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry), add this to your project `.npmrc` (and authenticate with a classic PAT that has `read:packages`):

```
@mouseba11:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_TOKEN
```

Then:

```
npm install @mouseba11/quirky-slugger
```

Requires Node 14 or later. There are no runtime dependencies.

## Quick start

```js
const quirkySlug = require('@mouseba11/quirky-slugger');

// Keywords: a comma-separated string, or an array.
const text = 'Here is a quick recipe: heat the beans in a pan, toast the bread and serve.';

quirkySlug('baked beans, toast, tea', text);
// -> { slug: 'how-do-baked-beans-toast-and-tea-compare',
//      title: 'How Do Baked Beans, Toast and Tea Compare?' }

// Quirks mode, with a seed so a different call can give a different title.
quirkySlug('baked beans, toast, tea', text, { quirks: true, seed: 2 });
// -> { slug: 'the-improbable-art-of-baked-beans-toast-and-tea',
//      title: 'The Improbable Art of Baked Beans, Toast and Tea' }

// A single keyword and no text still works.
quirkySlug('beans', '');
// -> { slug: 'all-about-beans', title: 'All About Beans' }
```

The examples above are real output, but any change to the configuration or the seed can change which title you get. See [Getting more (or less) variety](#getting-more-or-less-variety).

## API

```js
const quirkySlug = require('@mouseba11/quirky-slugger');

// The other functions are properties of it, so they can also be destructured:
const { explain, keywordWeights, slugify } = require('@mouseba11/quirky-slugger');
```

### `quirkySlug(keywords, text, options)`

Returns `{ slug, title }`.

| Argument | Description |
| --- | --- |
| `keywords` | A string split on commas, semicolons or new lines (`"beans, toast"`), or an array of strings. At least one is required, otherwise a `TypeError` is thrown. |
| `text` | Optional free text. Only the first `maxWords` (default 256) words are used. |
| `options.lang` | Optional language code (`en`, `de`, `es`, …). Loads `langs/{lang}.json`. Defaults to `en`. |
| `options.langsDir` | Optional path to a folder of `{lang}.json` packs, if you keep your own editable copies outside the package. |
| `options.config` | Optional config object, or a path to a JSON config file. Merged last, after the language pack. See [Configuration](#configuration). |
| `options.quirks` | Optional `true` or `false`. Turns quirks mode on or off for this call, overriding `config.quirks`. |
| `options.seed` | Optional string or number. Without it the result depends only on the keywords and text. With it, the same input and seed always give the same result, and a different seed can give a different title. Pass `Math.random()` for a new title every call. |

Keywords appear in the slug as given, in the order given (a long slug can be cut at `maxSlugLength`, which can remove trailing words; the title is never cut). The text only influences which pattern and template are chosen.

### `explain(keywords, text, options)`

Takes the same arguments as `quirkySlug` and returns everything that went into the result. Use it to find out why you got a particular title.

```js
quirkySlug.explain('baked beans, toast, tea', text, { seed: 'demo' });
```

| Field | Meaning |
| --- | --- |
| `slug` / `title` | The slug and title, identical to what `quirkySlug` returns. |
| `lang` | The language code that was used. |
| `pattern` | `id` of the chosen pattern. |
| `score` | The chosen pattern's cosine similarity to the input (`0` if the fallback was used). |
| `usedFallback` | `true` if no pattern scored above `minScore`, so a generic pattern was chosen. |
| `scores` | Every pattern's score, `[{ id, score }]`, highest first. |
| `candidates` | The patterns that could have been chosen, `[{ id, score, share }]`. `share` is each one's chance. |
| `template` | The template that was filled in. |
| `sharedTemplate` | `true` if the template came from the shared pool rather than the pattern's own. |
| `connectTemplate` | `true` if the template came from the connecting pool. |
| `connectors` | The connector words used, for example `{ connection: 'overlap' }`. |
| `quirksMode` / `quirky` / `quirkFactor` | Whether quirks mode was on, whether a quirky template was chosen, and the factor used. |
| `joiner` | The word used before the last keyword for this call: `config.joiner`, or a `joinerVariants` entry such as `and the`. |
| `pluralFactor` / `plurals` | The chance that was used, and the original keywords that gained a trailing `s` in this slug and title. |
| `adjective` / `suffix` / `number` / `top` | The values used for `{adj}`, `{suffix}`, `{n}` and `{top}`, if the template had them. |
| `keywords` | `[{ keyword, weight }]`, each keyword's share of the text. |
| `wordsUsed` / `wordsIgnored` | Words counted, and words dropped for exceeding `maxWords`. |
| `truncated` / `untruncatedSlug` | Whether `maxSlugLength` shortened the slug, and what it was before. |
| `seed` | The seed as a string, or `null`. |

### `keywordWeights(keywords, text, options)`

Returns each keyword's share of the text, in the order given. The weights add up to 1.

```js
const story = 'Baked beans belong at the centre of breakfast, thick and glossy in tomato sauce. '
  + 'Toast has to keep up: cut thick, browned, buttered while still hot. Tea closes it quietly.';

quirkySlug.keywordWeights('baked beans, toast, tea', story);
// -> [ { keyword: 'baked beans', weight: 0.47 },
//      { keyword: 'toast',       weight: 0.40 },
//      { keyword: 'tea',         weight: 0.13 } ]
```

### `slugify(string)`

The helper used to build slugs: lowercase, accents removed, anything that is not a letter or number becomes a single hyphen.

```js
quirkySlug.slugify('Crème Brûlée & Toast!'); // -> 'creme-brulee-toast'
```

## Titles

The title is built from the same template as the slug, so the two always match.

- Keywords keep their own wording (`baked beans` becomes `Baked Beans`) and are listed as `a`, `a and b`, or `a, b and c`. The word before the last keyword is `config.joiner`, or now and then a `joinerVariants` entry such as `and the`. With an empty `joiner` they are comma separated.
- Words are title-cased. Small words (`a`, `an`, `and`, `as`, `at`, `but`, `by`, `for`, `in`, `nor`, `of`, `on`, `or`, `the`, `to`, `vs`, `with`, `from`, `into`, `onto`, `than`, `via`) stay lowercase unless they are first, last or straight after a colon, `?` or `!`. Words that already contain a capital, such as `NASA`, are left alone.
- Punctuation written into a template (`,` `:` `;` `?` `!`) appears in the title and is dropped from the slug.
- A literal `a` in a template becomes `an` before a vowel sound, in both slug and title.
- A few apostrophes are restored: `dont` becomes `don't`, and likewise `doesnt`, `didnt`, `isnt`, `cant`, `wont`, `youre`, `youll`, `whats`, `thats`.
- Unlike the slug, the title is never shortened by `maxSlugLength`.

## Languages

Language packs live in [`langs/`](langs/): `en.json`, `de.json`, `es.json`. Each pack owns the joiner, stop words, connectors, quirky words, numbers, template pools, patterns, and a `locale` block (title-case style, a/an rules, Spanish *y→e*, and so on).

```js
quirkySlug('Baked Beans, Toast, Tee', germanText, { lang: 'de' });
quirkySlug('alubias, tostadas, té', spanishText, { lang: 'es', quirks: true, seed: 1 });
```

Merge order is **algorithm defaults → language pack → `options.config`**. Point `options.langsDir` at your own folder if you keep editable copies outside `node_modules`.

**Language support is rudimentary.** The hooks (`options.lang`, `langs/*.json`, locale title/joiner rules) are there so packs can be switched and expanded. The shipped `de` and `es` files are thin demos, not production localisation. There is no gender or case engine, and the English light stemmer is still used for every language. **Proper language support is left as an exercise for other quirky sluggers** — fork a pack, rewrite it for your locale, and improve the rules if you need to.

See [`docs/ALGORITHM.md`](docs/ALGORITHM.md) and the “Add a language” recipe in [`AGENTS.md`](AGENTS.md).

## Configuration

Algorithm defaults (`maxWords`, `patternSpread`, `lang`, …) are in [`quirky-slugger.config.json`](quirky-slugger.config.json). Language content is in [`langs/`](langs/). Pass `options.config` to override any key after the pack is loaded. Keys you leave out keep their merged defaults.

```js
quirkySlug('beans, toast', text, { config: { maxSlugLength: 40, joiner: '' } });
quirkySlug('beans, toast', text, { config: './my-patterns.json' });
```

| Key | Default | Meaning |
| --- | --- | --- |
| `maxWords` | `256` | Text beyond this many words is ignored. |
| `maxSlugLength` | `60` | Maximum slug length. The slug is cut on a word boundary. |
| `joiner` | `"and"` | The word placed only before the last keyword: `beans-and-toast`, `baked-beans-toast-and-tea`. Use `""` for plain hyphens. |
| `joinerVariants` | `["and the"]` (en) | Extra joiners mixed in sometimes, e.g. `Potatoes and the John Lloyd Experience`. |
| `joinerVariantFactor` | `0.25` | Chance (0–1) of using a joiner variant instead of `joiner`. |
| `pluralFactor` | `0.3` | Chance (0–1) that an eligible keyword is pluralized with a trailing `s`. A keyword ending in `s` or a vowel (`a`, `e`, `i`, `o`, `u`, `y`) is left as written, so `baked beans` and `tea` never change and `toast` can become `toasts`. |
| `keywordWeight` | `2` | How strongly keywords count against the text when scoring patterns. |
| `minScore` | `0` | A pattern must score above this to be a candidate. |
| `patternSpread` | `0.2` | How close to the best score a pattern must be to be a candidate, from `0` to `1`. `1` means only the best pattern can be chosen. |
| `sharedFactor` | `0.25` | The chance (0 to 1) of using a shared template instead of the chosen pattern's own. |
| `connectFactor` | `0.4` | When two or more keywords are given, the chance (0 to 1) of using a connecting template. |
| `quirks` | `false` | Turns quirks mode on by default. |
| `quirkFactor` | `0.7` | In quirks mode, the chance (0 to 1) of a quirky template, and of adding `quirkyNumbers` to the `{n}` pool. |
| `numbers` | `["2", "3", "5", "two", "three", "five"]` | The strings `{n}` picks from. A digit or a word. German uses `zwei`, `drei`, `fünf`. Spanish uses `dos`, `tres`, `cinco`. |
| `quirkyNumbers` | `["42", "A bunch", "Sneaky"]` | Added to that pool when quirks mode is on and the quirk-factor roll hits. A phrase is title-cased in the title and hyphenated in the slug. |
| `quirkyModifiers` | see file | `adjectives` and `suffixes`, used by `{adj}` and `{suffix}`. |
| `connectors` | see file | `verbs`, `gerunds`, `nouns` and `participles`, used by `{connect}`, `{connecting}`, `{connection}` and `{connected}`. |
| `stopWords` | common English words | Ignored when matching text to patterns. |
| `sharedTemplates` / `sharedQuirkyTemplates` | see file | Templates usable with any pattern. |
| `connectTemplates` / `connectQuirkyTemplates` | see file | Templates that join and compare the keywords. |
| `patterns` | see file | The control set: the title patterns the text is matched against. |

Every `...Factor` setting is clamped to the range 0 to 1, and a value that is not a number counts as 0. `pluralFactor` is rolled once per keyword. Set it to `0` to keep every keyword exactly as given.

If you supply `patterns`, it **replaces** the default control set entirely, and the shared and connecting template lists are emptied too (they are written for the default patterns). Supply your own lists if you want them. See [`docs/ALGORITHM.md`](docs/ALGORITHM.md) for how each key is used.

### Patterns

Each pattern is an object:

```json
{
  "id": "review",
  "triggers": ["review", "rating", "verdict"],
  "templates": ["{kw}-review", "{kw}:-is-it-worth-it?"],
  "quirkyTemplates": ["brutally-honest-{kw}-verdict", "the-{adj}-truth-about-{kw}"]
}
```

| Field | Meaning |
| --- | --- |
| `id` | A name, shown in `explain()` output. |
| `triggers` | Words that pull the text towards this pattern. A pattern with no triggers is a **generic** pattern, used when nothing else matches. |
| `templates` | Plain title shapes. At least one is required. |
| `quirkyTemplates` | Optional. Used only in quirks mode. |

The default control set has 29 patterns.

Subject patterns match what a page is about. They are aimed at encyclopedia text, where the keywords may be two unrelated topics: `history`, `nature`, `people`, `place`, `science`, `statistics`, `sport`, `objects`, `culture`, `society`, `food`, `health`, `tech`.

Voice patterns match a way of writing, and their triggers are specific enough that ordinary encyclopedia prose does not select them: `recipe`, `review`, `howto`, `list`, `news`, `opinion`, `tips`, `personal`, `comfort`, `travel`. `connection` and `comparison` are for titles that join the keywords. `explainer` is for text that is working out why something happens.

`default`, `spotlight` and `essentials` have no triggers. They are used when nothing else matches.

Tips for writing triggers: use intent and descriptive words (`recipe`, `review`, `breakfast`, `comfort`), not nouns likely to be keywords (`toast`, `beans`). Keywords are boosted heavily, so a keyword that is also a trigger forces its pattern every time. Triggers are stemmed, so `bake` also matches `baked` and `baking`.

## Templates and placeholders

A template is a hyphenated string. The slug is the filled-in template. The title is the same template with hyphens turned into spaces and title-cased.

| Placeholder | Becomes |
| --- | --- |
| `{kw}` | All keywords as a list: `baked beans, toast and tea`. |
| `{kw1}`, `{kw2}`... | One keyword, numbered from 1. |
| `{rest}` | Every keyword except the first, as a list: `toast and tea`. |
| `{n}` | A value from `numbers`, plus `quirkyNumbers` when the quirk-factor roll hits: `top-{n}-{kw}` gives `top-3-baked-beans`, `top-three-baked-beans`, or `top-a-bunch-baked-beans`. |
| `{top}` | The most frequent non-keyword word in the text. |
| `{adj}` | A random adjective from `quirkyModifiers.adjectives`. |
| `{suffix}` | A random ending from `quirkyModifiers.suffixes`, such as `rabbit-hole`. |
| `{connect}` | A connecting verb in its base form: `how-to-{connect}-{kw}` gives `How to Link Baked Beans and Toast`. |
| `{connecting}` | The `-ing` form: `{connecting}-{kw}` gives `Pairing Baked Beans and Toast`. |
| `{connection}` | A connecting noun: `the-{connection}-between-{kw}` gives `The Common Thread Between Baked Beans and Toast`. |
| `{connected}` | A participle with its preposition: `{kw1}-{connected}-{rest}` gives `Baked Beans Paired with Toast and Tea`. |

Rules:

- A template that needs more keywords than were given is skipped. That means `{rest}`, `{kw2}` and later, and every connector placeholder, which needs at least two.
- If every plain template of a pattern needs more keywords than were given, they are all kept and the missing parts are left out.
- Write punctuation straight after the word it belongs to, as in `{kw}:-the-{adj}-truth`. The title becomes `Baked Beans: The Unexpected Truth`.
- Only lowercase letters, digits, hyphens, `{placeholders}` and the punctuation `, : ; ? ! '` should appear in a template.
- Avoid verbs that must agree with a keyword (`{kw1}-meets-{rest}`), because a keyword may be singular or plural. Use participles, gerunds, or a plural verb with the whole list (`what-do-{kw}-have-in-common?`).

## Plurals

`pluralFactor` (default `0.3`) is the chance that an eligible keyword gains a trailing `s` in the slug and the title. On the example site the setting is labelled Plurals. Each keyword is rolled separately, and the same input and seed always give the same choice.

A keyword is not eligible when its last letter is `s` or a vowel (`a`, `e`, `i`, `o`, `u`, `y`). `baked beans` and `tea` stay as written. `toast` can become `toasts`.

```js
quirkySlug('baked beans, toast, tea', text, { config: { pluralFactor: 1 } });
// slug contains baked-beans-toasts-and-tea
// title contains Baked Beans, Toasts and Tea
```

`0` turns it off. `1` pluralizes every eligible keyword. `explain().plurals` lists the original keywords that were pluralized on that call, and `explain().pluralFactor` is the chance that was used.

## Quirks mode

Off by default, so titles stay plain. Switch it on per call or in the config:

```js
quirkySlug('baked beans, toast, tea', text, { quirks: true });
```

In quirks mode each call uses a quirky template (`quirkyTemplates`, `sharedQuirkyTemplates` or `connectQuirkyTemplates`) with probability `quirkFactor`, and a plain one otherwise. Quirky templates use `{adj}` and `{suffix}`, and usually have the most combinations. A pattern without `quirkyTemplates` uses its plain templates unless shared quirky templates are available.


## Connecting the keywords

Keywords are themes, so many titles link or compare them instead of only listing them: `Baked Beans Paired with Toast and Tea`, `How Do Baked Beans, Toast and Tea Compare?`, `The Common Thread Between Baked Beans, Toast and Tea`.

- **Connecting templates.** `connectTemplates` (and `connectQuirkyTemplates` in quirks mode) cover joining, relating and comparing. They are used `connectFactor` of the time, and only when two or more keywords are given.
- **Connector words.** The vocabulary is based on the synonyms of *connect* in the [Merriam-Webster thesaurus](https://www.merriam-webster.com/thesaurus/connect): link, join, unite, pair, combine, bridge, marry, couple, mesh, fuse, blend, yoke, tie together; the nouns bond, tie, overlap, union, fusion, correlation, relationship, association, partnership, marriage, alliance, common ground, common thread; and participles like `tied to`, `paired with` and `woven into`. Each placeholder has its own list for its grammatical form, so results always read correctly. Add your own words to `connectors`.
- **The `connection` pattern.** Text about links and common ground (`connect`, `link`, `relationship`, `common`, `overlap`, `together`...) selects the `connection` pattern, whose templates use the connector words too.

Set `connectFactor` to `0` to turn connecting titles off, or raise it to make them more common.

## Getting more (or less) variety

| To get | Change |
| --- | --- |
| A different title on every call | Pass a changing `seed`, such as `Math.random()`. |
| The same title for the same input | Pass no seed, or the same one. |
| More patterns in play | Lower `patternSpread` (for example `0.1`). |
| Strictly the best-matching pattern | Set `patternSpread` to `1`. |
| More generic, pattern-independent titles | Raise `sharedFactor`. |
| Fewer or no connecting titles | Lower `connectFactor`, or set it to `0`. |
| More or fewer quirky titles | Change `quirkFactor` (in quirks mode). |
| Always the plain joiner (`and`) | Set `joinerVariantFactor` to `0`. |
| Keywords never pluralized | Set `pluralFactor` to `0`. |
| Stable results for tests | Set `patternSpread: 1`, `sharedFactor: 0`, `connectFactor: 0`, `joinerVariantFactor: 0`, `pluralFactor: 0`. |

## Example site

A small Node server and page with two views, **Tester** and **Config**. The tester is where you enter keywords and text, press **Generate**, and see the **OUTPUT** (`slug:` and `title:`) together with the data behind it: keyword weights, pattern scores, the candidate patterns, the template used, and the raw `explain` output. A pattern scores only where its trigger words occur in the text. Rows that display as 0.000 are hidden; Raw data still lists every pattern.

Config is where you set that sample and edit the configuration (settings, word lists, templates and patterns). Each setting has a **?** button. The explanations live in `example/settings-help.json`, separate from the page, so the wording is easy to change. Switching to Tester applies the sample and the config. Config also shows the JSON to copy into `options.config`. Nothing is written to a file. The page has no dependencies.

The example lives in the GitHub repo, not in the npm package (so an `npm install` stays a small library). Clone it, then start the site:

```
git clone https://github.com/mouseba11/quirky-slugger.git
cd quirky-slugger
npm start
```

Then open http://localhost:4000. Use the **Language** dropdown (English / Deutsch / Español) next to Generate. Each language loads its pack into Config and a matching baked-beans-style sample (weights stay about 50% / 40% / 10%). The tester also has quirks, quirk factor, and seed controls.

The sample, the edited config and the log are kept in this browser's `localStorage` only. The log is newest first, up to 200 attempts. Nothing is sent anywhere else. Click a log row to reload an attempt, or use Clear log.

If port 4000 is taken, set `PORT` (PowerShell: `$env:PORT=4001; npm start`; bash: `PORT=4001 npm start`). The server only listens on `127.0.0.1`.

## Documentation

| Document | For | Contents |
| --- | --- | --- |
| [`docs/ALGORITHM.md`](docs/ALGORITHM.md) | People | How the algorithm works, with a worked example, a glossary, and how to tune it. |
| [`docs/ALGORITHM.agents.md`](docs/ALGORITHM.agents.md) | AI agents and maintainers | The exact specification: data shapes, formulas, seed and salt table, invariants. |
| [`AGENTS.md`](AGENTS.md) | AI agents | Orientation, repository map, rules, and step-by-step recipes for common changes. |
| [`CHANGELOG.md`](CHANGELOG.md) | Everyone | What changed in each version. |

## Development

```
npm test      # run the test suite (plain Node assert, no framework)
npm start     # run the example site
```

Files:

| Path | Purpose |
| --- | --- |
| `index.js` | The whole algorithm and the public API. |
| `quirky-slugger.config.json` | Shared algorithm settings (`maxWords`, `patternSpread`, default `lang`, …). |
| `langs/` | Language packs (`en`, `de`, `es`) and `samples.json` for the example site. |
| `test.js` | The test suite. |
| `example/` | The example site (`server.js`, `index.html`, `settings-help.json`). In the repo only; run via `npm start` after cloning. |
| `docs/` | Algorithm documentation. |

Changes to titles and wording are mostly edits under `langs/`. Algorithm settings stay in `quirky-slugger.config.json`. If you change `index.js`, read [`docs/ALGORITHM.agents.md`](docs/ALGORITHM.agents.md) first: the output is deterministic, so small changes to how the seed is built can change every result.

## Releasing

The package is scoped (`@mouseba11/quirky-slugger`) so it can publish to both [npm](https://www.npmjs.com/) and [GitHub Packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry). `publishConfig` defaults to the public npm registry.

1. Update the version with `npm version patch` (or `minor` / `major`) and add an entry to [`CHANGELOG.md`](CHANGELOG.md).
2. Run `npm test` (also runs automatically via `prepublishOnly`).
3. Check what will be published: `npm run pack:check`.
4. Publish to npm: `npm login`, then `npm run publish:npm`.
5. Publish to GitHub Packages: authenticate to `https://npm.pkg.github.com` with a classic PAT that has `write:packages` (see GitHub’s npm registry docs), then `npm run publish:github`.

A change to the default configuration or to how choices are derived from the seed changes the output for existing inputs, so treat it as at least a `minor` release.

## License

[MIT](LICENSE)
