/* ============================================================
   Strumenti (schemi) e istruzioni per l'IA.
   Ogni funzione restituisce {system, messages, tool, maxTokens} da passare a claudeTool().
   ============================================================ */
import { GRAMMAR_IDS, GRAMMAR_TOPICS, levelInfo } from './levels.js';
import { STAGE_GUIDE } from './story.js';

const accentName = (s) => (s.accent === 'uk' ? 'British' : 'American');
const ipaName = (s) => (s.accent === 'uk' ? 'British (RP)' : 'General American');
/** pronuncia figurata: solo lettere italiane (niente simboli IPA) */
const PRON = 'Italian-letter respelling for an Italian reader, NOT IPA: write how the words sound using only ordinary Italian letters and accents, words separated by spaces, no slashes, no IPA symbols, no punctuation; mark the stressed vowel of each word with a grave or acute accent. Examples: "I would like a coffee" -> "ai ud laik e cofi" (with stress "ai ud laik e còfi"), "water" -> "uòrer", "thought" -> "thòt", "ship" -> "scip", "think" -> "thìnk".';
const WORDS_BY_LENGTH = { short: 500, medium: 800, long: 1200, xl: 1700 };
export const wordsFor = (s) => (s.sceneLength === 'custom' ? Math.min(2500, Math.max(300, Number(s.customWords) || 1200)) : (WORDS_BY_LENGTH[s.sceneLength] || 1200));
const FOCUS = { mix: '', travel: 'Favour typical travel situations (transport, accommodation, sightseeing, problems on the road).', daily: 'Favour everyday life situations (shops, services, home, neighbours, small talk).', social: 'Favour social situations (meeting people, invitations, parties, conversations about hobbies, family and opinions).', work: 'Favour work-related situations (meetings, emails, phone calls, colleagues, business travel).' };

const SENT = (needIpa) => ({
  type: 'object',
  properties: Object.assign({
    en: { type: 'string', description: 'One sentence or one line of dialogue, exactly as the learner will read it.' },
    newPara: { type: 'boolean', description: 'true on the first sentence of every new paragraph.' }
  }, needIpa ? { ipa: { type: 'string', description: 'Pronunciation of this exact sentence, word by word. ' + PRON } } : {}),
  required: needIpa ? ['en', 'ipa'] : ['en']
});

const GLOSSARY_ITEM = {
  type: 'object',
  properties: {
    surface: { type: 'string', description: 'The word or phrase copied EXACTLY as written in the text (same inflection).' },
    it: { type: 'string', description: 'Short natural Italian translation for this context.' },
    ipa: { type: 'string', description: 'Pronunciation of the surface. ' + PRON },
    kind: { type: 'string', enum: ['word', 'phrasal', 'idiom', 'expression', 'irregular', 'pattern'] },
    visual: { type: 'boolean', description: 'true only if it is a concrete object, place or clear physical action that can be drawn as a simple picture.' }
  },
  required: ['surface', 'it', 'ipa', 'kind']
};

const HINT = {
  type: 'object',
  properties: { en: { type: 'string' }, it: { type: 'string' } },
  required: ['en', 'it']
};

