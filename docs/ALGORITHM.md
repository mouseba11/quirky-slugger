# How quirky-slugger works

This is the plain-language guide. If you are an AI agent or you need the exact formulas, seed rules and data shapes, read [`ALGORITHM.agents.md`](ALGORITHM.agents.md) instead.

## The idea in one minute

You give it some **keywords** (the themes) and some **text** (the context). It answers two questions:

1. **What kind of title suits this text?** A recipe, a review, a history, a comparison...
2. **How should the keywords be woven into it?** Listed, linked together, compared, or dressed up with a quirky adjective.

It answers the first by comparing your text with a list of **patterns**, each described by a few **trigger words**. It answers the second by picking a **template** (a title shape with gaps) from the winning pattern and filling the gaps with your keywords.

```
keywords + text
      |
      v
 1. clean up the words ───────────── lowercase, drop filler words, merge word forms
      |
      v
 2. weigh the keywords ───────────── who gets how much of the text?
      |
      v
 3. score every pattern ──────────── how well does the text match each one?
      |
      v
 4. choose a pattern ─────────────── best match usually, close runners-up sometimes
      |
      v
 5. choose a template ────────────── plain, quirky, shared, or connecting
      |
      v
 6. fill in the gaps ─────────────── keywords, adjectives, numbers, connector words
      |
      v
 7. build the slug and the title
```

Everything is local and deterministic. The "random" choices are made by a hash of the input, so the same input always gives the same output. Pass a different `seed` to get a different choice.

## Key terms

| Term | Meaning |
| --- | --- |
| **Keyword** | A theme you want in the title, such as `baked beans`. Appears in the title as given. |
| **Text** | Up to 256 words of context. It steers the choice of pattern but never appears in the title. |
| **Pattern** | A kind of title, such as `recipe` or `comparison`, with trigger words and templates. |
| **Trigger** | A word that pulls text towards a pattern, such as `oven` for `recipe`. |
| **Template** | A title shape with gaps: `the-{adj}-history-of-{kw}`. |
| **Placeholder** | A gap in a template, such as `{kw}` (the keywords) or `{adj}` (an adjective). |
| **Control set** | The full list of patterns. It is the `patterns` key in the config. |
| **Generic pattern** | A pattern with no triggers. Used when the text matches nothing. |
| **Pool** | A list of templates not tied to one pattern: the *shared* and *connecting* pools. |
| **Seed** | A string that varies the choices without making them random. |
| **Quirks mode** | An option that mixes in quirky templates using adjectives and playful endings. |

## Step by step

### 1. Clean up the words

The text is cut to the first 256 words (`maxWords`). Keywords and text are lowercased, accents are removed (`crème` becomes `creme`), and everything that is not a letter or number is treated as a separator.

Filler words (`the`, `and`, `of`, `it`...) are dropped using the `stopWords` list.

Words are then **stemmed**, which means reduced to a rough root so different forms of a word count as the same. `beans` and `bean` match. So do `bake`, `baked` and `baking`, and `recipe` and `recipes`. The stems are only used for matching. They never appear in the output.

### 2. Weigh the keywords

Each keyword gets a share of the text, and the shares add up to 100%. The rule is simple: **a keyword owns the text from the first sentence that mentions it up to the sentence where the next keyword takes over.**

```
Baked beans belong at the centre of breakfast...      <- "baked beans" starts here
...cooked slowly in tomato until the sauce is thick.   <- still baked beans
Toast has to keep up: cut thick, browned, buttered.    <- "toast" takes over here
Tea closes it quietly.                                  <- "tea" takes over here
```

A sentence that mentions no keyword belongs to whichever keyword came before. A sentence before the first mention counts for nothing. If no keyword is mentioned at all, they all get an equal share.

In the example above the weights come out at about 47% baked beans, 40% toast and 13% tea. You can see them with `keywordWeights()`.

These weights decide how loudly each keyword speaks when the text is matched against the patterns (next step). They do **not** change the order of keywords in the title, and all keywords always appear.

### 3. Score every pattern

This is the core of the matching. It uses a classic technique called **TF-IDF with cosine similarity**. Here is what that means without the maths.

