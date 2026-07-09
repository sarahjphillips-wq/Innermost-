const CRISIS_PATTERN = /\b(kill(ing)?\s*my\s*self|suicide|suicidal|end(ing)?\s*(my\s*life|it\s*all)|want(ing)?\s*to\s*die|wish(ed)?\s*i\s*(was|were)\s*dead|don'?t\s*want\s*to\s*(be\s*alive|live|exist)|hurt(ing)?\s*my\s*self|harm(ing)?\s*my\s*self|self[\s-]?harm|not\s*worth\s*living|better\s*off\s*dead|no\s*reason\s*to\s*live|giving\s*up|give\s*up\s*on\s*(everything|life|myself)|can'?t\s*(do\s*this|go\s*on|cope|take\s*(this|it)\s*anymore)|no\s*point\s*(in\s*)?(anything|living|trying)|what'?s\s*the\s*point|everything\s*feels\s*pointless|want\s*it\s*to\s*(all\s*)?stop|can'?t\s*keep\s*(going|doing\s*this))\b/i;

const MODEL = 'claude-haiku-4-5-20251001';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }
  const { question, entries } = body;
  if (!question || typeof question !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing question' }), { status: 400 });
  }

  // First line of defence — regex crisis check, before any API call at all.
  if (CRISIS_PATTERN.test(question)) {
    return new Response(JSON.stringify({
      answer: "I'm really glad you told me this, even here. This isn't something I can reflect back the way I normally would — please reach out to someone who can actually help right now. In New Zealand, you can call or text 1737 anytime, free, to talk to a trained counsellor. If you're in immediate danger, call 111."
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const list = Array.isArray(entries) ? entries : [];
  const indexed = list.map((e, i) => ({ i, cat: e.cat || '', q: e.q || '', a: e.a || '' }));

  try {
    // STEP 1 — Claude identifies which entries are relevant. Returns indices only, nothing else.
    const relevantIndices = indexed.length
      ? await findRelevantIndices(env.ANTHROPIC_API_KEY, question, indexed)
      : [];

    // STEP 2 — deterministic count in JS. This is the verified fact, not a model claim.
    const verifiedCount = relevantIndices.length;
    const relevantEntries = relevantIndices.map((i) => indexed[i]).filter(Boolean);

    // STEP 3 — Claude writes the actual reflection, given the verified count as a fixed fact.
    const answer = await writeReflection(env.ANTHROPIC_API_KEY, question, relevantEntries, verifiedCount);

    return new Response(JSON.stringify({ answer }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const message = err && err.status ? err.message : 'Something went wrong.';
    return new Response(JSON.stringify({ error: message }), { status });
  }
}

async function findRelevantIndices(apiKey, question, indexed) {
  const list = indexed.map((e) => `[${e.i}] (${e.cat}) Q: ${e.q}\nA: ${e.a}`).join('\n\n');
  const sys = `You are a relevance filter for a personal journaling app. Given a question and a list of journal entries, return ONLY a JSON array of the integer indices of entries that are genuinely relevant to the question — entries that speak to the same pattern, situation, or feeling being asked about. No prose, no markdown, no explanation. Example: [2,7,9]. If nothing is relevant, return [].`;
  const userContent = `Question: ${question}\n\nEntries:\n${list}`;
  const text = await callClaude(apiKey, sys, userContent, 400);
  return parseIndexArray(text, indexed.length);
}

function parseIndexArray(text, maxLen) {
  if (!text) return [];
  const match = text.match(/\[[\s\S]*?\]/);
  let arr;
  try {
    arr = JSON.parse(match ? match[0] : text);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    const n = typeof v === 'number' ? v : parseInt(v, 10);
    if (Number.isInteger(n) && n >= 0 && n < maxLen && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

async function writeReflection(apiKey, question, relevantEntries, verifiedCount) {
  const ctx = relevantEntries.length
    ? relevantEntries.map((e) => `[${e.cat}] Q: ${e.q}\nA: ${e.a}`).join('\n\n')
    : 'None.';

  const sys = `You are Ask Innermost. Reflect this person's own patterns back using only their journal entries below. Never give reassurance, advice, or opinion. Never ask trailing questions. Use their own words. Brief and precise.

The count of relevant entries has already been counted in code and is a fixed, verified fact: ${verifiedCount}. If you reference a count, use this exact number. Do not recount, estimate, round, or contradict it. If the verified count is 0, say plainly that there's nothing in the record yet that speaks to this — do not invent a pattern.

Structure every answer in exactly these parts, nothing added:
1. A direct quote from a real past entry below that's genuinely relevant (skip this step if the verified count is 0).
2. The verified count and the direction (e.g., "three regrets to one exception").
3. One closing line that acknowledges the evidence exists — nothing more. Never say "you should," never state a probability or percentage, never claim to know their motive.

Forbidden, even if it feels insightful: naming what the person is "really" doing, describing what their entries add up to as a "pattern," "void," "story," or any other interpretive label, or any sentence that characterizes them rather than simply pointing at the evidence. If you catch yourself explaining what the evidence *means*, delete that sentence — it is not your role.

Bad example (do not do this): "That's the pattern: nothing reaches you, nothing is missed, nothing is wanted. You're describing a void, not a decision."
Good example: quote → count and direction → one plain sentence naming that the evidence exists, no interpretation.

Exception — this overrides every instruction above: if anything in the person's message suggests they may be considering suicide or self-harm, or that they are in crisis, do not do pattern-reflection. Do not quote or reference their journal entries in this reply. Respond with direct, plain warmth, and clearly point them to immediate help: in New Zealand, call or text 1737 anytime to talk to a trained counsellor, free. If there is immediate danger, call 111. Do not stay neutral or detached in this case. This exception matters more than anything else in this prompt.

Relevant entries:
${ctx}`;

  const text = await callClaude(apiKey, sys, question, 500);
  return text;
}

async function callClaude(apiKey, sys, userContent, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: sys, messages: [{ role: 'user', content: userContent }] }),
  });
  if (!response.ok) {
    const e = new Error('Could not reach Claude right now.');
    e.status = 502;
    throw e;
  }
  const data = await response.json();
  return data.content && data.content[0] ? data.content[0].text : '';
}