/* ================================ EPISODIO ================================ */
export function episodeTool(needIpa) {
  return {
    name: 'deliver_episode',
    description: 'Deliver today\'s episode: the scene text, glossary, role-play and story diary update.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short English title of the episode.' },
        location: { type: 'string', description: 'Short English name of the place of the scene.' },
        sentences: { type: 'array', minItems: 12, items: SENT(needIpa) },
        glossary: { type: 'array', minItems: 4, maxItems: 20, items: GLOSSARY_ITEM },
        roleplay: {
          type: 'object',
          description: 'A short role-play the learner will practise in writing with the tutor right after reading.',
          properties: {
            situation_en: { type: 'string', description: 'One or two sentences explaining the situation to the learner.' },
            tutor_role_en: { type: 'string', description: 'Who the tutor plays, e.g. "a check-in agent".' },
            opening_en: { type: 'string', description: 'The tutor\'s first line.' },
            hints: { type: 'array', minItems: 2, maxItems: 4, items: HINT }
          },
          required: ['situation_en', 'tutor_role_en', 'opening_en', 'hints']
        },
        teaser_it: { type: 'string', description: 'One Italian sentence that makes the learner curious about the next episode, without spoilers.' },
        hook_en: { type: 'string', description: 'The open question or cliffhanger this episode ends with, in English, one sentence.' },
        diary: {
          type: 'object',
          properties: {
            summary_en: { type: 'string', description: '2-3 sentences summarising what happened in this episode, for continuity.' },
            characters: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, role_en: { type: 'string' }, look_en: { type: 'string', description: 'Fixed visual description for illustrations.' } }, required: ['name', 'role_en'] } },
            threads: { type: 'array', maxItems: 5, items: { type: 'string' }, description: 'The complete current list of open questions and mysteries (replaces the previous list).' }
          },
          required: ['summary_en', 'threads']
        },
        image_prompt: { type: 'string', description: 'One English sentence describing the key moment as a colourful illustration. No text or signs with words.' },
        grammar_focus: { type: 'array', items: { type: 'string', enum: GRAMMAR_IDS }, description: 'Grammar topics clearly used in the text.' }
      },
      required: ['title', 'location', 'sentences', 'glossary', 'roleplay', 'teaser_it', 'hook_en', 'diary', 'image_prompt']
    }
  };
}

