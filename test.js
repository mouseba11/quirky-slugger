'use strict';

const assert = require('assert');
const api = require('./index.js');

// Most tests are about the slug, so `quirkySlug` here returns just the slug string.
// It also pins patternSpread to 1 and sharedFactor to 0, so the top-scoring pattern's own templates are
// always used and the tests about pattern choice stay predictable. The variance settings are tested
// separately, using `api` directly. The real return shape ({ slug, title }) is tested in the "title" section.
const STABLE = { patternSpread: 1, sharedFactor: 0, connectFactor: 0, joinerVariantFactor: 0 };
const quirkySlug = Object.assign((keywords, text, options) => {
  const opts = Object.assign({}, options);
  opts.config = Object.assign({}, STABLE, opts.config);
  return api(keywords, text, opts).slug;
}, api);

// Recipe-flavoured text picks a recipe template.
const recipe = quirkySlug('beans,toast', 'Here is a quick recipe: heat the beans in a pan, toast the bread and serve.');
assert.ok(/beans.*toast/.test(recipe), `unexpected recipe slug: ${recipe}`);
assert.ok(/recipe|make|served/.test(recipe), `unexpected recipe slug: ${recipe}`);

// Review-flavoured text picks a review template.
const review = quirkySlug(['beans', 'toast'], 'My honest review and rating: pros, cons, and the final verdict.');
assert.ok(/review|worth/.test(review), `unexpected review slug: ${review}`);

// No matching text falls back to the default pattern.
const fallback = quirkySlug('beans,toast', '');
assert.ok(/beans-and-toast/.test(fallback), `unexpected fallback slug: ${fallback}`);

// Deterministic.
assert.strictEqual(quirkySlug('beans,toast', 'abc def'), quirkySlug('beans,toast', 'abc def'));

// Custom config object replaces the control set.
const custom = quirkySlug('beans', 'anything', {
  config: { patterns: [{ id: 'only', triggers: [], templates: ['my-{kw}-page'] }] }
});
assert.strictEqual(custom, 'my-beans-page');

// Text is truncated to maxWords: the trigger word at position 3 is ignored when maxWords is 2.
const cut = quirkySlug('beans', 'alpha beta recipe', {
  config: { maxWords: 2, patterns: [
    { id: 'r', triggers: ['recipe'], templates: ['recipe-{kw}'] },
    { id: 'd', triggers: [], templates: ['default-{kw}'] }
  ] }
});
assert.strictEqual(cut, 'default-beans');

// Slug length is capped on a hyphen boundary.
const short = quirkySlug('beans,toast', '', { config: { maxSlugLength: 12 } });
assert.ok(short.length <= 12 && !short.endsWith('-'), `unexpected short slug: ${short}`);

// ---------- control text: baked beans / toast / tea ----------

const BEANS = 'Baked beans belong at the centre of breakfast. Cooked slowly in tomato until the sauce turns thick and glossy, they bring salt, a little sweetness, and haricot beans soft enough to give way under a fork. From a tin or a long homemade pot, the result is the same comfort: savoury, filling, and ready to be eaten hot before anything else on the plate.';
const TOAST = 'Toast has to keep up. Cut thick, browned until the crust crackles and the middle stays soft, it needs butter while it is still too hot to hold. Any honest loaf will do, white or brown, if the slice can carry sauce without collapsing, crisp at the edge and yielding underneath.';
const TEA = 'Tea closes it quietly: a strong mug, milk in, steam while you eat.';
const CONTROL_KEYWORDS = 'baked beans, toast, tea';
const CONTROL_TEXT = [BEANS, TOAST, TEA].join(' ');

assert.strictEqual(CONTROL_TEXT.split(/\s+/).length, 128);

// Expected weighting: baked beans ~50%, toast ~40%, tea ~10%.
const weights = quirkySlug.keywordWeights(CONTROL_KEYWORDS, CONTROL_TEXT);
assert.deepStrictEqual(weights.map((w) => w.keyword), ['baked beans', 'toast', 'tea']);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 0.02, `${actual} is not within 0.02 of ${expected}`);
near(weights[0].weight, 0.5);
near(weights[1].weight, 0.4);
near(weights[2].weight, 0.1);
near(weights.reduce((sum, w) => sum + w.weight, 0), 1);

// Keywords appear in the slug exactly as given, in the order given.
const controlSlug = quirkySlug(CONTROL_KEYWORDS, CONTROL_TEXT);
assert.ok(/baked-beans.*toast.*tea/.test(controlSlug), `unexpected control slug: ${controlSlug}`);

// Weights decide which control-set pattern wins. Pattern A is triggered by the
// beans keyword, pattern B by the toast and tea keywords.
const weightConfig = {
  patterns: [
    { id: 'beans-led', triggers: ['baked', 'beans'], templates: ['beans-led-{kw}'] },
    { id: 'toast-led', triggers: ['toast', 'tea'], templates: ['toast-led-{kw}'] }
  ]
};
assert.ok(quirkySlug(CONTROL_KEYWORDS, CONTROL_TEXT, { config: weightConfig }).startsWith('beans-led-'));

// Same keywords, but the toast block now dominates the text, so the winner flips.
const TOAST_HEAVY = [TOAST, TEA, 'Baked beans belong at the centre of breakfast.'].join(' ');
const flipped = quirkySlug.keywordWeights(CONTROL_KEYWORDS, TOAST_HEAVY);
assert.ok(flipped[1].weight > flipped[0].weight, 'toast should outweigh baked beans');
assert.ok(quirkySlug(CONTROL_KEYWORDS, TOAST_HEAVY, { config: weightConfig }).startsWith('toast-led-'));

