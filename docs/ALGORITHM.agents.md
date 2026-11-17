# quirky-slugger: algorithm specification (for agents and maintainers)

Exact behaviour of `index.js`, `quirky-slugger.config.json` and the language packs in `langs/`. Written to be unambiguous and to be checked against the code. For a narrative version see [`ALGORITHM.md`](ALGORITHM.md). For how to make changes see [`../AGENTS.md`](../AGENTS.md).

Function names are given instead of line numbers because lines drift. Search `index.js` for the identifier.

## 0. Contract

```
quirkySlug(keywords, text?, options?) -> { slug: string, title: string }
explain(keywords, text?, options?)    -> ExplainResult   (superset; same slug and title)
keywordWeights(keywords, text?, options?) -> [{ keyword, weight }]
slugify(string) -> string
```

- Exports: `module.exports = quirkySlug` with properties `quirkySlug`, `keywordWeights`, `explain`, `slugify`.
- CommonJS, `'use strict'`, Node >= 14, **no runtime dependencies** (only the built-ins `fs` and `path`, plus the config JSON).
- `slugify` here is a local helper in `index.js`, not the npm package of that name.
- **Pure and deterministic.** No `Math.random`, no `Date`, no network, no global state. The result is a function of `(keywords, truncated text, options.seed, merged config, options.quirks)`, where the merged config includes the language pack.
- Errors: a `TypeError` with message prefix `quirky-slugger:` for no keywords, empty/invalid `patterns`, a pattern without a non-empty `templates` array, or a non-array `quirkyTemplates`. A missing config file path throws the underlying `fs` error. Invalid JSON throws `SyntaxError`.

### Options

| Option | Type | Effect |
| --- | --- | --- |
| `lang` | string | Language pack code, `/^[a-z]{2}(-[a-z0-9]+)?$/i`. Wins over `config.lang`. Default `"en"`. Invalid code or missing file → `TypeError`. |
| `langsDir` | string | Folder holding `{lang}.json` packs. Relative paths resolve against `process.cwd()`. Default: the bundled `langs/`. |
| `config` | object or string | An object, or a path to a JSON file read with `fs.readFileSync` on **every call**. |
| `quirks` | boolean | If not `undefined`, overrides `config.quirks`. |
| `seed` | string or number | If not `undefined`, not `null` and not `''`, appended to the seed string (see 3). Numbers are stringified. `0` counts as set. |

### `ExplainResult`

```
slug, title                          strings
lang                                 language code used (lowercase)
pattern                              id of the chosen pattern, or null if the pattern has no id
score                                cosine score of the chosen pattern; 0 when usedFallback
usedFallback                         boolean
scores                               [{ id, score }] for ALL patterns, sorted by score descending
candidates                           [{ id, score, share }]; shares sum to 1
template                             the raw template string chosen
sharedTemplate                       boolean (shared pool used)
connectTemplate                      boolean (connecting pool used)
connectors                           { connect?, connecting?, connection?, connected? } words used
quirksMode                           boolean, effective setting
quirky                               boolean, a quirky list was chosen
quirkFactor                          number, effective (clamped 0..1)
joiner                               the list joiner used this call: config.joiner or a joinerVariants entry (5.6)
pluralFactor                         number, effective (clamped 0..1)
plurals                              original keywords that gained a trailing s this call (5.6)
seed                                 string or null
adjective, suffix, number, top       string or undefined; set only if the template used the placeholder
keywords                             [{ keyword, weight }]
wordsUsed, wordsIgnored              integers
truncated, untruncatedSlug           whether maxSlugLength shortened the slug; the full slug
```

An unused `adjective`, `suffix`, `number` or `top` is `undefined`, not `''`.

## 1. Configuration

### 1.1 Merge

`loadConfig(options)`:

1. Read `options.config` (path or object) as `user`, else `{}`.
2. Resolve `lang` from `options.lang`, else `user.lang`, else `defaultConfig.lang` (`en`). Load `langs/{lang}.json` (or `{langsDir}/{lang}.json`). Unknown code → `TypeError`.
3. `config = Object.assign({}, defaultConfig, pack, user)`. Shallow merge: a supplied `quirkyModifiers`, `connectors` or `patterns` replaces the previous object as a whole.
4. If `user.patterns !== undefined`, each of `sharedTemplates`, `sharedQuirkyTemplates`, `connectTemplates` and `connectQuirkyTemplates` is set to `[]` **unless the user supplied that key**.
5. Validate `patterns`. Set `config.lang` to the resolved code.

Language support is **rudimentary**: packs are demos; proper localisation is left as an exercise for other quirky sluggers. `locale` on the pack drives title-case mode, a/an, and optional `joinerAlt` (Spanish y→e).

`defaultConfig` is the algorithm JSON only and is not mutated.

### 1.2 Keys, types and defaults

Defaults below come from `quirky-slugger.config.json` (algorithm settings) and `langs/en.json` (content). Counts are for the English pack. Every `...Factor` is clamped to 0..1 by `clamp01`, and a non-number (`undefined`, `NaN`, a non-numeric string) counts as 0.

| Key | Default | Type and use |
| --- | --- | --- |
| `lang` | `"en"` | string. Pack used when `options.lang` is absent. |
| `maxWords` | 256 | int. Text is truncated to this many whitespace-separated words. |
| `maxSlugLength` | 60 | int. Falsy disables truncation. |
| `joiner` | `"and"` | string. Word before the last list item. `""` gives comma-only lists. |
| `joinerVariants` | `["and the"]` (en only) | string[]. Alternative joiners; see 5.6. Absent or empty disables variants. |
| `joinerVariantFactor` | 0.25 | 0..1. Chance of using a variant instead of `joiner`. |
| `pluralFactor` | 0.3 | 0..1. Per eligible keyword, the chance of a trailing `s` in the slug and the title. See 5.6. |
| `keywordWeight` | 2 | number. Multiplier for the keyword boost (4.2). |
| `minScore` | 0 | number. A pattern must score strictly above this. |
| `patternSpread` | 0.2 | 0..1. Candidate threshold as a fraction of the best score. **If the key is `undefined` the code uses 1**, but the default file sets 0.2. |
| `sharedFactor` | 0.25 | 0..1. Chance of the shared pool. |
| `connectFactor` | 0.4 | 0..1. Chance of the connecting pool (two or more keywords). |
| `quirks` | `false` | boolean. |
| `quirkFactor` | 0.7 | 0..1. Chance that quirks mode actually goes quirky for this call. A missing or invalid value counts as 0, so quirky templates are never used. |
| `numbers` | `["2", "3", "5", "two", "three", "five"]` | strings `{n}` picks from. A digit or a word. Always in the pool. German: `zwei`, `drei`, `fünf`. Spanish: `dos`, `tres`, `cinco`. |
| `quirkyNumbers` | `["42", "A bunch", "Sneaky"]` | strings. Appended to the `{n}` pool only when `quirkRoll` is true. Slugified with the rest of the slug; title-cased in the title. |
| `quirkyModifiers` | `{ adjectives[22], suffixes[18] }` | strings, hyphenated multi-word values. |
| `connectors` | `{ verbs[17], gerunds[16], nouns[16], participles[22] }` | see 6.3. |
| `stopWords` | 36 words | folded with `fold` before use. |
| `sharedTemplates` | 11 | templates for any pattern, plain mode. |
| `sharedQuirkyTemplates` | 12 | quirks mode. |
| `connectTemplates` | 23 | templates that join/compare keywords, plain. |
| `connectQuirkyTemplates` | 14 | quirks mode. |
| `patterns` | 29 | see 1.3. |
| `locale` | see 1.4 | pack-level rendering rules (title case, `a`/`an`, joiner alternate). |


### 1.3 Pattern

```
{ id?: string, triggers?: string[], templates: string[] (non-empty), quirkyTemplates?: string[] }
```