export function buildEpisodeRequest(ctx) {
  const { settings: s, info, setting, level, targets, review, weak, diary, hook } = ctx;
  const L = levelInfo(level);
  const words = wordsFor(s);
  const needIpa = s.phonetics === 'sentence';
  const system = [
    'You are the author of a daily reading course for an Italian adult who is learning English to travel and to make friends abroad (current level about A2+, goal B1).',
    'You write ONE episode per day: a realistic scene of travel or everyday life inside a continuing story. Everything in it must be genuinely useful in real conversations.',
    '',
    'RULES',
    '- Narrate in the first person ("I"); the narrator is ' + (s.userName || 'Mino') + '. About half of the text must be natural dialogue with the exact phrases a traveller needs (polite requests, small talk, problems, directions, ordering).',
    '- Use ' + accentName(s) + ' English (spelling and vocabulary).',
    '- Respect the requested level strictly: sentence length, tenses and vocabulary. Do not use words clearly above the level, except the target items and the glossary words.',
    '- Every sentence or line of dialogue is a separate item in "sentences". Keep the quotation marks in the text. Set newPara=true on the first sentence of each paragraph.',
    '- Use ALL target items naturally inside the text (inflect them if needed; phrasal verbs and patterns must appear whole). Reuse the review words naturally when they fit.',
    '- The glossary has one entry for every target item plus a few other useful words or phrases (8 to 16 entries in total). "surface" must appear exactly in "sentences" (same spelling and inflection).',
    needIpa
      ? '- Give the pronunciation (' + ipaName(s) + ' accent) for EVERY sentence in "ipa", matching the sentence exactly. ' + PRON
      : '- Do not provide pronunciation for the sentences (only for the glossary entries).',
    '- Continue the story coherently with the diary. Advance the plot a little. Never resolve the central mystery early. End the scene with a small hook that makes the learner curious about tomorrow.',
    '- Keep it warm, light and a little humorous. No violence, no politics, nothing distressing.',
    '- The role-play must be a natural exchange based on a key moment of the scene, where the tutor plays another person and the learner plays himself.',
    '- Italian text must be natural, modern Italian.',
    'Always answer by calling the tool deliver_episode.'
  ].join('\n');

  const lines = [];
  lines.push('EPISODE #' + info.number + ' — Season ' + info.season + ' "' + info.title_en + '", episode ' + (info.index + 1) + ' of ' + info.total + ' (stage: ' + info.stage + ' — ' + (STAGE_GUIDE[info.stage] || '') + ')');
  if (info.opening) lines.push('This is the very first episode: introduce the narrator and the situation, and plant the beginning of the mystery lightly.');
  if (info.finale) lines.push('This is the season finale: resolve this season\'s thread and end with a new hook for the next season.');
  lines.push('SETTING FOR TODAY: ' + setting);
  if (s.destinations && s.destinations.trim()) lines.push('The learner mostly travels to: ' + s.destinations.trim() + ' (use these places for local colour when it fits).');
  lines.push('LEVEL ' + level.toFixed(1) + '/10 (' + L.cefr + '). Average sentence length about ' + L.avgWords + ' words, never above ' + L.maxWords + '. Grammar available: ' + L.grammar + '. Vocabulary: ' + L.vocab + '.');
  lines.push('LENGTH: at least ' + Math.round(words * 1.15) + ' words in total (this is a long reading: develop the scene fully with several dialogues, descriptions and small events; do not stop early).');
  if (FOCUS[s.focus]) lines.push(FOCUS[s.focus]);
  if (weak && weak.length) lines.push('GRAMMAR THE LEARNER STRUGGLES WITH (use these naturally several times): ' + weak.map((w) => w.en).join('; ') + '.');
  lines.push('');
  lines.push('TARGET ITEMS TO TEACH TODAY (' + targets.length + '):');
  targets.forEach((t) => {
    lines.push('- ' + t.text + ' [' + t.kind + ']' + (t.note ? ' — ' + t.note : '') + (t.example ? ' — e.g. ' + t.example : ''));
  });
  if (review && review.length) {
    lines.push('');
    lines.push('REVIEW WORDS to reuse if natural (do not explain them): ' + review.join(', ') + '.');
  }
  lines.push('');
  lines.push('SEASON PREMISE: ' + info.premise);
  lines.push('STORY DIARY');
  lines.push('Summary so far: ' + (diary.summary || '(nothing yet — this is the beginning)'));
  if (diary.recent && diary.recent.length) lines.push('Last episodes: ' + diary.recent.join(' | '));
  if (diary.characters && diary.characters.length) lines.push('Characters: ' + diary.characters.map((c) => c.name + ' (' + (c.role_en || '') + (c.look_en ? '; looks: ' + c.look_en : '') + ')').join('; '));
  if (diary.threads && diary.threads.length) lines.push('Open threads: ' + diary.threads.join(' | '));
  if (hook && hook.en) lines.push('Yesterday\'s hook: ' + hook.en);

  return {
    system,
    messages: [{ role: 'user', content: lines.join('\n') }],
    tool: episodeTool(needIpa),
    maxTokens: Math.min(24000, needIpa ? Math.round(3000 + words * 9) : Math.round(2500 + words * 4.5)),
    needIpa, words
  };
}

/* ================================== TEST ================================== */
const TEST_Q = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['mcq', 'cloze', 'order', 'translate', 'listen'] },
    prompt: { type: 'string', description: 'mcq: the question. cloze: an English sentence with exactly one ___ gap. translate: an Italian sentence to translate into English. order: the Italian meaning of the sentence. listen: leave empty.' },
    answer: { type: 'string', description: 'The correct option (mcq, cloze, listen) or the correct English sentence (translate). For order: the full correct sentence.' },
    distractors: { type: 'array', items: { type: 'string' }, description: 'mcq/cloze: 3 plausible wrong options of the same kind. listen: 2-3 similar sentences differing by a key word.' },
    words: { type: 'array', items: { type: 'string' }, description: 'order only: the sentence split into 4-9 chunks in the correct order.' },
    accept: { type: 'array', items: { type: 'string' }, description: 'translate only: other acceptable English translations (0-3).' },
    explanation_it: { type: 'string', description: 'Short Italian explanation of why the answer is right (and the rule if it is a grammar question).' },
    focus: { type: 'string', enum: ['vocab', 'phrase', 'grammar'] },
    target: { type: 'string', description: 'The English word, phrase or structure being tested.' },
    target_it: { type: 'string', description: 'Italian meaning of the target.' },
    rule: { type: 'string', enum: [''].concat(GRAMMAR_IDS), description: 'Grammar topic id if focus is grammar, otherwise empty.' }
  },
  required: ['type', 'answer', 'explanation_it', 'focus', 'target', 'target_it']
};