// No keyword mentioned in the text: weights are equal.
const equal = quirkySlug.keywordWeights('beans,toast', 'nothing relevant here at all');
assert.strictEqual(equal[0].weight, 0.5);
assert.strictEqual(equal[1].weight, 0.5);

// ---------- quirks mode ----------

const quirkConfig = (quirkFactor) => ({
  quirkFactor,
  quirkyModifiers: { adjectives: ['curious'], suffixes: ['mystery'] },
  patterns: [{ id: 'only', triggers: [], templates: ['plain-{kw}'], quirkyTemplates: ['the-{adj}-{kw}-{suffix}'] }]
});

// Off by default, even when quirkFactor is 1.
assert.strictEqual(quirkySlug('beans', 'x', { config: quirkConfig(1) }), 'plain-beans');
// On with quirkFactor 1: always quirky, with {adj} and {suffix} filled from quirkyModifiers.
assert.strictEqual(quirkySlug('beans', 'x', { config: quirkConfig(1), quirks: true }), 'the-curious-beans-mystery');
// On with quirkFactor 0: never quirky.
assert.strictEqual(quirkySlug('beans', 'x', { config: quirkConfig(0), quirks: true }), 'plain-beans');
// Can be switched on in the config instead of the option, and the option wins.
assert.strictEqual(quirkySlug('beans', 'x', { config: Object.assign(quirkConfig(1), { quirks: true }) }), 'the-curious-beans-mystery');
assert.strictEqual(quirkySlug('beans', 'x', { config: Object.assign(quirkConfig(1), { quirks: true }), quirks: false }), 'plain-beans');

// quirkFactor 0.7 gives roughly 70% quirky slugs across varied inputs, and is deterministic.
let quirky = 0;
const runs = 400;
for (let i = 0; i < runs; i++) {
  const a = quirkySlug('beans', `input number ${i}`, { config: quirkConfig(0.7), quirks: true });
  assert.strictEqual(a, quirkySlug('beans', `input number ${i}`, { config: quirkConfig(0.7), quirks: true }));
  if (a !== 'plain-beans') quirky++;
}
assert.ok(quirky / runs > 0.6 && quirky / runs < 0.8, `quirky share was ${quirky / runs}`);

// Control text with the default config: valid, capped, keeps the keywords.
for (const quirkFactor of [0, 1]) {
  const q = quirkySlug(CONTROL_KEYWORDS, CONTROL_TEXT, { quirks: true, config: { quirkFactor } });
  assert.ok(q.includes('baked-beans'), `unexpected quirky slug: ${q}`);
  assert.ok(q.length <= 60 && !q.includes('--') && !q.endsWith('-'), `malformed quirky slug: ${q}`);
}