- Pattern with no `triggers` or `[]` is **generic**.
- If `id` is missing, `scores[].id` is `pattern-<index>` but `explain().pattern` is `null` (a known inconsistency).
- Default ids, in order: `history`, `recipe`, `review`, `howto`, `list`, `connection`, `comparison`, `news`, `food`, `comfort`, `explainer`, `opinion`, `tips`, `personal`, `travel`, `tech`, `health`, `nature`, `people`, `place`, `science`, `culture`, `society`, `statistics`, `sport`, `objects` (26 with triggers), then generic `default`, `spotlight`, `essentials`.
- Subject ids (`history`, `nature`, `people`, `place`, `science`, `statistics`, `sport`, `objects`, `culture`, `society`, `food`, `health`, `tech`) describe what the text is about. Each has its own templates, so a history title does not read like a nature title or a statistics title, and two unrelated topics still parse. Voice ids (`recipe`, `review`, `howto`, `list`, `news`, `opinion`, `tips`, `personal`, `comfort`, `travel`) describe a way of writing. Their triggers avoid words that ordinary encyclopedia prose uses in passing (`how`, `new`, `system`, `life`). `connection` and `comparison` join the keywords. `explainer` is for causal prose.

### 1.4 `locale`

Optional object on a language pack. Every field is optional. When absent: `titleCase` is `en`, `smallWords` is the English set, `article` rules are off (only `en-a-an` turns them on), and there is no `joinerAlt`.

| Field | Values | Effect |
| --- | --- | --- |
| `id`, `label` | strings | Identification. `label` is shown by the example site's language dropdown. |
| `titleCase` | `"en"` (default), `"de"`, `"es"` | `en` and `de`: capitalise every word except `smallWords` in the middle. `es`: sentence style, only the first word and words after `: ! ?` are capitalised. See 5.5. |
| `smallWords` | string[] | Words kept lowercase mid-title. Empty or absent → the English `SMALL_WORDS`. |
| `article` | `"en-a-an"`, `"none"` | `en-a-an` enables the literal `a-` → `an-` rule (5.4). Anything else disables it. |
| `joinerAlt` | `null` or `{ whenNextStartsWith: string[], use: string }` | If the item after the joiner starts with one of the prefixes (compared after accent-stripping, lowercasing and removing non-alphanumerics), `use` replaces the joiner. Spanish `y` → `e` before `i`/`hi`. |

### 1.5 Template grammar

A template is a string of lowercase letters, digits, hyphens, punctuation `, : ; ? ! '`, and placeholders. Placeholders (regex, as used in `index.js`):

```
\{(kw\d*|rest|n|top|adj|suffix|connect|connecting|connection|connected)\}
```

| Placeholder | Value | Salt |
| --- | --- | --- |
| `{kw}` | all keywords, joined by `joinForSlug` (slug) or `joinForTitle` (title), using the joiner chosen in 5.6 | `\|joiner-var`, `\|joiner-pick` (once per call, not per placeholder) |
| `{kwN}` | Nth keyword (1-based); `''` if out of range | none |
| `{rest}` | all keywords except the first, joined as above | none |
| `{n}` | `String(pick(numberPool, '\|n'))` or `''`. `numberPool` is `numbers`, plus `quirkyNumbers` when `quirkRoll` is true | `\|n` |
| `{top}` | see 5.3; `''` if none | none |
| `{adj}` | `pick(quirkyModifiers.adjectives, '\|adj')` or `''` | `\|adj` |
| `{suffix}` | `pick(quirkyModifiers.suffixes, '\|suffix')` or `''` | `\|suffix` |
| `{connect}` | `pick(connectors.verbs, '\|c-verb')` | `\|c-verb` |
| `{connecting}` | `pick(connectors.gerunds, '\|c-ing')` | `\|c-ing` |
| `{connection}` | `pick(connectors.nouns, '\|c-noun')` | `\|c-noun` |
| `{connected}` | `pick(connectors.participles, '\|c-past')` | `\|c-past` |

A placeholder repeated in one template yields the **same** word each time, because `pick` is a pure function of `seed + salt`.

Hyphens inside `{adj}`, `{suffix}`, connectors and `{kw}` list values become spaces in the title (`rabbit-hole` becomes `rabbit hole`). Hyphens inside keywords were already normalised: keywords for the slug go through `slugify`, keywords for the title keep their wording (`kwTitles` = keyword with whitespace collapsed).