export const TEST_TOOL = {
  name: 'deliver_test',
  description: 'Deliver the quiz questions.',
  input_schema: { type: 'object', properties: { questions: { type: 'array', minItems: 6, items: TEST_Q } }, required: ['questions'] }
};

export function buildTestRequest(ctx) {
  const { settings: s, level, count, sceneSentences, todayWords, reviewItems, weak, errors } = ctx;
  const L = levelInfo(level);
  const system = [
    'You write short quizzes for an Italian adult learning English (' + L.cefr + ', ' + accentName(s) + ' English).',
    'Each question tests exactly ONE thing and has exactly ONE correct answer. Distractors must be plausible but clearly wrong for a learner who knows the item.',
    'Never write questions about capital letters, punctuation or spelling. Test meaning, usage, grammar and natural phrasing.',
    'Question types: "mcq" (meaning of a word or phrase EN→IT or IT→EN, or choose the correct sentence), "cloze" (one gap in an English sentence taken or adapted from the scene), "order" (reorder the chunks of a sentence from the scene), "translate" (Italian sentence to English, short and natural, with alternatives in "accept"), "listen" (the learner hears the answer sentence and must pick it among similar sentences).',
    'Prompts of mcq-meaning questions are written in Italian, for example: Che cosa significa “boarding pass”?. Options of IT→EN questions are English, options of EN→IT questions are Italian.',
    'Use language at the learner\'s level. Explanations are in Italian, one or two short sentences, naming the grammar rule when relevant.',
    'Always answer by calling the tool deliver_test.'
  ].join('\n');
  const lines = [];
  lines.push('Write exactly ' + count + ' questions with a good mix: about 30% mcq, 25% cloze, 10-15% order, 15-20% translate, 10-15% listen.');
  lines.push('At least half of the questions must be about the items below (today\'s words first, then review items and weak grammar).');
  if (todayWords.length) lines.push('TODAY\'S WORDS AND PHRASES: ' + todayWords.map((w) => w.en + ' = ' + w.it).join('; '));
  if (reviewItems.length) lines.push('REVIEW ITEMS FROM EARLIER DAYS: ' + reviewItems.map((w) => w.en + (w.it ? ' = ' + w.it : '')).join('; '));
  if (weak.length) lines.push('WEAK GRAMMAR TOPICS (id: name): ' + weak.map((w) => w.id + ': ' + w.en).join('; '));
  if (errors.length) lines.push('RECENT MISTAKES BY THE LEARNER: ' + errors.map((e) => '"' + e.wrong + '" → "' + e.right + '"').join('; '));
  lines.push('');
  lines.push('SOME SENTENCES FROM TODAY\'S SCENE (use or adapt them):');
  sceneSentences.forEach((x) => lines.push('- ' + x));
  lines.push('');
  lines.push('Grammar topic ids you may use in "rule": ' + GRAMMAR_TOPICS.map((t) => t.id).join(', ') + '.');
  return { system, messages: [{ role: 'user', content: lines.join('\n') }], tool: TEST_TOOL, maxTokens: 900 + count * 330 };
}

