'use strict';

const fs = require('fs');
const path = require('path');
const defaultConfig = require('./quirky-slugger.config.json');
const DEFAULT_LANGS_DIR = path.join(__dirname, 'langs');

// ---------- text helpers ----------

function stripAccents(s) {
  return String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function tokenize(s) {
  return stripAccents(s).toLowerCase().match(/[a-z0-9]+/g) || [];
}

// Light stemming so word forms match each other: "beans" = "bean", "bake" = "baked" = "baking",
// "recipe" = "recipes", "tomato" = "tomatoes", "century" = "centuries". The result is only used for
// comparing words, never shown.
function fold(token) {
  let t = token;
  if (t.length > 4 && t.endsWith('ies')) t = t.slice(0, -3) + 'y';
  else if (t.length > 5 && t.endsWith('ing')) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith('ed')) t = t.slice(0, -2);
  else if (t.length > 4 && /(?:s|x|z|ch|sh|o)es$/.test(t)) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith('s') && !/(?:ss|us|is)$/.test(t)) t = t.slice(0, -1);
  if (t.length > 3 && t.endsWith('e')) t = t.slice(0, -1);
  return t;
}

function slugify(s) {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Deterministic 32-bit hash (djb2 plus a final mix so similar inputs spread out).
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

// A factor is a number from 0 to 1. Anything that is not a number counts as 0.
function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function splitWords(text) {
  return String(text || '').split(/\s+/).filter(Boolean);
}

function truncateSlug(slug, max) {
  if (!max || slug.length <= max) return slug;
  let cut = slug.slice(0, max);
  if (slug[max] !== '-') {
    const lastDash = cut.lastIndexOf('-');
    if (lastDash > 0) cut = cut.slice(0, lastDash);
  }
  return cut.replace(/-+$/, '');
}

// Default English small words; language packs can override via locale.smallWords.
const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'the', 'to', 'vs',
  'with', 'from', 'into', 'onto', 'than', 'via'
]);
const CONTRACTIONS = {
  dont: "don't", doesnt: "doesn't", didnt: "didn't", isnt: "isn't", cant: "can't", wont: "won't",
  youre: "you're", youll: "you'll", whats: "what's", thats: "that's"
};
const CONTRACTION_RE = new RegExp(`\\b(${Object.keys(CONTRACTIONS).join('|')})\\b`, 'g');