## 2. Text primitives

| Function | Definition |
| --- | --- |
| `stripAccents(s)` | `String(s).normalize('NFKD')` then remove `U+0300..U+036F`. |
| `tokenize(s)` | `stripAccents(s).toLowerCase().match(/[a-z0-9]+/g) or []`. Non-Latin letters are separators. |
| `slugify(s)` | `stripAccents(s).toLowerCase()`, then `[^a-z0-9]+` becomes `-`, then trim leading/trailing `-`. |
| `fold(token)` | Stemmer, see below. |
| `hash(s)` | djb2-style `h = ((h*33) ^ charCode) >>> 0` from `h = 5381`, then the murmur3 finaliser (`h ^= h>>>16; h = imul(h, 0x85ebca6b)>>>0; h ^= h>>>13; h = imul(h, 0xc2b2ae35)>>>0; h ^= h>>>16`), returned as uint32. |
| `truncateSlug(slug, max)` | If `!max` or `len <= max`: unchanged. Otherwise cut to `max`; if the character at `slug[max]` is not `-`, back up to the last `-` in the cut (if `> 0`); strip trailing `-`. |

### 2.1 `fold` (applied in this order, exactly one of the first five branches, then the final `e` rule)

1. `len > 4` and ends `ies`: replace with `y`.
2. else `len > 5` and ends `ing`: drop `ing`.
3. else `len > 4` and ends `ed`: drop `ed`.
4. else `len > 4` and matches `/(?:s|x|z|ch|sh|o)es$/`: drop `es`.
5. else `len > 3`, ends `s`, and does not match `/(?:ss|us|is)$/`: drop `s`.
6. Then, if `len > 3` and ends `e`: drop `e`.

Consequences to remember: `baked` becomes `bak`, `bake` becomes `bak`, `baking` becomes `bak`, `beans` becomes `bean`, `tomatoes` becomes `tomato`, `recipes` becomes `recip`, `recipe` becomes `recip`, `toast` stays `toast`. Folding is lossy and never displayed. `origOf` remembers the first raw word seen for each stem so `{top}` can show a real word.

## 3. Seed, `pick`, `chance`

```
seed   = kws.join(',') + '|' + words.join(' ') + (hasSeed ? '|seed:' + options.seed : '')
pick(list, salt) = list[ hash(seed + salt) % list.length ]
chance(salt)     = hash(seed + salt) / 4294967296        // [0, 1)
```

`words` is the truncated text split on whitespace (original casing and punctuation), not the tokens. Consequences:

- Changing the text by one character, or the keyword order, changes the seed and so every choice.
- **`pick` depends on list order and length.** Adding, removing or reordering any template or word list changes results for existing inputs.
- Each choice has its own salt, so choices are independent of each other.

### 3.1 Salt table

| Salt | Used by | Decision |
| --- | --- | --- |
| `\|pattern` | `pick` over fallback candidates, or `chance` for weighted choice | pattern |
| `\|quirk` | `chance` | quirky vs plain list (only evaluated when quirks is on and a quirky list exists) |
| `\|connect` | `chance` | connecting pool vs normal (only evaluated when `kws.length >= 2` and the pool is non-empty) |
| `\|shared` | `chance` | shared pool vs the pattern's own |
| `\|joiner-var` | `chance` | use a joiner variant instead of `joiner` (compared with `joinerVariantFactor`; only evaluated when variants exist and the factor is above 0) |
| `\|joiner-pick` | `chance` | which variant: `variants[floor(chance * variants.length)]` |
| `\|plural\|i` | `chance` | pluralize keyword `i` (compared with `pluralFactor`; only evaluated when that keyword is eligible and the factor is above 0) |
| `\|ct` / `\|cq` | `pick` | template from `connectPlain` / `connectQuirky` |
| `\|st` / `\|sq` | `pick` | template from `sharedPlain` / `sharedQuirky` |
| `\|t` / `\|qt` | `pick` | template from the pattern's plain / quirky list |
| `\|adj`, `\|suffix`, `\|n` | `pick` | placeholder values |
| `\|c-verb`, `\|c-ing`, `\|c-noun`, `\|c-past` | `pick` | connector words |