/* ============================== TUTOR / CHAT ============================== */
export function tutorTool(needIpa) {
  return {
    name: 'tutor_turn',
    description: 'Deliver the tutor\'s next turn of the conversation with corrections and hints.',
    input_schema: {
      type: 'object',
      properties: Object.assign({
        reply_en: { type: 'string', description: 'The tutor\'s reply in English, 1-3 short sentences, ending with a question or a prompt that keeps the conversation going.' },
        reply_it: { type: 'string', description: 'Italian translation of the reply.' },
        corrections: {
          type: 'array', maxItems: 5,
          description: 'Substantive mistakes in the learner\'s LAST message only. Empty when there are none.',
          items: {
            type: 'object',
            properties: {
              wrong: { type: 'string', description: 'The wrong piece, copied from the learner\'s message (short).' },
              correct: { type: 'string', description: 'The corrected piece, natural English.' },
              explanation_it: { type: 'string', description: 'Why, in Italian, one short sentence.' },
              kind: { type: 'string', enum: ['word', 'phrase', 'grammar'] },
              rule: { type: 'string', enum: [''].concat(GRAMMAR_IDS) }
            },
            required: ['wrong', 'correct', 'explanation_it', 'kind']
          }
        },
        hints: { type: 'array', minItems: 2, maxItems: 3, items: HINT, description: 'Short useful phrases the learner could use in the next answer.' },
        mood: { type: 'string', enum: ['neutral', 'happy', 'think'] }
      }, needIpa ? { reply_ipa: { type: 'string', description: 'Pronunciation of reply_en. ' + PRON } } : {}),
      required: ['reply_en', 'reply_it', 'corrections', 'hints']
    }
  };
}

const STRICT = {
  light: 'Report at most 1 mistake, only if it really blocks understanding or is a serious grammar error, in "corrections".',
  normal: 'Report at most 3 SUBSTANTIVE mistakes (grammar, wrong word, unnatural phrase, Italian words used instead of English) in "corrections", the most useful first.',
  strict: 'Report up to 5 mistakes in "corrections", including unnatural phrasing and weak word choice, the most useful first.'
};

export function buildTutorRequest(ctx) {
  const { settings: s, level, history, scenario } = ctx;
  const L = levelInfo(level);
  const needIpa = s.phonetics === 'sentence';
  const system = [
    'You are ' + (s.tutorName || 'Ollie') + ', a warm, patient and slightly playful English teacher chatting with ' + (s.userName || 'Mino') + ', an Italian adult at level ' + L.cefr + ' who wants English for travelling and making friends abroad.',
    'Speak ' + accentName(s) + ' English at the learner\'s level (short sentences of about ' + L.avgWords + ' words, common vocabulary). Replies are 1-3 short sentences and always end with a question or an invitation that keeps the conversation going.',
    scenario && scenario.situation
      ? 'ROLE-PLAY: ' + scenario.situation + (scenario.role ? ' You play: ' + scenario.role + '.' : '') + ' Stay in the role, like a real person in that situation, but you may step out briefly to help.'
      : 'This is a free conversation: follow the learner\'s topics, or propose a simple travel or everyday topic if they have nothing to say.',
    'CORRECTIONS: look only at the learner\'s LAST message. ' + STRICT[s.strictness || 'normal'] + ' Never correct capital letters, punctuation or typos. If the message is fine, return an empty list and praise something specific in the reply. Do not mention the corrections inside "reply_en": it is shown separately. Explanations are in ' + (s.explainLang === 'en' ? 'simple English' : 'Italian') + '.',
    'If the learner writes in Italian, answer in simple English, invite them to try in English, and give useful phrases in "hints".',
    '"hints" are 2-3 short phrases the learner could use to answer you (with Italian meaning).',
    'Always answer by calling the tool tutor_turn.'
  ].join('\n');
  const messages = history.map((m) => ({ role: m.role, content: m.text }));
  return { system, messages, tool: tutorTool(needIpa), maxTokens: needIpa ? 900 : 700 };
}