// Every shipped language pack's templates only use placeholders that exist, so none leak into the slug.
['en', 'de', 'es'].forEach((code) => {
  const pack = require(`./langs/${code}.json`);
  const allPackTemplates = [
    ...pack.sharedTemplates,
    ...pack.sharedQuirkyTemplates,
    ...pack.connectTemplates,
    ...pack.connectQuirkyTemplates,
    ...pack.patterns.flatMap((p) => [...p.templates, ...(p.quirkyTemplates || [])])
  ];
  allPackTemplates.forEach((t) => {
    const unknown = (t.match(/\{[^}]*\}/g) || []).filter((m) => !/^\{(kw\d*|rest|n|top|adj|suffix|connect|connecting|connection|connected)\}$/.test(m));
    assert.deepStrictEqual(unknown, [], `unknown placeholder in ${code} "${t}"`);
    assert.ok(/^[a-z0-9{}.,:;?!'-]+$/.test(t), `unexpected character in ${code} template "${t}"`);
  });
});
const defaults = require('./langs/en.json');

// ---------- explain(): the exposed data ----------

const info = quirkySlug.explain(CONTROL_KEYWORDS, CONTROL_TEXT, { quirks: true, config: { quirkFactor: 1 } });
assert.strictEqual(info.slug, api(CONTROL_KEYWORDS, CONTROL_TEXT, { quirks: true, config: { quirkFactor: 1 } }).slug);
assert.ok(info.candidates.some((c) => c.id === info.pattern), 'the chosen pattern is one of the candidates');
assert.ok(info.usedFallback || info.candidates.every((c) => c.score > 0), 'candidates all matched something');
assert.strictEqual(info.quirky, true);
assert.strictEqual(info.quirksMode, true);
assert.strictEqual(info.wordsUsed, 128);
assert.strictEqual(info.wordsIgnored, 0);
assert.deepStrictEqual(info.keywords.map((k) => k.keyword), ['baked beans', 'toast', 'tea']);
assert.strictEqual(info.scores.length, require('./langs/en.json').patterns.length);
assert.ok(info.scores.every((s, i, a) => i === 0 || a[i - 1].score >= s.score), 'scores are sorted high to low');
assert.ok(info.untruncatedSlug.startsWith(info.slug));

// A pattern that scores highest is the one reported; fallback is flagged.
const winner = quirkySlug.explain('beans', 'beans beans', { config: weightConfig });
assert.strictEqual(winner.pattern, 'beans-led');
assert.strictEqual(winner.usedFallback, false);
assert.strictEqual(winner.scores[0].id, 'beans-led');
const fell = quirkySlug.explain('tomato', 'nothing matches', { config: weightConfig });
assert.strictEqual(fell.usedFallback, true);

// Words beyond maxWords are reported as ignored.
assert.strictEqual(quirkySlug.explain('beans', 'a b c d e', { config: { maxWords: 3 } }).wordsIgnored, 2);

// {adj} and {suffix} that were used are reported.
const mod = quirkySlug.explain('beans', 'x', { config: quirkConfig(1), quirks: true });
assert.strictEqual(mod.adjective, 'curious');
assert.strictEqual(mod.suffix, 'mystery');
assert.strictEqual(mod.template, 'the-{adj}-{kw}-{suffix}');

// ---------- seed ----------

// Same input and seed: same slug. Different seeds: different slugs across the template choices.
assert.strictEqual(
  quirkySlug(CONTROL_KEYWORDS, CONTROL_TEXT, { seed: 'abc' }),
  quirkySlug(CONTROL_KEYWORDS, CONTROL_TEXT, { seed: 'abc' })
);
const seen = new Set();
for (let i = 0; i < 50; i++) seen.add(quirkySlug(CONTROL_KEYWORDS, CONTROL_TEXT, { seed: String(i) }));
assert.ok(seen.size >= 5, `expected several different slugs from the winning pattern's templates, got ${[...seen]}`);

// Quirks mode varies a lot more, including the adjective and suffix.
const seenQuirky = new Set();
for (let i = 0; i < 100; i++) seenQuirky.add(quirkySlug(CONTROL_KEYWORDS, CONTROL_TEXT, { seed: String(i), quirks: true }));
assert.ok(seenQuirky.size > 5, `quirky variety was only ${seenQuirky.size}`);

// No seed (or an empty one) is the same as before, and explain() reports the seed.
assert.strictEqual(quirkySlug('beans', 'x'), quirkySlug('beans', 'x', { seed: '' }));
assert.strictEqual(quirkySlug.explain('beans', 'x').seed, null);
assert.strictEqual(quirkySlug.explain('beans', 'x', { seed: 42 }).seed, '42');

// ---------- title ----------

// The function returns both the slug and a title.
const both = api(CONTROL_KEYWORDS, CONTROL_TEXT, { seed: 'abc' });
assert.deepStrictEqual(Object.keys(both).sort(), ['slug', 'title']);
assert.strictEqual(both.slug, api.explain(CONTROL_KEYWORDS, CONTROL_TEXT, { seed: 'abc' }).slug);
assert.strictEqual(api.explain(CONTROL_KEYWORDS, CONTROL_TEXT, { seed: 'abc' }).title, both.title);

const titleConfig = (template, extra) => Object.assign({
  quirkyModifiers: { adjectives: ['oddly-specific'], suffixes: ['rabbit-hole'] },
  joinerVariantFactor: 0,
  patterns: [{ id: 'only', triggers: [], templates: [template] }]
}, extra);
const titleOf = (keywords, template, extra) => api(keywords, 'x', { config: titleConfig(template, extra) }).title;

// Keywords keep their wording and are listed naturally; small words stay lowercase.
assert.strictEqual(titleOf('baked beans, toast, tea', 'all-about-{kw}'), 'All About Baked Beans, Toast and Tea');
assert.strictEqual(titleOf('beans', 'all-about-{kw}'), 'All About Beans');
assert.strictEqual(titleOf('beans, toast', 'all-about-{kw}'), 'All About Beans and Toast');
assert.strictEqual(titleOf('beans, toast', 'all-about-{kw}', { joiner: '' }), 'All About Beans, Toast');
assert.strictEqual(titleOf('beans on toast', '{kw}-explained'), 'Beans on Toast Explained');

// First and last words are always capitalised, even small ones.
assert.strictEqual(titleOf('beans', 'the-secret-of-{kw}'), 'The Secret of Beans');
assert.strictEqual(titleOf('beans', 'what-is-{kw}-for'), 'What Is Beans For');

// Existing capitals are kept; accents and hyphens inside keywords survive.
assert.strictEqual(titleOf('NASA, t-shirt', 'the-{kw}-story'), 'The NASA and T-shirt Story');

// Placeholders: {adj} and {suffix} lose their hyphens, {kw1}/{kw2} are individual keywords.
assert.strictEqual(titleOf('beans', 'the-{adj}-{kw}-{suffix}'), 'The Oddly Specific Beans Rabbit Hole');
assert.strictEqual(titleOf('beans, toast', '{kw2}-versus-{kw1}'), 'Toast Versus Beans');
assert.strictEqual(titleOf('beans', 'so-you-dont-know-{kw}'), "So You Don't Know Beans");

// Missing placeholder values leave no stray spaces.
assert.strictEqual(titleOf('beans', 'big-{kw3}-{kw}'), 'Big Beans');

// The title is not cut by maxSlugLength, but the slug is.
const long = api('baked beans, toast, tea', 'x', { config: titleConfig('all-about-{kw}', { maxSlugLength: 12 }) });
assert.ok(long.slug.length <= 12);
assert.strictEqual(long.title, 'All About Baked Beans, Toast and Tea');

// Real default config on the control text.
assert.ok(/Baked Beans.*Toast.*Tea/.test(both.title), `unexpected title: ${both.title}`);
const quirkyTitle = api(CONTROL_KEYWORDS, CONTROL_TEXT, { quirks: true, seed: '1', config: { quirkFactor: 1 } }).title;
assert.ok(/^[A-Z0-9]/.test(quirkyTitle) && !quirkyTitle.includes('-') && !quirkyTitle.includes('{'), `unexpected quirky title: ${quirkyTitle}`);

// ---------- "and" only goes before the last keyword ----------

const slugOf = (keywords, template, extra) => api(keywords, 'x', { config: titleConfig(template, extra) }).slug;

assert.strictEqual(slugOf('beans', 'all-about-{kw}'), 'all-about-beans');
assert.strictEqual(slugOf('beans, toast', 'all-about-{kw}'), 'all-about-beans-and-toast');
assert.strictEqual(slugOf('baked beans, toast, tea', 'all-about-{kw}'), 'all-about-baked-beans-toast-and-tea');
assert.strictEqual(slugOf('a, b, c, d', '{kw}'), 'a-b-c-and-d');
assert.strictEqual(slugOf('baked beans, toast, tea', 'all-about-{kw}', { joiner: '' }), 'all-about-baked-beans-toast-tea');
assert.strictEqual(slugOf('baked beans, toast, tea', 'all-about-{kw}', { joiner: 'plus' }), 'all-about-baked-beans-toast-plus-tea');
assert.strictEqual(titleOf('baked beans, toast, tea', 'all-about-{kw}', { joiner: 'plus' }), 'All About Baked Beans, Toast Plus Tea');
// "and" never appears more than once for the keyword list.
const andCount = (s) => (s.match(/\band\b/gi) || []).length;
const listed = api('baked beans, toast, tea, jam', 'x', { config: titleConfig('{kw}') });
assert.strictEqual(andCount(listed.title), 1);
assert.strictEqual(listed.title, 'Baked Beans, Toast, Tea and Jam');
assert.strictEqual(listed.slug, 'baked-beans-toast-tea-and-jam');

// ---------- a / an ----------

assert.strictEqual(slugOf('beans', 'a-{adj}-look-at-{kw}', { quirkyModifiers: { adjectives: ['accidental'], suffixes: [] } }), 'an-accidental-look-at-beans');
assert.strictEqual(titleOf('beans', 'a-{adj}-look-at-{kw}', { quirkyModifiers: { adjectives: ['accidental'], suffixes: [] } }), 'An Accidental Look at Beans');
assert.strictEqual(titleOf('beans', 'a-{adj}-look-at-{kw}', { quirkyModifiers: { adjectives: ['oddly-specific'], suffixes: [] } }), 'An Oddly Specific Look at Beans');
assert.strictEqual(titleOf('beans', 'a-{adj}-look-at-{kw}', { quirkyModifiers: { adjectives: ['curious'], suffixes: [] } }), 'A Curious Look at Beans');
assert.strictEqual(titleOf('beans', 'a-{adj}-look-at-{kw}', { quirkyModifiers: { adjectives: ['unique'], suffixes: [] } }), 'A Unique Look at Beans');
assert.strictEqual(titleOf('beans', 'a-{adj}-look-at-{kw}', { quirkyModifiers: { adjectives: ['unhinged'], suffixes: [] } }), 'An Unhinged Look at Beans');
assert.strictEqual(titleOf('beans', 'a-{adj}-look-at-{kw}', { quirkyModifiers: { adjectives: ['one-off'], suffixes: [] } }), 'A One Off Look at Beans');
// Also works for keywords, and leaves other "a" words alone.
assert.strictEqual(titleOf('apples', 'a-brief-history-of-{kw}'), 'A Brief History of Apples');
assert.strictEqual(slugOf('apples', 'a-{kw}'), 'an-apples');
// Every default quirky and plain template gives correct grammar for every default adjective.
const defaultAdjectives = require('./langs/en.json').quirkyModifiers.adjectives;
defaultAdjectives.forEach((adj) => {
  const t = titleOf('beans', 'a-{adj}-look-at-{kw}', { quirkyModifiers: { adjectives: [adj], suffixes: [] } });
  assert.ok(!/^A [AEIOU]/.test(t), `"A" before a vowel: ${t}`);
});

// ---------- split keywords: {kw1} and {rest} ----------

const KW3 = 'baked beans, toast, tea';

// Your example: the first keyword on its own, the others as a list.
const split = api(KW3, 'x', { config: titleConfig('{kw1},-a-natural-extension-of-{rest}') });
assert.strictEqual(split.title, 'Baked Beans, a Natural Extension of Toast and Tea');
assert.strictEqual(split.slug, 'baked-beans-a-natural-extension-of-toast-and-tea');

// {rest} is "x", "x and y" or "x, y and z"; "and" only goes before the last one.
assert.strictEqual(titleOf('a, b', '{kw1}-with-{rest}'), 'A with B');
assert.strictEqual(titleOf('apples, b, c, d', '{kw1}-then-{rest}'), 'Apples Then B, C and D');
assert.strictEqual(slugOf('apples, b, c, d', '{kw1}-then-{rest}'), 'apples-then-b-c-and-d');
assert.strictEqual(slugOf('apples, b, c, d', '{kw1}-then-{rest}', { joiner: '' }), 'apples-then-b-c-d');

// Punctuation in a template shows in the title, never in the slug, and never has a space before it.
assert.strictEqual(titleOf(KW3, 'breaking:-{kw1}-teams-up-with-{rest}'), 'Breaking: Baked Beans Teams Up with Toast and Tea');
assert.strictEqual(slugOf(KW3, 'breaking:-{kw1}-teams-up-with-{rest}'), 'breaking-baked-beans-teams-up-with-toast-and-tea');
assert.strictEqual(titleOf(KW3, 'forget-{rest},-all-you-need-is-{kw1}'), 'Forget Toast and Tea, All You Need Is Baked Beans');
assert.strictEqual(titleOf('beans, toast', 'what-is-{kw}-?'), 'What Is Beans and Toast?');
// Small words start with a capital after a colon (a new clause), but not after a comma.
assert.strictEqual(titleOf('beans', '{kw}:-a-tale-of-toast'), 'Beans: A Tale of Toast');
assert.strictEqual(titleOf('beans', '{kw},-a-tale-of-toast'), 'Beans, a Tale of Toast');
// A literal "a" before an adjective is still corrected after a colon.
assert.strictEqual(
  titleOf('beans', '{kw}:-a-{adj}-{suffix}', { quirkyModifiers: { adjectives: ['accidental'], suffixes: ['saga'] } }),
  'Beans: An Accidental Saga'
);

// "with", "from", "than" and "into" are small words, like other prepositions.
assert.strictEqual(titleOf(KW3, 'why-{kw}-was-wilder-than-you-think'), 'Why Baked Beans, Toast and Tea Was Wilder than You Think');
assert.strictEqual(titleOf('beans, toast', '{kw1}-with-{rest}-from-scratch'), 'Beans with Toast from Scratch');

// With only one keyword, templates that need more are skipped, so no gaps appear.
const oneConfig = {
  quirkFactor: 1,
  patterns: [{
    id: 'only',
    triggers: [],
    templates: ['plain-{kw}', 'plain-{kw1}-with-{rest}', 'plain-{kw2}'],
    quirkyTemplates: ['quirky-{kw}', 'quirky-{kw1}-and-{rest}', 'quirky-{kw3}']
  }]
};
for (let i = 0; i < 60; i++) {
  const r = api.explain('beans', 'x', { config: oneConfig, quirks: i % 2 === 0, seed: String(i) });
  assert.ok(r.template === 'plain-{kw}' || r.template === 'quirky-{kw}', `unusable template chosen: ${r.template}`);
}
// With three keywords every template can be used.
const usedTemplates = new Set();
for (let i = 0; i < 200; i++) {
  usedTemplates.add(api.explain(KW3, 'x', { config: Object.assign({}, oneConfig, { quirkFactor: 0.5 }), quirks: true, seed: String(i) }).template);
}
assert.ok(usedTemplates.has('quirky-{kw1}-and-{rest}') && usedTemplates.has('quirky-{kw3}') && usedTemplates.has('plain-{kw1}-with-{rest}'));

// The default config, one keyword: no split template is ever chosen, and no stray words appear.
for (let i = 0; i < 300; i++) {
  const r = api.explain('beans', 'x', { quirks: true, seed: String(i), config: { quirkFactor: 0.5 } });
  assert.ok(!/\{(rest|kw[2-9])\}/.test(r.template), `needs more keywords: ${r.template}`);
  assert.ok(r.title.length > 0 && !/[{}]/.test(r.title) && !/\s,|\s:/.test(r.title) && !/ {2}/.test(r.title), `bad title: ${r.title}`);
}

// The default config, three keywords, every seed and quirks setting: well-formed slug and title.
for (let i = 0; i < 400; i++) {
  const r = api.explain(KW3, CONTROL_TEXT, { quirks: i % 3 !== 0, seed: String(i), config: { maxSlugLength: 200 } });
  assert.ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.slug), `bad slug: ${r.slug}`);
  assert.ok(!/[{}]/.test(r.title) && !/\s[,:;!?]/.test(r.title) && !/ {2}/.test(r.title), `bad title: ${r.title}`);
  assert.ok(/^[A-Z0-9]/.test(r.title), `title should start with a capital or a number: ${r.title}`);
  assert.ok(!/\bA [AEIOUaeiou]/.test(r.title.replace(/\bA (Unique|Unicorn|One|Useful)/g, '')), `a/an: ${r.title}`);
  assert.ok(!/\b[Aa]n [^aeiouAEIOU]/.test(r.title), `a/an: ${r.title}`);
}