**Renaming a salt or changing the seed format is a breaking change for all stored outputs.** Do it only deliberately, and note it in `CHANGELOG.md`.

## 4. Matching

### 4.1 Tokens

```
words      = text.split(/\s+/).filter(Boolean).slice(0, maxWords)
textTokens = tokenize(words.join(' ')).map(fold), minus tokens in stop (stop = stopWords.map(w => fold(w.toLowerCase())))
kwTokens   = set of fold(token) for every token of every keyword      (keywords are NOT stop-word filtered)
```

### 4.2 Keyword weights (`weighKeywords`)

```
kwTokenSets[i] = Set(tokenize(keyword_i).map(fold))
sentences      = words.join(' ').split(/(?<=[.!?])\s+/).filter(Boolean)
current = -1; counts = [0..]
for each sentence:
  tokens = tokenize(sentence).map(fold)            // stop words are NOT removed here
  mentionsCurrent = current >= 0 and any token is in kwTokenSets[current]
  if not mentionsCurrent:
     for each token in order: idx = first i with token in kwTokenSets[i]; if idx >= 0: current = idx; break
  if current >= 0: counts[current] += sentence.split(/\s+/).length
weights = counts / sum(counts)      // or 1/n each if sum is 0
```

- A keyword "is mentioned" if **any one** of its tokens appears (`baked` or `beans` for `baked beans`).
- Sentences before the first mention are ignored. Sentences with no mention are attributed to the current keyword.
- When several keywords share a token, the first in keyword order wins.
- The regex lookbehind requires Node >= 10 (satisfied by `engines`).

### 4.3 Term frequencies and the query vector

```
tf[t]     = number of occurrences of stem t in textTokens
boost_i   = keywordWeight * kws.length * weights[i]
for each keyword i, for each unique stem t of keyword i:  tf[t] += boost_i
query[t]  = tf[t] * idf(t)
```

With equal weights, `boost_i = keywordWeight`.

### 4.4 IDF over patterns (`buildIdf`)

```
df(t)  = number of patterns whose set of folded trigger tokens contains t
idf(t) = ln((N + 1) / (df(t) + 1)) + 1          N = patterns.length; df = 0 for unseen terms
```

Trigger strings are tokenised, so a multi-word trigger contributes each word separately.

### 4.5 Pattern vector and score

```
vec_p[t] = idf(t)  for each unique folded trigger token t of pattern p   (binary tf)
score_p  = cosine(query, vec_p) = dot / (|query| * |vec_p|), 0 if either norm is 0
```

Because `|query|` includes **every** text term, long or unrelated text lowers all scores. Because `|vec_p|` includes **every** trigger, triggers absent from the text raise the denominator and lower `score_p` without adding to the dot product. Growing a pattern from n to N unique triggers with no new overlaps multiplies its score by about `sqrt(n/N)`, assuming similar IDF. Only relative scores matter. Default trigger counts: 295 strings across 26 patterns; `food` has 30; `default`, `spotlight` and `essentials` have none.

### 4.6 Pattern choice

```
bestScore    = max(minScore, max_p score_p)
usedFallback = no pattern has score > minScore
```

- **Fallback:** `generic` = patterns with empty or missing triggers (or `[patterns[0]]` if none). `candidates` = those with `share = 1/n`, `score = 0`. Chosen by `pick(candidates, '|pattern')`.
- **Otherwise:** `candidates` = patterns with `score > minScore` and `score >= bestScore * spread`, `spread = clamp01(patternSpread)` (`undefined` means 1). `share = score / sum(candidate scores)`. `roll = chance('|pattern')`; walk candidates in **config order**, `roll -= share`, and choose the first with `roll < 0` (the last if rounding leaves none).

`scores` in the result lists every pattern; `candidates` lists those that could win.

## 5. Template choice and rendering

### 5.1 Eligibility

