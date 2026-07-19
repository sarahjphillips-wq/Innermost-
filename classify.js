const TRAITS = ['Courage', 'Connection', 'Capability', 'Recovery', 'Self-trust'];

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }
  const { text } = body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return new Response(JSON.stringify({ trait: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const sys = [
    `You classify a single journal entry from a self-knowledge app called Innermost. Read the entry and decide whether it clearly shows one of five specific traits. This is not about the topic of the entry -- it is about whether the entry demonstrates the person doing, feeling, or experiencing one of these things.`,
    ``,
    `The five traits:`,
    `Courage -- the person did something despite fear, discomfort, or resistance. Not just a bold topic -- an actual moment of pushing through something they could have avoided.`,
    `Connection -- the person reached toward another person, or was reached toward, and it mattered. Being seen, seeing someone else, a moment of real contact.`,
    `Capability -- the person did something that proved they could handle it -- solved a problem, finished something hard, showed skill or competence in the moment.`,
    `Recovery -- the person got something wrong, failed, or struggled, and came through it okay. Evidence that being wrong or struggling did not break them.`,
    `Self-trust -- the person made a decision under uncertainty and it felt right, or turned out right, even without full confidence going in.`,
    ``,
    `Most entries will not clearly show any of these five things -- an entry about a nice coffee, the weather, or a small pleasant moment usually shows none of them, and that is the correct, expected answer most of the time. Do not force a fit. Only choose a trait if the entry genuinely and clearly demonstrates it. If it is ambiguous, borderline, or you are guessing, answer none.`,
    ``,
    `Respond with ONLY one word: Courage, Connection, Capability, Recovery, Self-trust, or none. No punctuation, no explanation, nothing else.`
  ].join('\n');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        system: sys,
        messages: [{ role: 'user', content: text }],
      }),
    });
    if (!response.ok) {
      return new Response(JSON.stringify({ trait: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const data = await response.json();
    const raw = (data.content && data.content[0] ? data.content[0].text : '').trim();
    const match = TRAITS.find((t) => t.toLowerCase() === raw.toLowerCase());
    return new Response(JSON.stringify({ trait: match || null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    // Classification is a nice-to-have layered on top of a save that already
    // succeeded. Any failure here must never surface to the person -- the
    // entry stays saved, just without a trait.
    return new Response(JSON.stringify({ trait: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}