// ---------- variance ----------

const survey = (keywords, text, options, runs) => {
  const patterns = {};
  const titles = new Set();
  const templates = new Set();
  for (let i = 0; i < (runs || 300); i++) {
    const r = api.explain(keywords, text, Object.assign({ seed: `v${i}` }, options));
    patterns[r.pattern] = (patterns[r.pattern] || 0) + 1;
    titles.add(r.title);
    templates.add(r.template);
  }
  return { patterns, titles, templates };
};

// Word forms match each other, so triggers match real prose: bake = baked = baking, recipe = recipes.
const stemConfig = { patternSpread: 1, patterns: [
  { id: 'cooking', triggers: ['bake', 'recipe', 'tomato'], templates: ['cooking-{kw}'] },
  { id: 'other', triggers: ['review'], templates: ['other-{kw}'] }
] };
assert.strictEqual(api.explain('x', 'She baked it. Baking is fun.', { config: stemConfig }).pattern, 'cooking');
assert.strictEqual(api.explain('x', 'These recipes use tomatoes.', { config: stemConfig }).pattern, 'cooking');
assert.strictEqual(api.explain('x', 'Reviewed and reviewing.', { config: stemConfig }).pattern, 'other');

// Your control text now matches real patterns instead of always falling back to the default one.
const control = survey(CONTROL_KEYWORDS, CONTROL_TEXT, {}, 300);
assert.ok(Object.keys(control.patterns).length >= 3, `control text patterns: ${JSON.stringify(control.patterns)}`);
assert.ok(!control.patterns.default, 'control text should not fall back to the default pattern');
assert.ok(control.patterns.food > control.patterns.comfort, 'the stronger match should win more often');
assert.ok(control.titles.size >= 30, `plain control titles: ${control.titles.size}`);
assert.ok(control.templates.size >= 20, `plain control templates: ${control.templates.size}`);

