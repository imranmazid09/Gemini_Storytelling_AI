import type { Config, Context } from '@netlify/functions';
import { hash, token, records, validSession } from '../lib/records.mts';
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
export default async function record(req: Request, context: Context) {
  try {
    const store = records(context.deploy.context);
    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('id');
      if (!id || !/^[a-f0-9]{48}$/.test(id)) return json({ error: 'Invalid receipt.' }, 400);
      const receipt = await store.get(`reports/${id}`, { type: 'json' });
      return receipt ? json(receipt) : json({ error: 'No matching StoryLab receipt was found.' }, 404);
    }
    if (req.method !== 'POST') return json({ error: 'Method not supported.' }, 405);
    const bodyText = await req.text();
    if (bodyText.length > 100000) return json({ error: 'This record is too large. Download the local record instead.' }, 413);
    let body;
    try { body = JSON.parse(bodyText); } catch { return json({ error: 'Invalid record request.' }, 400); }
    if (body.action === 'start') {
      const session = token();
      await store.setJSON(`sessions/${hash(session)}`, { startedAt: new Date().toISOString() }, { onlyIfNew: true });
      return json({ session });
    }
    if (body.action !== 'export' || !await validSession(store, body.session)) return json({ error: 'A valid tool session is required.' }, 400);
    if (!/^[a-f0-9]{64}$/.test(body.reportHash || '') || !Number.isInteger(body.browserEventCount) || body.browserEventCount < 0 || !Array.isArray(body.receipts) || body.receipts.length > 300) return json({ error: 'Invalid learning record.' }, 400);
    const serverActions = [];
    for (const id of [...new Set(body.receipts)] as string[]) {
      if (typeof id !== 'string' || !/^[a-f0-9]{48}$/.test(id)) return json({ error: 'Invalid AI receipt.' }, 400);
      const call = await store.get(`calls/${id}`, { type: 'json' }) as { sessionHash: string; action: string; at: string; inputHash: string; outputHash: string } | null;
      if (!call || call.sessionHash !== hash(body.session)) return json({ error: 'An AI receipt could not be verified for this session.' }, 400);
      serverActions.push({ action: call.action, at: call.at, inputHash: call.inputHash, outputHash: call.outputHash });
    }
    const id = token();
    const receipt = { id, tool: 'StoryLab Pro by Dr Imran', issuedAt: new Date().toISOString(), reportHash: body.reportHash, serverActions, browserEventCount: body.browserEventCount, notice: 'This receipt confirms the tool issued this record and the listed successful AI calls. Edits and client timestamps are browser-reported. It does not verify identity, authorship or learning quality.' };
    await store.setJSON(`reports/${id}`, receipt, { onlyIfNew: true });
    return json(receipt);
  } catch (error) {
    console.error('StoryLab receipt storage unavailable', error instanceof Error ? error.name : 'error');
    return json({ error: 'Verification is temporarily unavailable. Your local report can still be downloaded; try verification again later.' }, 503);
  }
}
export const config: Config = { path: '/api/record', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 30 } };