// Words that already contain a capital (e.g. "NASA", "iPhone") are left alone.
// titleCase mode comes from locale.titleCase: "en" | "de" | "es".
// en/de: capitalise words except smallWords mid-title (not after : ? !).
// es: sentence-style — only the first word and words after : ? ! are capitalised.
function titleCase(str, locale) {
  const mode = (locale && locale.titleCase) || 'en';
  const small = new Set(
    (locale && Array.isArray(locale.smallWords) && locale.smallWords.length)
      ? locale.smallWords.map((w) => String(w).toLowerCase())
      : SMALL_WORDS
  );
  const words = str.split(' ').filter(Boolean);
  return words.map((w, i) => {
    if (/[A-Z]/.test(w)) return w;
    const startsClause = i > 0 && /[:!?]$/.test(words[i - 1]);
    if (mode === 'es') {
      if (i === 0 || startsClause) return w.charAt(0).toUpperCase() + w.slice(1);
      return w;
    }
    const bare = w.replace(/[,;:!?]+$/, '').toLowerCase();
    if (i > 0 && i < words.length - 1 && !startsClause && small.has(bare)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

// Spanish y → e before i/hi (and similar), via locale.joinerAlt.
function pickJoiner(joiner, nextItem, locale) {
  if (!joiner) return '';
  const alt = locale && locale.joinerAlt;
  if (!alt || !alt.use || !Array.isArray(alt.whenNextStartsWith)) return joiner;
  const next = stripAccents(String(nextItem || '')).toLowerCase().replace(/[^a-z0-9]+/g, '');
  for (const prefix of alt.whenNextStartsWith) {
    const p = stripAccents(String(prefix)).toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (p && next.startsWith(p)) return alt.use;
  }
  return joiner;
}

// "a", "a and b", "a, b and c" (or "a, b, c" when there is no joiner word).
// The joiner word only goes before the last item.
function joinForTitle(list, joiner, locale) {
  if (list.length <= 1) return list.join('');
  if (!joiner) return list.join(', ');
  const word = pickJoiner(joiner, list[list.length - 1], locale);
  return `${list.slice(0, -1).join(', ')} ${word} ${list[list.length - 1]}`;
}

// Same for slugs: "a", "a-and-b", "a-b-and-c" (or "a-b-c" when there is no joiner word).
function joinForSlug(list, joiner, locale) {
  if (list.length <= 1) return list.join('');
  const picked = pickJoiner(joiner, list[list.length - 1], locale);
  const word = picked ? slugify(picked) : '';
  if (!word) return list.join('-');
  return `${list.slice(0, -1).join('-')}-${word}-${list[list.length - 1]}`;
}

// Pick the list joiner for this run: usually config.joiner ("and"), sometimes a variant ("and the").
function chooseJoiner(config, chance) {
  const base = config.joiner == null ? 'and' : String(config.joiner);
  const variants = Array.isArray(config.joinerVariants)
    ? config.joinerVariants.map((v) => String(v)).filter(Boolean)
    : [];
  const factor = clamp01(config.joinerVariantFactor);
  if (!variants.length || factor <= 0 || chance('|joiner-var') >= factor) return base;
  return variants[Math.floor(chance('|joiner-pick') * variants.length)];
}

// Whether "an" (rather than "a") goes before this word: "an accidental", but "a unique"
// and "a one-off". Silent-h words ("an hour") are not handled.
function startsWithVowelSound(word) {
  return /^(?:[aei]|o(?!ne\b|nce\b)|u(?!ni|s[ei]|ti|ro))/.test(word);
}

// ---------- config ----------

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveLangsDir(langsDir) {
  if (!langsDir) return DEFAULT_LANGS_DIR;
  return path.isAbsolute(langsDir) ? langsDir : path.resolve(process.cwd(), langsDir);
}

function loadLanguagePack(lang, langsDir) {
  const code = String(lang || 'en');
  if (!/^[a-z]{2}(-[a-z0-9]+)?$/i.test(code)) {
    throw new TypeError(`quirky-slugger: invalid language code "${code}"`);
  }
  const file = path.join(resolveLangsDir(langsDir), `${code.toLowerCase()}.json`);
  if (!fs.existsSync(file)) {
    throw new TypeError(`quirky-slugger: unknown language "${code}" (expected ${file})`);
  }
  return readJsonFile(file);
}

// Merge: algorithm defaults → language pack → options.config.
// options.lang (or config.lang / defaultConfig.lang) selects the pack.
function loadConfig(options) {
  options = options || {};
  let user = {};
  if (typeof options.config === 'string') {
    user = readJsonFile(options.config);
  } else if (options.config && typeof options.config === 'object') {
    user = options.config;
  }

  const lang = String(
    options.lang !== undefined && options.lang !== null && options.lang !== ''
      ? options.lang
      : (user.lang !== undefined && user.lang !== null && user.lang !== ''
        ? user.lang
        : (defaultConfig.lang || 'en'))
  ).toLowerCase();

  const pack = loadLanguagePack(lang, options.langsDir);
  const config = Object.assign({}, defaultConfig, pack, user);
  config.lang = lang;

  // A custom control set doesn't inherit the pack's shared templates. Supply the pools to keep some.
  if (user.patterns !== undefined) {
    if (user.sharedTemplates === undefined) config.sharedTemplates = [];
    if (user.sharedQuirkyTemplates === undefined) config.sharedQuirkyTemplates = [];
    if (user.connectTemplates === undefined) config.connectTemplates = [];
    if (user.connectQuirkyTemplates === undefined) config.connectQuirkyTemplates = [];
  }

  if (!Array.isArray(config.patterns) || config.patterns.length === 0) {
    throw new TypeError('quirky-slugger: config.patterns must be a non-empty array');
  }
  config.patterns.forEach((p, i) => {
    if (!p || !Array.isArray(p.templates) || p.templates.length === 0) {
      throw new TypeError(`quirky-slugger: config.patterns[${i}] needs a non-empty "templates" array`);
    }
    if (p.quirkyTemplates !== undefined && !Array.isArray(p.quirkyTemplates)) {
      throw new TypeError(`quirky-slugger: config.patterns[${i}].quirkyTemplates must be an array`);
    }
  });
  return config;
}

// ---------- vectors ----------

// Each pattern is a "document" made of its trigger terms. IDF down-weights
// trigger terms that appear in many patterns.
function buildIdf(patterns) {
  const df = new Map();
  patterns.forEach((p) => {
    const terms = new Set((p.triggers || []).flatMap(tokenize).map(fold));
    terms.forEach((t) => df.set(t, (df.get(t) || 0) + 1));
  });
  const n = patterns.length;
  return (term) => Math.log((n + 1) / ((df.get(term) || 0) + 1)) + 1;
}

function norm(vec) {
  let sum = 0;
  vec.forEach((v) => { sum += v * v; });
  return Math.sqrt(sum);
}

function cosine(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  let dot = 0;
  a.forEach((v, k) => { if (b.has(k)) dot += v * b.get(k); });
  return dot / (na * nb);
}

// ---------- keyword weighting ----------

// A keyword's weight is the share of the text that follows its first mention,
// up to the next keyword's mention. Sentences that don't mention any keyword
// carry on with the previous one; sentences before the first mention are
// ignored. If no keyword is mentioned, every keyword gets an equal weight.
function weighKeywords(kws, words) {
  const kwTokenSets = kws.map((k) => new Set(tokenize(k).map(fold)));
  const counts = kws.map(() => 0);
  const sentences = words.join(' ').split(/(?<=[.!?])\s+/).filter(Boolean);
  let current = -1;

  sentences.forEach((sentence) => {
    const tokens = tokenize(sentence).map(fold);
    const mentionsCurrent = current >= 0 && tokens.some((t) => kwTokenSets[current].has(t));
    if (!mentionsCurrent) {
      for (const t of tokens) {
        const idx = kwTokenSets.findIndex((set) => set.has(t));
        if (idx >= 0) { current = idx; break; }
      }
    }
    if (current >= 0) counts[current] += sentence.split(/\s+/).length;
  });

  const total = counts.reduce((a, b) => a + b, 0);
  return total ? counts.map((c) => c / total) : kws.map(() => 1 / kws.length);
}

// ---------- main ----------

function parseKeywords(keywords) {
  const list = Array.isArray(keywords) ? keywords : String(keywords || '').split(/[,;\n]/);
  return list.map((k) => String(k).trim()).filter(Boolean);
}

/**
 * @param {string|string[]} keywords  e.g. "beans,toast" or ["beans", "toast"]
 * @param {string} [text]             free text, truncated to config.maxWords words
 * @param {object} [options]
 * @param {string} [options.lang]           language pack code ("en", "de", "es"...); default "en"
 * @param {string} [options.langsDir]       folder of {lang}.json packs, instead of the bundled langs/
 * @param {object|string} [options.config]  config object, or path to a JSON config file
 * @param {boolean} [options.quirks]        turn quirks mode on or off (overrides config.quirks)
 * @param {string|number} [options.seed]    vary the choices; the same input and seed always give the same slug
 * @returns {object} the slug, the title and everything that went into choosing them (see README)
 */
function explain(keywords, text, options) {
  const config = loadConfig(options);
  const locale = config.locale || {};
  const kws = parseKeywords(keywords);
  if (kws.length === 0) {
    throw new TypeError('quirky-slugger: at least one keyword is required');
  }

  const stop = new Set((config.stopWords || []).map((w) => fold(w.toLowerCase())));
  const kwTokens = new Set(kws.flatMap(tokenize).map(fold));

  // 1. Truncate text to maxWords and tokenise. `origOf` remembers a real word for each stem.
  const allWords = splitWords(text);
  const words = allWords.slice(0, config.maxWords);
  const origOf = new Map();
  const textTokens = [];
  tokenize(words.join(' ')).forEach((raw) => {
    const t = fold(raw);
    if (stop.has(t)) return;
    textTokens.push(t);
    if (!origOf.has(t)) origOf.set(t, raw);
  });

  // The seed decides every choice below. The same input and seed always give the same result;
  // options.seed adds variety.
  const hasSeed = options && options.seed !== undefined && options.seed !== null && options.seed !== '';
  const seed = kws.join(',') + '|' + words.join(' ') + (hasSeed ? '|seed:' + options.seed : '');
  const pick = (list, salt) => list[hash(seed + salt) % list.length];
  const chance = (salt) => hash(seed + salt) / 4294967296;
  // List joiner for {kw}/{rest}: usually "and", sometimes "and the".
  const activeJoiner = chooseJoiner(config, chance);

  // 2. Term frequencies; keywords are boosted in proportion to their weight in the text.
  //    With equal weights every keyword gets exactly config.keywordWeight.
  const weights = weighKeywords(kws, words);
  const tf = new Map();
  textTokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
  kws.forEach((k, i) => {
    const boost = config.keywordWeight * kws.length * weights[i];
    new Set(tokenize(k).map(fold)).forEach((t) => tf.set(t, (tf.get(t) || 0) + boost));
  });

  // 3. TF-IDF vector for the input, and one per pattern.
  const idf = buildIdf(config.patterns);
  const query = new Map();
  tf.forEach((count, term) => query.set(term, count * idf(term)));

  const minScore = config.minScore || 0;
  let bestScore = minScore;
  const scores = [];
  config.patterns.forEach((p, i) => {
    const vec = new Map();
    (p.triggers || []).flatMap(tokenize).map(fold).forEach((t) => vec.set(t, idf(t)));
    const score = cosine(query, vec);
    scores.push({ id: p.id || `pattern-${i}`, score, pattern: p });
    if (score > bestScore) bestScore = score;
  });

  // 4. Choose the pattern.
  //    - Every pattern scoring at least patternSpread (0-1) of the best score is a candidate. The seed
  //      picks one, with chances in proportion to score, so strong matches win most often but close
  //      runners-up still appear. A spread of 1 means only the top pattern(s) can win.
  //    - If nothing scored above minScore, the seed picks one of the trigger-less (generic) patterns.
  const spread = config.patternSpread === undefined ? 1 : clamp01(config.patternSpread);
  const usedFallback = !scores.some((s) => s.score > minScore);
  let candidates;
  let best;
  if (usedFallback) {
    const generic = config.patterns.filter((p) => !p.triggers || p.triggers.length === 0);
    candidates = (generic.length ? generic : [config.patterns[0]]).map((p) => ({ id: p.id || null, score: 0, pattern: p }));
    candidates.forEach((c) => { c.share = 1 / candidates.length; });
    best = pick(candidates, '|pattern').pattern;
  } else {
    candidates = scores.filter((s) => s.score > minScore && s.score >= bestScore * spread);
    const total = candidates.reduce((sum, c) => sum + c.score, 0);
    candidates.forEach((c) => { c.share = c.score / total; });
    let roll = chance('|pattern');
    best = (candidates.find((c) => { roll -= c.share; return roll < 0; }) || candidates[candidates.length - 1]).pattern;
  }
  const chosenScore = usedFallback ? 0 : scores.find((s) => s.pattern === best).score;

  // 5. Choose a template.
  //    In quirks mode, quirkFactor (0-1) is the chance of choosing a quirky template instead of a plain one.
  //    sharedFactor (0-1) is the chance of drawing from the shared templates (any pattern) instead of
  //    the chosen pattern's own, which adds variety within a pattern.
  const quirks = options && options.quirks !== undefined ? options.quirks : config.quirks;
  const quirkFactor = clamp01(config.quirkFactor);
  //    Templates that need more keywords than were given ({kw2}, {kw3}..., {rest}) are skipped.
  //    If that leaves no plain template, all of them are kept and the missing parts are left out.
  //    Connector words ({connect}, {connecting}, {connection}, {connected}) join keywords together,
  //    so a template using one needs at least two keywords.
  const needs = (t) => {
    let n = /\{rest\}|\{connect(?:ing|ion|ed)?\}/.test(t) ? 2 : 1;
    (t.match(/\{kw(\d+)\}/g) || []).forEach((m) => { n = Math.max(n, parseInt(m.slice(3), 10)); });
    return n;
  };
  const usable = (list) => (list || []).filter((t) => needs(t) <= kws.length);
  const plainList = usable(best.templates).length ? usable(best.templates) : best.templates;
  const quirkyList = usable(best.quirkyTemplates);
  const sharedPlain = usable(config.sharedTemplates);
  const sharedQuirky = usable(config.sharedQuirkyTemplates);
  const connectPlain = usable(config.connectTemplates);
  const connectQuirky = usable(config.connectQuirkyTemplates);
  const quirkRoll = Boolean(quirks) && chance('|quirk') < quirkFactor;
  const useQuirky = quirkRoll && (quirkyList.length > 0 || sharedQuirky.length > 0);
  const own = useQuirky ? (quirkyList.length ? quirkyList : plainList) : plainList;
  const shared = useQuirky ? sharedQuirky : sharedPlain;
  const sharedFactor = clamp01(config.sharedFactor);
  //    connectFactor (0-1) is the chance, when two or more keywords are given, of drawing from the
  //    connecting templates, which join and compare the keywords instead of just listing them.
  const connectList = useQuirky ? connectQuirky : connectPlain;
  const connectFactor = clamp01(config.connectFactor);
  const fromConnect = kws.length >= 2 && connectList.length > 0 && chance('|connect') < connectFactor;
  const fromShared = !fromConnect && shared.length > 0 && (own.length === 0 || chance('|shared') < sharedFactor);
  const template = fromConnect
    ? pick(connectList, useQuirky ? '|cq' : '|ct')
    : fromShared ? pick(shared, useQuirky ? '|sq' : '|st') : pick(own, useQuirky ? '|qt' : '|t');

  // 6. Fill placeholders: {kw}, {kw1}, {kw2}..., {rest}, {top}, and in quirks mode {adj}, {suffix}
  const kwSlugs = kws.map(slugify).filter(Boolean);
  let top = '';
  let topCount = 0;
  textTokens.forEach((t) => {
    const word = origOf.get(t) || t;
    if (kwTokens.has(t) || word.length < 3 || /^\d+$/.test(word)) return;
    if (tf.get(t) > topCount) { top = word; topCount = tf.get(t); }
  });

  const modifiers = config.quirkyModifiers || {};
  const adjective = () => ((modifiers.adjectives || []).length ? pick(modifiers.adjectives, '|adj') : '');
  const suffix = () => ((modifiers.suffixes || []).length ? pick(modifiers.suffixes, '|suffix') : '');
  const plainNumbers = Array.isArray(config.numbers) ? config.numbers : [];
  const quirkyNumbers = Array.isArray(config.quirkyNumbers) ? config.quirkyNumbers : [];
  const numberPool = quirkRoll ? plainNumbers.concat(quirkyNumbers) : plainNumbers;
  const number = () => (numberPool.length ? String(pick(numberPool, '|n')) : '');
  //    Connector words, one list per grammatical form, so they always fit the template:
  //    {connect} "how to link ...", {connecting} "linking ...", {connection} "the bridge between ...",
  //    {connected} "... paired with ...".
  const CONNECTORS = {
    connect: ['verbs', '|c-verb'],
    connecting: ['gerunds', '|c-ing'],
    connection: ['nouns', '|c-noun'],
    connected: ['participles', '|c-past']
  };
  const connector = (name) => {
    const list = (config.connectors || {})[CONNECTORS[name][0]] || [];
    return list.length ? pick(list, CONNECTORS[name][1]) : '';
  };
  const kwTitles = kws.map((k) => k.replace(/\s+/g, ' '));
  const used = { connectors: {} };

  const PLACEHOLDER_RE = /\{(kw\d*|rest|n|top|adj|suffix|connect|connecting|connection|connected)\}/;
  const PLACEHOLDER_SPLIT = /(\{(?:kw\d*|rest|n|top|adj|suffix|connect|connecting|connection|connected)\})/;

  // Value of a placeholder as it appears in the slug, or as it appears in the title.
  const valueFor = (name, forTitle) => {
    const n = forTitle ? (v) => v.replace(/-/g, ' ') : (v) => v;
    if (name === 'kw') {
      return forTitle ? joinForTitle(kwTitles, activeJoiner, locale) : joinForSlug(kwSlugs, activeJoiner, locale);
    }
    if (name === 'rest') {
      return forTitle
        ? joinForTitle(kwTitles.slice(1), activeJoiner, locale)
        : joinForSlug(kwSlugs.slice(1), activeJoiner, locale);
    }
    if (name === 'top') { used.top = top; return top; }
    if (name === 'n') { used.number = number(); return used.number; }
    if (name === 'adj') { used.adjective = adjective(); return n(used.adjective); }
    if (name === 'suffix') { used.suffix = suffix(); return n(used.suffix); }
    if (CONNECTORS[name]) { used.connectors[name] = connector(name); return n(used.connectors[name]); }
    const i = parseInt(name.slice(2), 10) - 1;
    return (forTitle ? kwTitles[i] : kwSlugs[i]) || '';
  };

  // Split the template into literal text and placeholders. A literal "a-" before a value that
  // starts with a vowel sound becomes "an-" ("a-{adj}-look" -> "an-accidental-look").
  const useEnArticle = locale.article === 'en-a-an';
  const parts = template.split(PLACEHOLDER_SPLIT).map((part, i, all) => {
    if (/^\{.*\}$/.test(part)) return part;
    const next = all[i + 1] && all[i + 1].match(PLACEHOLDER_RE);
    if (useEnArticle && next && /(^|-)a-$/.test(part) && startsWithVowelSound(slugify(valueFor(next[1], false)))) {
      return part.slice(0, -2) + 'an-';
    }
    return part;
  });
  const render = (forTitle) => parts.map((part) => {
    const m = part.match(PLACEHOLDER_RE);
    return m ? valueFor(m[1], forTitle) : part;
  }).join('');

  const full = slugify(render(false));
  const slug = truncateSlug(full, config.maxSlugLength);

  // 7. The title: same template, but keywords keep their own wording and the words are title-cased.
  //    It is not affected by maxSlugLength.
  const titleText = parts.map((part) => {
    const m = part.match(PLACEHOLDER_RE);
    if (m) return valueFor(m[1], true);
    return part.replace(/-/g, ' ').replace(CONTRACTION_RE, (w) => CONTRACTIONS[w]);
  }).join('');
  // Punctuation written into a template (",", ":", "?", "!") belongs to the title but not the slug.
  const title = titleCase(titleText.replace(/\s+/g, ' ').replace(/\s+([,;:!?])/g, '$1').trim(), locale);

  return {
    slug,
    title,
    lang: config.lang,
    pattern: best.id || null,
    score: chosenScore,
    usedFallback,
    scores: scores.map((s) => ({ id: s.id, score: s.score })).sort((a, b) => b.score - a.score),
    candidates: candidates.map((c) => ({ id: c.id, score: c.score, share: c.share })),
    template,
    sharedTemplate: fromShared,
    connectTemplate: fromConnect,
    connectors: used.connectors,
    quirksMode: Boolean(quirks),
    quirky: useQuirky,
    quirkFactor,
    joiner: activeJoiner,
    seed: hasSeed ? String(options.seed) : null,
    adjective: used.adjective,
    suffix: used.suffix,
    number: used.number,
    top: used.top,
    keywords: kws.map((keyword, i) => ({ keyword, weight: weights[i] })),
    wordsUsed: words.length,
    wordsIgnored: allWords.length - words.length,
    truncated: slug.length < full.length,
    untruncatedSlug: full
  };
}

/**
 * @param {string|string[]} keywords
 * @param {string} [text]
 * @param {object} [options]  same options as explain()
 * @returns {{slug: string, title: string}}
 */
function quirkySlug(keywords, text, options) {
  const result = explain(keywords, text, options);
  return { slug: result.slug, title: result.title };
}

/**
 * Returns each keyword's share of the text, e.g. [{ keyword: 'tea', weight: 0.1 }, ...]
 * Weights sum to 1 and are in the same order as the keywords.
 */
function keywordWeights(keywords, text, options) {
  const config = loadConfig(options);
  const kws = parseKeywords(keywords);
  if (kws.length === 0) {
    throw new TypeError('quirky-slugger: at least one keyword is required');
  }
  const words = splitWords(text).slice(0, config.maxWords);
  const weights = weighKeywords(kws, words);
  return kws.map((keyword, i) => ({ keyword, weight: weights[i] }));
}

module.exports = quirkySlug;
module.exports.quirkySlug = quirkySlug;
module.exports.keywordWeights = keywordWeights;
module.exports.explain = explain;
module.exports.slugify = slugify;