// Quirks mode adds a lot more.
const quirkySurvey = survey(CONTROL_KEYWORDS, CONTROL_TEXT, { quirks: true }, 300);
assert.ok(quirkySurvey.titles.size >= 120, `quirky control titles: ${quirkySurvey.titles.size}`);
assert.ok(quirkySurvey.titles.size > control.titles.size * 1.5);

// Text with nothing the control set recognises uses a mix of generic patterns, not one.
const nothing = survey('beans, toast', 'xyzzy plugh', {}, 300);
assert.ok(Object.keys(nothing.patterns).length >= 3, `generic patterns: ${JSON.stringify(nothing.patterns)}`);
assert.ok(Object.keys(nothing.patterns).every((id) => ['default', 'spotlight', 'essentials'].includes(id)));
assert.ok(api.explain('beans', 'xyzzy plugh').usedFallback);

// A strong, unambiguous text still gets its own pattern every time.
const historyText = 'The history of beans goes back centuries. This vintage dish was a forgotten invention of the 1920s era.';
assert.deepStrictEqual(Object.keys(survey('beans, toast', historyText, {}, 100).patterns), ['curious-history']);

// patternSpread: 1 means only the top pattern can win; a lower spread lets close runners-up in.
const spreadOne = survey(CONTROL_KEYWORDS, CONTROL_TEXT, { config: { patternSpread: 1 } }, 100);
assert.strictEqual(Object.keys(spreadOne.patterns).length, 1);
const spreadLow = survey(CONTROL_KEYWORDS, CONTROL_TEXT, { config: { patternSpread: 0.05 } }, 300);
assert.ok(Object.keys(spreadLow.patterns).length > Object.keys(control.patterns).length - 1);

