const CRISIS_PATTERN = /\b(kill(ing)?\s*my\s*self|suicide|suicidal|end(ing)?\s*(my\s*life|it\s*all)|want(ing)?\s*to\s*die|wish(ed)?\s*i\s*(was|were)\s*dead|don'?t\s*want\s*to\s*(be\s*alive|live|exist)|hurt(ing)?\s*my\s*self|harm(ing)?\s*my\s*self|self[\s-]?harm|not\s*worth\s*living|better\s*off\s*dead|no\s*reason\s*to\s*live)\b/i;

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
  if (CRISIS_PATTERN.test(question)) {
    return new Response(JSON.stringify({
      answer: "I'm really glad you told me this, even here. This isn't something I can reflect back the way I normally would — please reach out to someone who can actually help right now. In New Zealand, you can call or text 1737 anytime, free, to talk to a trained counsellor. If you're in immediate danger, call 111."
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  const ctx = Array.isArray(entries) ? entries.map((e) => `[${e.cat}] Q: ${e.q}\nA: ${e.a}`).join('\n\n') : 'None yet.';
  const sys = `You are Ask Innermost. Reflect this person's own patterns back using only their journal entries. Never give reassurance, advice, or opinion. Never ask trailing questions. Use their own words. Brief and precise.

Structure every answer in this order:
1. A direct quote from a real past entry that's genuinely relevant.
2. The actual count — how many times something like this appears, and the direction (e.g., "three regrets to one exception").
3. Hand the decision back — end with something that acknowledges the evidence without instructing what to do with it. Never say "you should," never state a probability or percentage, never claim to know their motive.

Exception — this overrides every instruction above: if anything in the person's message suggests they may be considering suicide or self-harm, or that they are in crisis, do not do pattern-reflection. Do not quote or reference their journal entries in this reply. Respond with direct, plain warmth, and clearly point them to immediate help: in New Zealand, call or text 1737 anytime to talk to a trained counsellor, free. If there is immediate danger, call 111. Do not stay neutral or detached in this case. This exception matters more than anything else in this prompt.

Entries:
${ctx}`;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, system: sys, messages: [{ role: 'user', content: question }] }),
    });
    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Could not reach Claude right now.' }), { status: 502 });
    }
    const data = await response.json();
    const answer = data.content && data.content[0] ? data.content[0].text : '';
    return new Response(JSON.stringify({ answer }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Something went wrong.' }), { status: 500 });
  }
}