/* ============================ PAROLA / TRADUZIONE ============================ */
export const LOOKUP_TOOL = {
  name: 'lookup_word',
  description: 'Translation and pronunciation of an English word or expression in its context.',
  input_schema: {
    type: 'object',
    properties: {
      it: { type: 'string', description: 'Short Italian translation of the word as used in the sentence (1-4 words; for idioms the Italian equivalent or a short explanation).' },
      ipa: { type: 'string', description: 'Pronunciation. ' + PRON },
      pos: { type: 'string', description: 'Part of speech in Italian: nome, verbo, aggettivo, avverbio, espressione, ecc.' },
      base: { type: 'string', description: 'The base form (infinitive of a verb, singular of a noun) if different from the word.' },
      phrase: { type: 'string', description: 'If the word is part of a phrasal verb, verb+preposition, idiom, collocation or fixed expression in THIS sentence, the whole expression (e.g. "gave up", "look forward to", "in the end"). For a separable phrasal verb split by an object ("picked it up") give the dictionary form ("pick up"). Empty string if the word stands alone.' },
      visual: { type: 'boolean', description: 'true only for concrete objects, places or clear actions that can be drawn.' }
    },
    required: ['it', 'ipa', 'pos']
  }
};

export function buildLookupRequest(word, sentence, s) {
  return {
    system: 'You are a bilingual English-Italian dictionary for an Italian learner. Give the meaning the word has in the given sentence. IMPORTANT: always check whether the word belongs to a multi-word expression in that sentence (phrasal verb such as "give up", verb + preposition such as "depend on", idiom, fixed phrase). If it does, set "phrase" to the whole expression and make "it", "ipa" and "pos" describe the WHOLE expression, not the single word. Pronunciation: ' + ipaName(s) + ' accent, written as follows. ' + PRON + ' Always answer by calling the tool lookup_word.',
    messages: [{ role: 'user', content: 'Word: "' + word + '"\nSentence: "' + (sentence || '') + '"' }],
    tool: LOOKUP_TOOL, maxTokens: 400
  };
}

export const TRANSLATE_TOOL = {
  name: 'deliver_translations',
  description: 'Italian translations of the sentences, in the same order.',
  input_schema: { type: 'object', properties: { translations: { type: 'array', items: { type: 'string' } } }, required: ['translations'] }
};

export function buildTranslateRequest(sentences) {
  return {
    system: 'Translate English sentences into natural, modern Italian for a language learner (faithful but idiomatic). Return exactly one translation per sentence, in the same order. Always answer by calling the tool deliver_translations.',
    messages: [{ role: 'user', content: sentences.map((x, i) => (i + 1) + '. ' + x).join('\n') }],
    tool: TRANSLATE_TOOL, maxTokens: 300 + sentences.length * 90
  };
}

/* ============================== REGOLA GRAMMATICALE ============================== */
export const RULE_TOOL = {
  name: 'explain_rule',
  description: 'Explanation of an English grammar rule for an Italian learner.',
  input_schema: {
    type: 'object',
    properties: {
      name_it: { type: 'string', description: 'Name of the rule in Italian (with the English term).' },
      when_it: { type: 'string', description: 'When and why it is used, in Italian, 2-3 sentences.' },
      form_it: { type: 'string', description: 'How it is built (formula with an example), in Italian.' },
      mistake_it: { type: 'string', description: 'Why Italians often get it wrong and what to remember, in Italian.' },
      examples: { type: 'array', minItems: 3, maxItems: 4, items: { type: 'object', properties: { en: { type: 'string' }, it: { type: 'string' } }, required: ['en', 'it'] } }
    },
    required: ['name_it', 'when_it', 'form_it', 'mistake_it', 'examples']
  }
};

export function buildRuleRequest(ruleId, wrong, right) {
  const t = GRAMMAR_TOPICS.find((x) => x.id === ruleId);
  const topic = t ? t.en : ruleId;
  return {
    system: 'You are an English grammar teacher for Italian adults (level A2-B1). Explain clearly, simply and concretely, in Italian, with short English examples at A2-B1 level. Always answer by calling the tool explain_rule.',
    messages: [{ role: 'user', content: 'Grammar topic: ' + topic + '.' + (wrong ? '\nThe learner wrote: "' + wrong + '"' : '') + (right ? '\nThe correct version is: "' + right + '"' : '') + '\nExplain the rule so that the learner understands why the correct version is right.' }],
    tool: RULE_TOOL, maxTokens: 900
  };
}