```
needs(t) = max( (t has {rest} or {connect|connecting|connection|connected}) ? 2 : 1,
                max N over {kwN} in t )
usable(list) = list.filter(t => needs(t) <= kws.length)          // kws = parsed keyword list
plainList    = usable(best.templates) if non-empty else best.templates   // fallback keeps all
quirkyList   = usable(best.quirkyTemplates)
sharedPlain, sharedQuirky, connectPlain, connectQuirky = usable(config.<pool>)
```

`needs` counts parsed keywords (`kws`), not slugs. Templates using only `{kw}` have `needs = 1`, so `connectTemplates` entries such as `what-do-{kw}-have-in-common?` are gated by the separate `kws.length >= 2` test below, not by `needs`.

### 5.2 Decision order

```
quirkRoll      = Boolean(quirks) && chance('|quirk') < quirkFactor
useQuirky      = quirkRoll && (quirkyList.length > 0 || sharedQuirky.length > 0)
numberPool     = quirkRoll ? numbers.concat(quirkyNumbers) : numbers
own            = useQuirky ? (quirkyList.length ? quirkyList : plainList) : plainList
shared         = useQuirky ? sharedQuirky : sharedPlain
connectList    = useQuirky ? connectQuirky : connectPlain

fromConnect    = kws.length >= 2 && connectList.length > 0 && chance('|connect') < connectFactor
fromShared     = !fromConnect && shared.length > 0 && (own.length === 0 || chance('|shared') < sharedFactor)
template       = fromConnect  ? pick(connectList, useQuirky ? '|cq' : '|ct')
               : fromShared   ? pick(shared,      useQuirky ? '|sq' : '|st')
               :                pick(own,         useQuirky ? '|qt' : '|t')
```

Notes:

- If only `connectQuirkyTemplates` exist, quirks still cannot activate through connect alone (keeps `own` safe).
- If `useQuirky` and `quirkyList` is empty but `sharedQuirky` is not, then `own.length === 0` forces `fromShared`.
- `pick(own, ...)` would throw on an empty list. `own` cannot be empty when `useQuirky` is false (`plainList` falls back to all templates, and `templates` is validated non-empty).
- The connecting pool is an **override**, checked before shared. Its probability is `connectFactor` over all inputs with two or more keywords, independent of pattern.

### 5.3 `{top}`

The non-keyword stem with the highest `tf` (first one wins ties, in token order), among stems whose real word has length >= 3 and is not all digits; the displayed value is `origOf.get(stem)` (the first raw form seen, lowercase). Empty string if there is none.

### 5.4 Rendering

1. Split the template on the placeholder regex into literal and placeholder parts.
2. **a/an:** only when `locale.article === 'en-a-an'`. For a literal part that matches `/(^|-)a-$/` and is immediately followed by a placeholder whose slug value `startsWithVowelSound`, replace the trailing `a-` with `an-`. Vowel sound regex: `/^(?:[aei]|o(?!ne\b|nce\b)|u(?!ni|s[ei]|ti|ro))/` (so `an hour`-type silent-h words are not handled; `a union`, `a one-off`, `an overlap`, `an alliance` are).
3. **Slug:** `full = slugify(render(false))`, `slug = truncateSlug(full, maxSlugLength)`. List placeholders use `joinForSlug`; the joiner goes through `slugify`; an empty/unsluggable joiner yields plain hyphens.
4. **Title:** each placeholder rendered with `forTitle = true`; literal parts have `-` replaced by spaces and the `CONTRACTIONS` map applied (`dont`, `doesnt`, `didnt`, `isnt`, `cant`, `wont`, `youre`, `youll`, `whats`, `thats`, matched on word boundaries). Then collapse whitespace, remove whitespace before `, ; : ! ?`, trim, and apply `titleCase`.
5. The title is not truncated.

### 5.5 `titleCase`

Mode and small words come from `locale` (1.4). Split on single spaces. For word `w` at index `i`:

- If `w` contains an uppercase letter, keep it as is.
- Mode `es`: capitalise the first character only if `i === 0` or the previous word ends in `: ! ?`; otherwise keep it as is.
- Modes `en` and `de`: if `0 < i < last`, the previous word does not end in `: ! ?`, and `w` without trailing `, ; : ! ?` (lowercased) is in the small-word set, keep it lowercase. Otherwise capitalise the first character.

The small-word set is `locale.smallWords` when it is a non-empty array, else `SMALL_WORDS` = `a an and as at but by for in nor of on or the to vs with from into onto than via`.

### 5.6 Keyword lists and the joiner (`chooseJoiner`, `pickJoiner`, `joinForTitle`, `joinForSlug`)

**Which joiner** (`chooseJoiner`, once per call, before any template is chosen):

```
base     = config.joiner (default "and" when null/undefined), as a string
variants = config.joinerVariants as non-empty strings (else [])
factor   = clamp01(config.joinerVariantFactor)
if variants is empty or factor <= 0 or chance('|joiner-var') >= factor:  joiner = base
else joiner = variants[ floor(chance('|joiner-pick') * variants.length) ]
```

**Plurals** (`pluralFactor`, once per keyword, before joining). If `clamp01(pluralFactor)` is above 0 and `chance('|plural|' + i)` is below it, keyword `i` gains a trailing `s` in both the slug and the title. A keyword is eligible when its last letter (accents stripped) is not `s` and not a vowel `a e i o u y`. So `toast` can become `toasts`, while `baked beans`, `tea`, `city` and `quokka` stay as written. The roll is independent for each keyword. `explain().plurals` lists the original keywords that were pluralized. `explain().keywords` stays the words as given.

**Joining.** For one item, the item. With the joiner empty: items joined by `, ` (title) or `-` (slug). Otherwise `a, b joiner c` (title) and `a-b-joiner-c` (slug): the joiner appears **only** before the last item, and never when there is one item. `{rest}` applies the same function to `keywords.slice(1)`, so for two keywords `{rest}` is just the second keyword.

**Joiner alternate** (`pickJoiner`, applied at each join, so it sees the last item): if `locale.joinerAlt` is set and the last item (normalised as in 1.4) starts with one of its prefixes, `joinerAlt.use` replaces the joiner. Both are then slugified for the slug.

## 6. Default data

### 6.1 Pools

Sizes are those of the English pack, `langs/en.json`: 162 plain and 144 quirky pattern templates, 11 + 12 shared, 23 + 14 connecting. The `connection` pattern deliberately repeats several connecting-pool templates (5 plain, 2 quirky) so it leans on connector words when it wins; no other template appears twice among the options available to one pattern in one mode. `de` and `es` follow the same shape with slightly different counts.

### 6.2 Which placeholders each pool uses

- Plain pattern and shared templates use `{kw}`, `{kwN}`, `{rest}`, `{n}`, `{top}` (rare), and the connector placeholders (the `connection` pattern).
- Quirky templates may also use `{adj}` and `{suffix}`.
- Connecting templates use `{kw}`, `{kw1}`, `{rest}`, and the connector placeholders. Plain connecting templates have no `{adj}` or `{suffix}`.

### 6.3 Connector lists

Four lists, one per grammatical frame, so every word fits its slot:

| List | Frame | Used as |
| --- | --- | --- |
| `verbs` | base verb taking `{kw}` as object | `how-to-{connect}-{kw}`, `can-you-{connect}-{kw}?` |
| `gerunds` | `-ing` form taking `{kw}` | `{connecting}-{kw}`, `the-art-of-{connecting}-{kw}` |
| `nouns` | singular noun that works after `a` / `the` and before `between` | `the-{connection}-between-{kw}`, `a-{connection}-between-{kw}` |
| `participles` | past participle **including its preposition** | `{kw1}-{connected}-{rest}` |

Do not put a word in a list unless it fits every template using that placeholder. Avoid verbs that need to agree with a keyword subject (singular or plural is unknown).

## 7. Invariants (do not break)