- Each pattern is turned into a list of its trigger words, each with a **rarity** value. A trigger that appears in only one pattern (`oven`) is worth more than one shared by several patterns. This is the *IDF* part.
- The text is turned into a list of its words with a **count** for each. This is the *TF* part. Each keyword's words get a bonus count in proportion to its share of the text, multiplied by `keywordWeight`. A keyword that owns half the text gets a much bigger bonus than one that owns a tenth.
- The **cosine similarity** measures how closely the two lists point in the same direction. It returns a number between 0 (nothing in common) and 1 (identical). Only words that appear on both sides add to the score.

The result is one score per pattern. A pattern does not recognise a topic. It scores only the trigger words that also appear in the text, after stemming. On the baked beans sample, `food` leads because the text contains *breakfast*, *tomato*, *sauce*, *butter*, *milk*, *salt*, *savoury*, *crisp*, *fork*, *plate*, *mug* and *eat*. `recipe` matches *cooked* and *baked*, `comfort` matches *comfort* and *homemade*, and `opinion` matches *honest*. Every other default pattern shares nothing, so its score is 0.

Unused triggers dilute that score. Every trigger is part of the pattern's list, whether or not the text contains it, and the score is divided by the length of the whole list. The default `food` pattern has 30 triggers and scores about 0.167 on that sample. Stretching the same list to 500 triggers, with none of the new words in the text, drops it to about 0.041, and `recipe` (still about 0.106) becomes the stronger match. Add triggers the text is likely to contain. A long list of words the text never uses makes the pattern harder to win, not easier. The default control set has 312 trigger words across the 31 patterns that have any.

Long texts with lots of unrelated words get lower scores for the same reason: those words dilute the match. Scores like 0.12 are normal, and only the **relative** scores matter.

### 4. Choose a pattern

The best-scoring pattern does not always win outright. That would give you the same kind of title every time for similar text.

1. Any pattern scoring at least `patternSpread` (default 20%) of the best score becomes a **candidate**.
2. The candidates share the odds in proportion to their scores. If `recipe` scores 0.126 and `food` scores 0.081, `recipe` gets 61% of the odds and `food` gets 39%.
3. The seed picks one.

If **nothing** matches (no score above `minScore`), a generic pattern is picked at random instead: `default`, `spotlight` or `essentials`. That is why text that means nothing to the patterns still gets varied titles.

Set `patternSpread` to `1` to make the best match always win.

### 5. Choose a template

The chosen pattern has its own list of templates. Other pools can override it, checked in this order:

1. **The connecting pool.** If you gave two or more keywords, there is a `connectFactor` chance (default 40%) that the title joins or compares them instead, from `connectTemplates`: `The Link Between ...`, `How Do ... Compare?`, `... Paired with ...`.
2. **The shared pool.** Otherwise there is a `sharedFactor` chance (default 25%) of a template that suits any pattern, from `sharedTemplates`: `The Complete Guide to ...`, `Notes on ...`, `How to Get Started with ... in 3 Easy Steps`.
3. **The pattern's own templates.** Otherwise one of the winning pattern's own templates.

**Quirks mode** adds one more decision, made first. When it is on, there is a `quirkFactor` chance (default 70%) that every one of the choices above uses its *quirky* list instead of its plain list. So `quirkyTemplates`, `sharedQuirkyTemplates` and `connectQuirkyTemplates` replace their plain counterparts. The same chance adds `quirkyNumbers` to the `{n}` pool. The plain numbers stay in the pool either way.


Templates that need more keywords than you gave are skipped. A template using `{rest}` or any connector word is not available for a single keyword, so `Beans` never becomes `The Link Between Beans`.

### 6. Fill in the gaps

| Placeholder | Filled with |
| --- | --- |
| `{kw}` | All keywords as a list: `baked beans, toast and tea`. |
| `{kw1}`, `{kw2}`... | One keyword. |
| `{rest}` | All keywords except the first. |
| `{adj}` | An adjective from `quirkyModifiers.adjectives`: `peculiar`. |
| `{suffix}` | An ending from `quirkyModifiers.suffixes`: `rabbit-hole`. |
| `{n}` | A string from `numbers` (`3`, `three`), or from `numbers` plus `quirkyNumbers` (`42`, `A bunch`) when the quirk-factor roll hits. |
| `{top}` | The most common word in your text that is not a keyword. |
| `{connect}` | A connecting verb: `link`, `unite`, `pair`... |
| `{connecting}` | The `-ing` form: `linking`, `uniting`... |
| `{connection}` | A connecting noun: `bridge`, `overlap`, `common thread`... |
| `{connected}` | A participle with its preposition: `paired with`, `tied to`... |

