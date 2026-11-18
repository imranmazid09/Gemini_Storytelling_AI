import assert from 'node:assert/strict';
import { retryTransient } from '../netlify/lib/ai-retry.mjs';
import { GoogleGenAI } from '@google/genai';
const failure = status => Object.assign(new Error('Synthetic provider failure'), { status });
let calls = 0;
const delays = [];
const result = await retryTransient(async signal => {
  assert(signal instanceof AbortSignal);
  if (++calls < 3) throw failure(503);
  return 'recovered';
}, { deadline: Date.now() + 10000, wait: async delay => delays.push(delay) });
assert.equal(result, 'recovered'); assert.equal(calls, 3);
assert(delays[0] >= 800 && delays[0] < 1100);
assert(delays[1] >= 1600 && delays[1] < 1900);
for (const status of [400, 401, 402, 403, 404, 409, 422, 429]) {
  let attempts = 0;
  await assert.rejects(retryTransient(async () => { attempts++; throw failure(status); }, { deadline: Date.now() + 10000, wait: async () => assert.fail('Do not retry permanent errors or quota limits.') }), error => error.status === status);
  assert.equal(attempts, 1);
}
let attempts = 0;
await assert.rejects(retryTransient(async () => { attempts++; throw failure(503); }, { deadline: Date.now() + 10000, wait: async () => {} }), error => error.status === 503);
assert.equal(attempts, 3, 'Stop after the original call and two retries.');
attempts = 0;
await assert.rejects(retryTransient(async () => { attempts++; throw failure(503); }, { deadline: Date.now() + 1000, wait: async () => assert.fail('Insufficient budget for backoff.') }), error => error.status === 503);
assert.equal(attempts, 1);
await assert.rejects(retryTransient(async () => assert.fail('Expired request must not call the provider.'), { deadline: Date.now() - 1 }), error => error.name === 'TimeoutError');
await assert.rejects(retryTransient(() => new Promise(() => {}), { deadline: Date.now() + 15 }), error => error.name === 'TimeoutError');
const parent = new AbortController();
const cancellation = Object.assign(new Error('Canceled request'), { name: 'AbortError' });
await assert.rejects(retryTransient(async () => { throw failure(503); }, { deadline: Date.now() + 10000, signal: parent.signal, wait: async () => parent.abort(cancellation) }), error => error === cancellation);
await assert.rejects(retryTransient(async () => assert.fail('Canceled request must not call the provider.'), { deadline: Date.now() + 10000, signal: parent.signal }), error => error === cancellation);
const finishing = new AbortController();
await assert.rejects(retryTransient(async () => { finishing.abort(cancellation); return 'late response'; }, { deadline: Date.now() + 10000, signal: finishing.signal }), error => error === cancellation);
// Exercise the installed SDK transport, not just a mocked generateContent method.
const originalFetch = globalThis.fetch;
try {
  const ai = new GoogleGenAI({ apiKey: 'synthetic-test-key-not-a-credential' });
  let fetches = 0;
  globalThis.fetch = async () => ++fetches === 1
    ? new Response(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'Model overloaded' } }), { status: 503, headers: { 'Content-Type': 'application/json' } })
    : new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Recovered' }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const recovered = await retryTransient(signal => ai.models.generateContent({ model: 'gemini-3.5-flash', contents: 'Synthetic transport test', config: { abortSignal: signal } }), { deadline: Date.now() + 10000, wait: async () => {} });
  assert.equal(recovered.text, 'Recovered'); assert.equal(fetches, 2);
  fetches = 0;
  globalThis.fetch = async () => { fetches++; return new Response(JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'Synthetic denied request' } }), { status: 403, headers: { 'Content-Type': 'application/json' } }); };
  await assert.rejects(retryTransient(signal => ai.models.generateContent({ model: 'gemini-3.5-flash', contents: 'Synthetic denied test', config: { abortSignal: signal } }), { deadline: Date.now() + 10000, wait: async () => assert.fail('Do not retry denied SDK calls.') }), error => error.status === 403);
  assert.equal(fetches, 1);
} finally { globalThis.fetch = originalFetch; }
console.log('PASS: transient recovery, exponential backoff with jitter, maximum attempts, shared deadline, hanging provider, cancellation, and no retries for credentials/billing/permissions/quotas.');