/* ================================== ARTICOLO ================================== */
export function articleTool(needIpa) {
  return {
    name: 'deliver_article',
    description: 'Deliver the daily article adapted to the learner\'s level.',
    input_schema: {
      type: 'object',
      properties: {
        headline_en: { type: 'string' },
        source_name: { type: 'string', description: 'Name of the news outlet of the original story (or "Original text").' },
        source_url: { type: 'string', description: 'URL of the original article, empty if none.' },
        summary_it: { type: 'string', description: 'Two-sentence summary in Italian.' },
        sentences: { type: 'array', minItems: 8, items: SENT(needIpa) },
        glossary: { type: 'array', minItems: 4, maxItems: 10, items: GLOSSARY_ITEM },
        questions: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', properties: { question: { type: 'string' }, answer: { type: 'string' }, distractors: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string' } } }, required: ['question', 'answer', 'distractors'] } },
        discussion_en: { type: 'string', description: 'An open, personal question to talk about the story ("Would you ever...?").' }
      },
      required: ['headline_en', 'source_name', 'summary_it', 'sentences', 'glossary', 'questions', 'discussion_en']
    }
  };
}

export function articleSystem(s, level) {
  const L = levelInfo(level);
  const needIpa = s.phonetics === 'sentence';
  return [
    'You prepare a short daily reading for an Italian adult learning English to travel and meet people abroad.',
    'Pick an interesting, positive or neutral story suitable for conversation (avoid crime, war, tragedies and divisive politics). ALWAYS rewrite the story in your own words; never copy sentences from the original.',
    'Write it at level ' + L.cefr + ' (' + level.toFixed(1) + '/10): average sentence about ' + L.avgWords + ' words, grammar: ' + L.grammar + ', in ' + accentName(s) + ' English. About 200-260 words, split into sentences; set newPara=true at the start of each paragraph.',
    needIpa ? 'Give the pronunciation (' + ipaName(s) + ' accent) for every sentence. ' + PRON : 'No IPA for sentences.',
    'The glossary lists 6-8 useful words or phrases copied exactly as written in the text. Three comprehension questions, each with the correct answer and two wrong options, in simple English.',
    'Always finish by calling the tool deliver_article.'
  ].join('\n');
}

/* ============================== LIBRI (EPUB) ============================== */
export const IPA_TOOL = {
  name: 'deliver_ipa',
  description: 'Pronunciation of each sentence in Italian letters, same order.',
  input_schema: { type: 'object', properties: { ipa: { type: 'array', items: { type: 'string' } } }, required: ['ipa'] }
};
export function buildIpaRequest(sentences, accent) {
  return {
    system: 'You are a phonetician writing for Italian readers. For each English sentence give the pronunciation (' + (accent === 'uk' ? 'British RP' : 'General American') + ' accent) of the whole sentence as normally spoken. ' + PRON + ' One entry per sentence, same order. Always answer by calling the tool deliver_ipa.',
    messages: [{ role: 'user', content: sentences.map((x, i) => (i + 1) + '. ' + x).join('\n') }],
    tool: IPA_TOOL, maxTokens: 400 + sentences.reduce((a, x) => a + x.length * 1.6, 0)
  };
}