The word in each gap is picked by the seed from the matching list, so each word form has its own list and the grammar always works. The connecting words are based on the synonyms for *connect* in a thesaurus.

The keyword list puts the word "and" (`joiner`) only before the **last** keyword: `baked beans, toast and tea`. Now and then (`joinerVariantFactor`, 25% by default) it uses a variant from `joinerVariants` instead, such as `and the`, which suits names: `Potatoes and the John Lloyd Experience`. Set `joinerVariantFactor` to `0` to always use the plain joiner. A literal `a` in a template becomes `an` before a vowel sound: `an accidental plot twist`, `a curious plot twist`.

**Plurals.** `pluralFactor` (default 0.3, labelled Plurals on the example site) is the chance that a keyword is shown in its English plural, in both the slug and the title. Each keyword is rolled on its own, and the same input and seed always roll the same way. Only the English pack pluralizes. German and Spanish keywords are never changed.

Only a single English word is changed, and it follows the usual spelling: `toast` becomes `toasts`, `city` becomes `cities`, `study` becomes `studies`, `analysis` becomes `analyses`, `jazz` becomes `jazzes`. A phrase such as `baked beans` or `protein folding` is left as written, because pluralizing its last word reads badly. An acronym or a mixed-case name (`CRISPR`, `iPhone`) is left as written. So are words that are not counted or that are already plural in form: `research`, `evidence`, `entropy`, `energy`, `mitochondria`, `bacteria`, `gravity`, `metabolism`. At `0`, nothing is pluralized. At `1`, every eligible keyword is. A single-word proper noun, such as `Napoleon`, can still take an `s`.

```js
quirkySlug('baked beans, toast, tea', text, { config: { pluralFactor: 1 } });
// title: '... Baked Beans, Toasts and Teas'
// baked beans is a phrase, so it is unchanged; toast and tea are single words
```

### 7. Build the slug and the title

The template is filled in once, then turned into two outputs.