// Candidate shares add up to 1, and the chosen pattern is always one of the candidates.
const cand = api.explain(CONTROL_KEYWORDS, CONTROL_TEXT, { seed: 'c' });
assert.ok(Math.abs(cand.candidates.reduce((sum, c) => sum + c.share, 0) - 1) < 1e-9);
assert.ok(cand.candidates.some((c) => c.id === cand.pattern));

// sharedFactor: 0 never uses shared templates, 1 always does.
const sharedOff = survey(CONTROL_KEYWORDS, CONTROL_TEXT, { config: { sharedFactor: 0 } }, 100);
const defaultsFile = require('./langs/en.json');
assert.ok([...sharedOff.templates].every((t) => !defaultsFile.sharedTemplates.includes(t)));
const sharedOn = survey(CONTROL_KEYWORDS, CONTROL_TEXT, { config: { sharedFactor: 1, connectFactor: 0 } }, 100);
assert.ok([...sharedOn.templates].every((t) => defaultsFile.sharedTemplates.includes(t)));
// ...and with quirks on, the shared quirky pool is used.
const sharedQuirkyOn = survey(CONTROL_KEYWORDS, CONTROL_TEXT, { quirks: true, config: { sharedFactor: 1, quirkFactor: 1, connectFactor: 0 } }, 100);
assert.ok([...sharedQuirkyOn.templates].every((t) => defaultsFile.sharedQuirkyTemplates.includes(t)));
assert.ok(api.explain(CONTROL_KEYWORDS, CONTROL_TEXT, { config: { sharedFactor: 1, connectFactor: 0 } }).sharedTemplate);

// A custom control set does not inherit the default shared templates...
for (let i = 0; i < 50; i++) {
  const r = api.explain('beans', 'x', { seed: String(i), config: { sharedFactor: 1, patterns: [{ id: 'p', triggers: [], templates: ['own-{kw}'] }] } });
  assert.strictEqual(r.template, 'own-{kw}');
  assert.strictEqual(r.sharedTemplate, false);
}
// ...unless it supplies its own.
const ownShared = api.explain('beans', 'x', {
  config: { sharedFactor: 1, sharedTemplates: ['shared-{kw}'], patterns: [{ id: 'p', triggers: [], templates: ['own-{kw}'] }] }
});
assert.strictEqual(ownShared.template, 'shared-{kw}');

// With one keyword, shared templates that need more are skipped too.
for (let i = 0; i < 100; i++) {
  const r = api.explain('beans', 'x', { seed: String(i), quirks: i % 2 === 0, config: { sharedFactor: 1 } });
  assert.ok(!/\{(rest|kw[2-9])\}/.test(r.template), `needs more keywords: ${r.template}`);
}

// {n}: a number from config.numbers, in both the slug and the title.
const num = api.explain('beans', 'x', { config: { numbers: [7], patterns: [{ id: 'p', triggers: [], templates: ['top-{n}-{kw}'] }] } });
assert.strictEqual(num.slug, 'top-7-beans');
assert.strictEqual(num.title, 'Top 7 Beans');
assert.strictEqual(num.number, '7');
const nums = new Set();
for (let i = 0; i < 100; i++) {
  nums.add(api.explain('beans', 'x', { seed: String(i), config: { numbers: [3, 5, 9], patterns: [{ id: 'p', triggers: [], templates: ['{n}-{kw}'] }] } }).number);
}
assert.deepStrictEqual([...nums].sort(), ['3', '5', '9']);
// No numbers configured: {n} leaves no gap.
assert.strictEqual(api.explain('beans', 'x', { config: { numbers: [], patterns: [{ id: 'p', triggers: [], templates: ['top-{n}-{kw}'] }] } }).slug, 'top-beans');

// Deterministic: the same input and seed always give the same result, whatever the variance settings.
assert.deepStrictEqual(
  api.explain(CONTROL_KEYWORDS, CONTROL_TEXT, { seed: 'same', quirks: true }),
  api.explain(CONTROL_KEYWORDS, CONTROL_TEXT, { seed: 'same', quirks: true })
);