export const BOOKWORDS_TOOL = {
  name: 'pick_words',
  description: 'Useful words and expressions from a book page for an Italian learner.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array', minItems: 3, maxItems: 14,
        items: {
          type: 'object',
          properties: {
            surface: { type: 'string', description: 'Exact word or expression as it appears in the text (keep it contiguous in the text).' },
            it: { type: 'string', description: 'Italian meaning in this context.' },
            ipa: { type: 'string', description: 'Pronunciation. ' + PRON },
            kind: { type: 'string', enum: ['word', 'phrasal', 'idiom', 'collocation'] }
          },
          required: ['surface', 'it', 'ipa', 'kind']
        }
      }
    },
    required: ['items']
  }
};
export function buildBookWordsRequest(text, level) {
  return {
    system: 'You help an Italian adult learner (current level about ' + level.toFixed(1) + ' on a 1-10 scale, where 4 is A2+ and 6 is B1) read an English book. From the passage choose 8-12 words or expressions worth learning: useful in real life, slightly above the learner\'s current level, not proper nouns, not archaic or rare literary words. Prefer phrasal verbs, collocations and idioms. Each "surface" must appear exactly in the passage. Always answer by calling the tool pick_words.',
    messages: [{ role: 'user', content: text }],
    tool: BOOKWORDS_TOOL, maxTokens: 2200
  };
}

/* ============================== LEZIONE SU UNA PAGINA DI LIBRO ============================== */
export const LESSON_TOOL = {
  name: 'page_lesson',
  description: 'A guided mini-lesson on a passage, written by the tutor for an Italian learner.',
  input_schema: {
    type: 'object',
    properties: {
      tutor_intro_it: { type: 'string', description: 'The tutor speaking to the learner in Italian, 2-3 warm sentences: what this passage is about and what to pay attention to.' },
      translation_it: { type: 'string', description: 'Faithful, natural Italian translation of the whole passage, keeping paragraph breaks as \\n\\n.' },
      grammar: {
        type: 'array', maxItems: 4,
        items: { type: 'object', properties: {
          rule_it: { type: 'string', description: 'Name of the grammar point in Italian (with the English term).' },
          example_en: { type: 'string', description: 'A short fragment copied exactly from the passage that shows it.' },
          explain_it: { type: 'string', description: 'Clear explanation in Italian, 2-3 sentences, including how Italians usually get it wrong.' }
        }, required: ['rule_it', 'example_en', 'explain_it'] }
      },
      pronunciation: {
        type: 'array', maxItems: 5,
        items: { type: 'object', properties: {
          word: { type: 'string' }, ipa: { type: 'string', description: 'Pronunciation. ' + PRON },
          tip_it: { type: 'string', description: 'Short Italian tip: stress, silent letters, vowel sounds Italians find hard.' }
        }, required: ['word', 'ipa', 'tip_it'] }
      },
      words: {
        type: 'array', minItems: 4, maxItems: 10,
        items: { type: 'object', properties: {
          surface: { type: 'string', description: 'Exact word or expression as in the passage.' }, it: { type: 'string' }, ipa: { type: 'string' },
          kind: { type: 'string', enum: ['word', 'phrasal', 'idiom', 'collocation'] }
        }, required: ['surface', 'it', 'ipa', 'kind'] }
      }
    },
    required: ['tutor_intro_it', 'translation_it', 'grammar', 'pronunciation', 'words']
  }
};
export function buildLessonRequest(text, level, tutorName, accent) {
  return {
    system: 'You are ' + tutorName + ', a patient English tutor for an Italian adult (level about ' + level.toFixed(1) + '/10, where 4 is A2+ and 6 is B1). You guide the learner through a passage of a book or document they are reading. Be concrete and brief: translate faithfully, pick only the grammar points that really appear in the passage and matter at this level, flag the hardest pronunciations (' + (accent === 'uk' ? 'British' : 'American') + ' English), and choose words and expressions worth memorising (useful in real life, slightly above the learner\'s level, no proper nouns). Explanations are in Italian. Never invent text that is not in the passage. Always answer by calling the tool page_lesson.',
    messages: [{ role: 'user', content: text }],
    tool: LESSON_TOOL, maxTokens: 1800 + Math.round(text.length / 3)
  };
}