- **The slug** is lowercased, with every run of non-letters and numbers turned into a single hyphen, and cut at `maxSlugLength` (60) on a word boundary so it never ends mid-word.
- **The title** keeps your keywords' own wording, turns the hyphens into spaces, restores a few apostrophes (`dont` becomes `don't`), and applies title case: small words like `of`, `the` and `to` stay lowercase unless they come first, last or after a colon. The title is never shortened.

## A worked example

Keywords: `baked beans, toast, tea`. Text (30 words):

> Baked beans belong at the centre of breakfast, thick and glossy in tomato sauce. Toast has to keep up: cut thick, browned, buttered while still hot. Tea closes it quietly.

1. **Weights:** baked beans 47%, toast 40%, tea 13%.
2. **Scores:** only two patterns match anything. `recipe` scores 0.126 and `food` scores 0.081.
3. **Candidates:** both pass the 20% test, so the odds are `recipe` 61% and `food` 39%.
4. **The seed decides.** With the seed `demo` the winner is `recipe`.
5. **Template pool:** the 40% connecting draw hits, so the template comes from `connectTemplates`: `a-{connection}-between-{kw}`.
6. **Gaps:** `{connection}` becomes `correlation`, and `a` stays `a` because `correlation` does not start with a vowel sound. `{kw}` becomes `baked beans, toast and the tea`: this seed also hits the 25% joiner-variant roll, so the last keyword gets `and the` instead of `and`. The plural rolls do not hit for `toast` or `tea`, so both stay singular. `baked beans` is a phrase and is never changed.
7. **Result:**

```js
quirkySlug('baked beans, toast, tea', text, { seed: 'demo' });
// -> { slug: 'a-correlation-between-baked-beans-toast-and-the-tea',
//      title: 'A Correlation Between Baked Beans, Toast and the Tea' }
```

With `joinerVariantFactor: 0` the same seed gives `A Correlation Between Baked Beans, Toast and Tea`. With `pluralFactor: 1` it gives `A Correlation Between Baked Beans, Toasts and the Teas` (`baked beans` is a phrase and stays as written). Other seeds on the same input give other titles, such as `Baked Beans, Toast and Tea Recipe Ideas`, `What to Eat: Baked Beans, Toast and Tea` and `Baked Beans vs Toast and Tea: Closer than You Think`.

## Why did I get this title?

Use `explain()`. It returns the weights, every pattern's score, the candidates and their odds, the template, and which pool it came from.

```js
const info = quirkySlug.explain('baked beans, toast, tea', text, { seed: 'demo' });
info.pattern;          // 'recipe'
info.candidates;       // [{ id: 'recipe', share: 0.61 }, { id: 'food', share: 0.39 }]
info.template;         // 'a-{connection}-between-{kw}'
info.connectTemplate;  // true
info.joiner;           // 'and the'
info.pluralFactor;     // 0.3
info.plurals;          // []  — toast and tea were eligible, this seed left both singular
```

The example site shows the same information on a web page. Pattern rows whose score displays as 0.000 are left out. Open Raw data to see every score.

## Behaviours worth knowing

- **Stemming applies to keywords too.** The keyword `baked beans` stems to `bak bean`, and `bak` is also what the `recipe` trigger `bake` stems to. So `baked beans` nudges the text towards `recipe` a little, even when the text never mentions a recipe. This is intended (the same effect makes `recipes` match `recipe`), but it is why a keyword that looks like a trigger can pull the pattern choice. Rename the trigger or the keyword if it is unwanted, or lower `keywordWeight`.
- **A keyword that is also a trigger forces its pattern.** Keywords are boosted heavily. Keep triggers to intent words (`recipe`, `review`, `breakfast`), not nouns likely to be keywords (`toast`).
- **The text never appears in the title.** Only the keywords do, plus `{top}` if a template uses it. Text influences which pattern and template are chosen.
- **A seed is not randomness.** The same input and seed always give the same result, on any machine. For a different result on every call, pass a changing seed such as `Math.random()`.
- **Changing the config changes the output.** The seed picks from lists by position, so adding or removing a template or word can change which one an existing input gets. Treat config changes as a `minor` release.
- **Custom control sets don't inherit the pools.** If you supply your own `patterns`, the shared and connecting template lists are emptied, because they are written for the default patterns.

## Tuning guide

| I want... | Change |
| --- | --- |
| The best-matching pattern to always win | `patternSpread: 1` |
| More variety between patterns | Lower `patternSpread` (`0.1`) |
| Titles that connect or compare the keywords more | Raise `connectFactor` |
| No connecting titles | `connectFactor: 0` |
| More generic, pattern-independent titles | Raise `sharedFactor` |
| Text to matter more or less than the keywords themselves | Change `keywordWeight` |
| More or less quirkiness | Change `quirkFactor` (quirks mode) |
| A new kind of title | Add a pattern with triggers and templates |
| A pattern to match the words you care about | Add those words to its triggers. Triggers the text never uses lower its score |
| More words for `{adj}`, `{suffix}` or connectors | Add them to `quirkyModifiers` or `connectors` |
| Always the plain joiner (`and`), never `and the` | `joinerVariantFactor: 0` |
| Keywords never pluralized | `pluralFactor: 0` |
| Fully predictable output for tests | `patternSpread: 1`, `sharedFactor: 0`, `connectFactor: 0`, `joinerVariantFactor: 0`, `pluralFactor: 0`, and a fixed seed |

## The default patterns

| Pattern | Triggered by (examples) | A title for `baked beans, toast` |
| --- | --- | --- |
| `history` | history, ancient, empire, dynasty, century, war | The History of Baked Beans and Toast |
| `recipe` | recipe, cook, bake, oven, kitchen, serve | How to Make Baked Beans and Toast |
| `review` | rating, verdict, pros, cons, tested | Baked Beans and Toast: Is It Worth It? |
| `howto` | step, guide, tutorial, install | How to Master Baked Beans and Toast |
| `list` | best, top, list, ranked, picks | Best Baked Beans and Toast |
| `connection` | connect, link, overlap, together | The Overlap Between Baked Beans and Toast |
| `comparison` | versus, compare, difference, alternative | Baked Beans and Toast: Which Is Better? |
| `news` | announced, breaking, update, launch | Baked Beans and Toast: The Latest |
| `food` | breakfast, lunch, tomato, butter, taste | The Joy of Baked Beans and Toast |
| `comfort` | comfort, classic, homemade, nostalgia | The Comfort of Baked Beans and Toast |
| `explainer` | reason, effect, explain, cause | The Science of Baked Beans and Toast |
| `opinion` | opinion, truth, overrated, myth, debate | The Truth About Baked Beans and Toast |
| `tips` | tip, trick, hack, mistake, shortcut | Tips for Baked Beans and Toast |
| `personal` | my, story, journey, memory, lesson | My Story with Baked Beans and Toast |
| `travel` | travel, trip, city, holiday, explore | Exploring Baked Beans and Toast |
| `tech` | software, computer, device, internet, algorithm | The Technology Behind Baked Beans and Toast |
| `health` | health, wellness, diet, nutrition, fitness | The Health Benefits of Baked Beans and Toast |
| `nature` | species, genus, habitat, wildlife, nocturnal | A Field Guide to Baked Beans and Toast |
| `people` | born, died, biography, elected, scientist | The Life of Baked Beans and Toast |
| `place` | located, capital, island, river, geography | The Geography of Baked Beans and Toast |
| `science` | equation, theory, experiment, mechanism, theorem, atom | The Mechanics of Baked Beans and Toast |
| `culture` | painting, poetry, cinema, museum, mythology | Baked Beans and Toast in Culture |
| `society` | parliament, government, election, economy, policy | The Social World of Baked Beans and Toast |
| `statistics` | census, median, percentage, variance, dataset | The Numbers Behind Baked Beans and Toast |
| `sport` | league, championship, tournament, athlete, medal | The Sporting Life of Baked Beans and Toast |
| `objects` | artifact, tool, instrument, relic, machinery | What Baked Beans and Toast Is Made Of |
| `method` | method, protocol, procedure, cohort, participant | A Method for Baked Beans and Toast |
| `finding` | finding, outcome, evidence, observed, measured | The Findings on Baked Beans and Toast |
| `survey` | systematic, scholarly, citation, bibliography | A Survey of Baked Beans and Toast |
| `case` | clinical, diagnosis, prognosis, symptom | A Clinical Study of Baked Beans and Toast |
| `definition` | defined, definition, denotes | Defining Baked Beans and Toast |
| `default`, `spotlight`, `essentials` | none (generic) | All About Baked Beans and Toast |

Each title in the last column is one real template rendered for those two keywords. Every pattern has several templates; they live in the language pack, [`langs/en.json`](../langs/en.json). Subject patterns (`history`, `nature`, `people`, `place`, `science`, `statistics`, `sport`, `objects`, `culture`, `society`, `food`, `health`, `tech`) are for what a page is about. Each one has its own templates, so a title still reads when the keywords are two unrelated topics, and a history title does not come out in the voice of a field guide or a league table. Voice patterns (`recipe`, `review`, `howto`, and the rest of that kind) stay available, but their triggers leave out words encyclopedia prose uses in passing, such as `how`, `new` and `system`. Purpose patterns (`method`, `finding`, `survey`, `case`, `definition`) are for scientific and academic pages, and follow why the page exists: how something was done, what was found, what the field has published, one clinical case, what a term means. They have short lists of intent words, so a single hit counts for a lot, and they leave out words that are likely topics (`case`, `patient`, `meaning`) or that other patterns own (`review`, `literature`, `report`). The bare word `review` no longer selects the `review` pattern, because it is as common in a paper as in a product page. A page that says only "review" falls to a generic pattern. Text that matches nothing still gets a plain title from `default`, `spotlight` or `essentials`, and any pattern can draw a plain frame such as `Notes on ...` from the shared pool.

## Languages

`options.lang` loads a JSON pack from `langs/` (`en`, `de`, `es`). Each pack holds the joiner, stop words, connectors, templates, patterns and a small `locale` block (title-case style, a/an, Spanish *y→e*).

**Language support is rudimentary.** The hooks are there so packs can be switched and edited. The shipped German and Spanish files are demos, not production localisation. There is no gender or case engine, and stemming stays English-oriented. **Proper language support is left as an exercise for other quirky sluggers.**

## Adding your own pattern

Add an object to `patterns` (or supply your own `patterns` list):

```json
{
  "id": "interview",
  "triggers": ["interview", "asked", "conversation", "spoke", "questions"],
  "templates": ["an-interview-with-{kw1}", "{kw}:-the-interview"],
  "quirkyTemplates": ["a-{adj}-chat-about-{kw}"]
}
```

Then check it:

```js
quirkySlug.explain('toast', 'We asked him in a long interview and conversation.', { config: { patterns: [...] } });
```

Pick triggers the text is likely to contain, and avoid words likely to be keywords. After editing the default file, run `npm test`. The tests check every default template for unknown placeholders and unexpected characters.