1. **Determinism.** Same inputs, same outputs. Nothing random or time-dependent.
2. **`slug === truncateSlug(slugify(filled template))`.** The title uses the same template and the same chosen words as the slug.
3. **Keyword order.** Keywords appear in the order given. Because the slug is cut on a word boundary at `maxSlugLength`, trailing words can be removed from the slug. The title is never cut.
4. **Joiner position.** The joiner word appears only before the last item of a list.
5. **`needs` gating.** A template needing more keywords than supplied is never chosen unless the pattern has no usable plain templates at all.
6. **No empty-list `pick`.** Every `pick` is guarded by a non-empty check or by validation.
7. **Independence of choices.** Each decision has its own salt.
8. **Config immutability.** The default config object is never mutated.
9. **No dependencies.** Do not add runtime dependencies.
10. **`explain()` and `quirkySlug()` agree.** `quirkySlug` is `explain` reduced to `{ slug, title }`.

## 8. Known quirks and sharp edges

- **Stemming merges keyword and trigger.** `baked beans` stems to `bak bean`, and the `recipe` trigger `bake` also stems to `bak`, so the keyword nudges text towards `recipe`.
- **Overlapping keyword tokens** (for example `tea` and `iced tea`) share weight attribution by order.
- **Duplicate keywords** are not de-duplicated.
- **Unsluggable keywords** (for example `"!!!"` or non-Latin text): `kwSlugs` filters them out, but `needs` and the title still count them, so `{kwN}` indices can shift in the slug. Avoid such keywords, or filter them before calling.
- **Invalid factors count as 0.** `quirkFactor`, `sharedFactor`, `connectFactor`, `joinerVariantFactor`, `pluralFactor` and a supplied `patternSpread` go through `clamp01`: a missing or non-numeric value silently turns that feature off (or, for `patternSpread`, makes every positive-scoring pattern a candidate).
- **`minScore`** applies to candidate selection and the fallback test, not to the displayed `scores`.
- **A custom config is read and validated on every call**, including re-reading a file path. Cache the object yourself in hot loops.
- **Template characters.** Only `[a-z0-9{}.,:;?!'-]` are allowed in default templates (enforced by `test.js`). A `'` inside a template is kept in the title but dropped from the slug.
- **Grammar relies on template authoring.** Several default templates end without a colon where a colon would read better (`... What You Need to Know`). Fixing wording is a config-only change, but it changes the output for inputs that select that template.
- **Silent-h and some other `a`/`an` cases** (`an hour`, `an MBA`) are not handled by `startsWithVowelSound`.
- **Performance** is `O(patterns x terms)` per call plus one config load. The language pack is read and parsed from disk on every call; nothing is cached, so editing a pack takes effect immediately and a hot loop should pass its own `options.config` object rather than rely on repeated loads.

## 9. Test expectations that depend on data

`test.js` pins behaviour in two ways. Know which kind you are about to break.

1. **Pinned wrapper.** Most tests call a wrapper that adds `{ patternSpread: 1, sharedFactor: 0, connectFactor: 0, joinerVariantFactor: 0, pluralFactor: 0 }` to the config so the best pattern always wins, no pool is mixed in, the joiner is always the plain `and`, and keywords are not pluralized. These tests depend on triggers and templates, not on pool contents.
2. **Statistical surveys** run `explain` over hundreds of seeds (`v0`..`v299`, `c0`..`c399`, `w0`..`w1999`) against the control text and assert thresholds. They fail if the default data shrinks or loses variety. Current thresholds:

| Assertion | Threshold |
| --- | --- |
| Distinct patterns for the control text (300 seeds) | >= 3, none of them `default` |
| `food` wins more often than `comfort` | strictly greater |
| Distinct plain titles / templates | >= 30 / >= 20 |
| Distinct quirky titles | >= 120, and more than 1.5 x the plain count |
| Generic fallback patterns for meaningless text | >= 3, all generic |
| Connecting templates used at `connectFactor: 1` | >= 15 |
| Distinct connector words over 2000 seeds | >= 40 |
| Share of connecting templates at default `connectFactor` (400 seeds) | between 30% and 50% |

Also asserted: weights of the control text are about 50%, 40% and 10% (within 0.02), every default template contains only known placeholders and allowed characters, and a custom `patterns` list does not inherit any pool.
