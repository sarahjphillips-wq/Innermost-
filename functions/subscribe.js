// Stores each device's push subscription plus its preferred send time and
// timezone, so the separate scheduled Worker (notify-worker.js) can look
// them all up and decide who's due a notification right now.
//
// Requires a KV namespace bound to this Pages project as PUSH_SUBS
// (Cloudflare dashboard -> Pages project -> Settings -> Functions -> KV namespace bindings).

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }
  const { id, action } = body || {};
  if (!id || typeof id !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  }
  if (!env.PUSH_SUBS) {
    return new Response(JSON.stringify({ error: 'Storage not configured' }), { status: 500 });
  }

  if (action === 'unsubscribe') {
    await env.PUSH_SUBS.delete('sub:' + id);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const { subscription, time, tz } = body;
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return new Response(JSON.stringify({ error: 'Missing subscription' }), { status: 400 });
  }
  const record = {
    subscription,
    time: ['morning', 'afternoon', 'evening'].includes(time) ? time : 'evening',
    tz: tz || 'UTC',
    lastSentDate: null
  };
  await env.PUSH_SUBS.put('sub:' + id, JSON.stringify(record));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