// Contractions in new templates come out right.
assert.strictEqual(titleOf('beans', 'whats-new-with-{kw}'), "What's New with Beans");
assert.strictEqual(titleOf('beans', 'the-only-{kw}-recipe-youll-need'), "The Only Beans Recipe You'll Need");
assert.strictEqual(titleOf('beans', '{n}-things-you-didnt-know-about-{kw}', { numbers: [7] }), "7 Things You Didn't Know About Beans");

// ---------- connecting the keywords ----------

// With connectFactor 1 every title comes from the connecting pool (plain, or quirky in quirks mode).
const connectOn = survey(CONTROL_KEYWORDS, CONTROL_TEXT, { config: { connectFactor: 1 } }, 300);
assert.ok([...connectOn.templates].every((t) => defaultsFile.connectTemplates.includes(t)));
assert.ok(connectOn.templates.size >= 15, `connecting templates used: ${connectOn.templates.size}`);
const connectQuirkyOn = survey(CONTROL_KEYWORDS, CONTROL_TEXT, { quirks: true, config: { connectFactor: 1, quirkFactor: 1 } }, 300);
assert.ok([...connectQuirkyOn.templates].every((t) => defaultsFile.connectQuirkyTemplates.includes(t)));
assert.ok(api.explain(CONTROL_KEYWORDS, CONTROL_TEXT, { config: { connectFactor: 1 } }).connectTemplate);

// connectFactor 0 never uses the pool, and the default mixes it in about 40% of the time.
const connectOff = survey(CONTROL_KEYWORDS, CONTROL_TEXT, { config: { connectFactor: 0 } }, 200);
assert.ok([...connectOff.templates].every((t) => !defaultsFile.connectTemplates.includes(t)));
let connectCount = 0;
for (let i = 0; i < 400; i++) {
  if (api.explain(CONTROL_KEYWORDS, CONTROL_TEXT, { seed: `c${i}` }).connectTemplate) connectCount++;
}
assert.ok(connectCount > 400 * 0.3 && connectCount < 400 * 0.5, `default connect share: ${connectCount}/400`);

// A single keyword has nothing to connect, so the pool is never used and no connector word appears.
for (let i = 0; i < 100; i++) {
  const r = api.explain('beans', 'x', { seed: `one${i}`, quirks: true, config: { connectFactor: 1 } });
  assert.strictEqual(r.connectTemplate, false);
  assert.deepStrictEqual(r.connectors, {});
}
const oneKeywordConnector = api.explain('beans', 'x', { seed: 'q', config: { patterns: [{ id: 'p', triggers: [], templates: ['link-{kw}', 'the-{connection}-between-{kw}'] }], connectors: { nouns: ['bridge'] } } });
assert.strictEqual(oneKeywordConnector.template, 'link-{kw}', 'templates with a connector word need two keywords');

// Each connector placeholder draws from its own list, so the grammar always fits.
const connectorConfig = (template) => ({
  patterns: [{ id: 'p', triggers: [], templates: [template] }],
  connectors: { verbs: ['link'], gerunds: ['linking'], nouns: ['bridge'], participles: ['tied-to'] }
});
const connectorTitle = (template) => api('baked beans, toast', 'x', { config: connectorConfig(template) }).title;
assert.strictEqual(connectorTitle('how-to-{connect}-{kw}'), 'How to Link Baked Beans and Toast');
assert.strictEqual(connectorTitle('{connecting}-{kw}'), 'Linking Baked Beans and Toast');
assert.strictEqual(connectorTitle('the-{connection}-between-{kw}'), 'The Bridge Between Baked Beans and Toast');
assert.strictEqual(connectorTitle('{kw1}-{connected}-{rest}'), 'Baked Beans Tied to Toast');
assert.strictEqual(api('baked beans, toast', 'x', { config: connectorConfig('{kw1}-{connected}-{rest}') }).slug, 'baked-beans-tied-to-toast');
assert.deepStrictEqual(
  api.explain('baked beans, toast', 'x', { config: connectorConfig('{connecting}-{kw}:-the-{connection}') }).connectors,
  { connecting: 'linking', connection: 'bridge' }
);

// "a" becomes "an" before a connector noun that starts with a vowel sound.
const nounTitle = (noun) => api('beans, toast', 'x', { config: { patterns: [{ id: 'p', triggers: [], templates: ['a-{connection}-between-{kw}'] }], connectors: { nouns: [noun] } } }).title;
assert.strictEqual(nounTitle('overlap'), 'An Overlap Between Beans and Toast');
assert.strictEqual(nounTitle('alliance'), 'An Alliance Between Beans and Toast');
assert.strictEqual(nounTitle('union'), 'A Union Between Beans and Toast');
assert.strictEqual(nounTitle('common-ground'), 'A Common Ground Between Beans and Toast');

// The default connector lists cover the thesaurus senses of "connect", and all words are used.
['associate', 'bridge', 'combine', 'couple', 'join', 'link', 'relate', 'tie', 'unite', 'yoke', 'marry', 'pair', 'mesh']
  .forEach((word) => {
    const all = Object.values(defaultsFile.connectors).flat().join(' ');
    assert.ok(new RegExp(word.replace(/e$/, '') ).test(all), `no connector based on "${word}"`);
  });
const seenConnectors = new Set();
for (let i = 0; i < 2000; i++) {
  Object.values(api.explain(CONTROL_KEYWORDS, CONTROL_TEXT, { seed: `w${i}`, quirks: i % 2 === 0, config: { connectFactor: 1 } }).connectors)
    .forEach((w) => seenConnectors.add(w));
}
assert.ok(seenConnectors.size >= 40, `distinct connector words used: ${seenConnectors.size}`);

// A custom control set does not inherit the connecting pool, and the result is deterministic.
for (let i = 0; i < 50; i++) {
  const r = api.explain('beans, toast', 'x', { seed: String(i), config: { connectFactor: 1, patterns: [{ id: 'p', triggers: [], templates: ['own-{kw}'] }] } });
  assert.strictEqual(r.template, 'own-{kw}');
  assert.strictEqual(r.connectTemplate, false);
}
assert.deepStrictEqual(
  api(CONTROL_KEYWORDS, CONTROL_TEXT, { seed: 'same', config: { connectFactor: 1 } }),
  api(CONTROL_KEYWORDS, CONTROL_TEXT, { seed: 'same', config: { connectFactor: 1 } })
);

// Text about connections picks the connection pattern.
assert.strictEqual(api.explain('beans, toast', 'What is the connection between them? The common thread and the link that bring them together.').pattern, 'connection');

// ---------- languages ----------

const samples = require('./langs/samples.json');
assert.strictEqual(api.explain(CONTROL_KEYWORDS, CONTROL_TEXT).lang, 'en');
assert.strictEqual(api.explain(CONTROL_KEYWORDS, CONTROL_TEXT, { lang: 'en' }).lang, 'en');

const deSample = samples.de;
const deOut = api(deSample.keywords, deSample.text, { lang: 'de', seed: 'demo' });
assert.ok(deOut.slug && deOut.title, 'German pack returns a slug and title');
assert.strictEqual(api.explain(deSample.keywords, deSample.text, { lang: 'de' }).lang, 'de');
assert.ok(/und/.test(deOut.slug) || /baked-beans/.test(deOut.slug), `unexpected German slug: ${deOut.slug}`);

const esSample = samples.es;
const esOut = api(esSample.keywords, esSample.text, { lang: 'es', seed: 'demo' });
assert.ok(esOut.slug && esOut.title, 'Spanish pack returns a slug and title');
assert.strictEqual(api.explain(esSample.keywords, esSample.text, { lang: 'es' }).lang, 'es');

// Sample weights stay near 50/40/10 in every shipped language.
[['en', samples.en], ['de', samples.de], ['es', samples.es]].forEach(([code, sample]) => {
  const weights = api.keywordWeights(sample.keywords, sample.text, { lang: code });
  near(weights[0].weight, 0.5);
  near(weights[1].weight, 0.4);
  near(weights[2].weight, 0.1);
});

// Spanish y → e before a keyword that starts with i/hi.
assert.strictEqual(
  api(['pan', 'infusion'], 'x', {
    lang: 'es',
    config: { patterns: [{ id: 'p', triggers: [], templates: ['{kw}'] }] }
  }).title,
  'Pan e infusion'
);

// German does not rewrite literal a- to an-.
assert.strictEqual(
  api('Toast', 'x', {
    lang: 'de',
    config: {
      patterns: [{ id: 'p', triggers: [], templates: ['a-{kw}'] }],
      locale: { id: 'de', titleCase: 'de', article: 'none', smallWords: [] }
    }
  }).slug,
  'a-toast'
);

// English still does a/an.
assert.strictEqual(
  api('accidental look', 'x', {
    lang: 'en',
    config: {
      patterns: [{ id: 'p', triggers: [], templates: ['a-{adj}-look'] }],
      quirkyModifiers: { adjectives: ['accidental'], suffixes: ['x'] },
      locale: { id: 'en', titleCase: 'en', article: 'en-a-an', smallWords: defaults.locale.smallWords }
    }
  }).slug,
  'an-accidental-look'
);

assert.throws(() => api('beans', 'x', { lang: 'zz' }), TypeError);


// Joiner variants: "and the" mixes in when the factor is 1.
const andThe = api.explain('Potatoes, John Lloyd Experience', 'x', {
  seed: 'jt',
  config: {
    joiner: 'and',
    joinerVariants: ['and the'],
    joinerVariantFactor: 1,
    patterns: [{ id: 'p', triggers: [], templates: ['{kw}'] }],
    sharedTemplates: [],
    connectTemplates: [],
  }
});
assert.strictEqual(andThe.title, 'Potatoes and the John Lloyd Experience');
assert.strictEqual(andThe.joiner, 'and the');

const fs = require('fs');
const path = require('path');
const fixtureDir = path.join(__dirname, 'test-langs-fixture');
fs.mkdirSync(fixtureDir, { recursive: true });
fs.writeFileSync(path.join(fixtureDir, 'xx.json'), JSON.stringify({
  joiner: 'and',
  numbers: [2],
  quirkyNumbers: [],
  connectors: { verbs: ['link'], gerunds: ['linking'], nouns: ['link'], participles: ['linked-to'] },
  quirkyModifiers: { adjectives: ['odd'], suffixes: ['bit'] },
  stopWords: ['the'],
  sharedTemplates: [],
  sharedQuirkyTemplates: [],
  connectTemplates: [],
  connectQuirkyTemplates: [],
  patterns: [{ id: 'p', triggers: [], templates: ['fixture-{kw}'] }],
  locale: { id: 'xx', label: 'Fixture', titleCase: 'en', article: 'none', smallWords: ['the'] }
}));
assert.strictEqual(api('beans', 'x', { lang: 'xx', langsDir: fixtureDir }).slug, 'fixture-beans');
fs.unlinkSync(path.join(fixtureDir, 'xx.json'));
fs.rmdirSync(fixtureDir);

// Missing keywords is an error.
assert.throws(() => quirkySlug('', 'text'), TypeError);

console.log('all tests passed');
