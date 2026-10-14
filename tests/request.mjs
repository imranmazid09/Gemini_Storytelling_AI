import assert from 'node:assert/strict';
import { fetchJSON } from '../src/request.js';
const originalFetch = globalThis.fetch;
try {
  // The fetch implementation deliberately ignores abort: the deadline must still release the caller.
  let release;
  globalThis.fetch = () => new Promise(resolve => { release = resolve; });
  const pending = fetchJSON('https://test.invalid', {}, { timeout: 10 });
  await assert.rejects(pending, error => error.name === 'TimeoutError' && error.message.includes('Your work is safe'));
  release({ ok: true, json: async () => ({ stale: true }) });
  await new Promise(resolve => setTimeout(resolve, 0));
  // A stalled response body is covered by the same timer.
  globalThis.fetch = async () => ({ ok: true, json: async () => new Promise(() => {}) });
  await assert.rejects(fetchJSON('https://test.invalid', {}, { timeout: 10 }), error => error.name === 'TimeoutError');
  // Parent cancellation works even when fetch never settles.
  globalThis.fetch = () => new Promise(() => {});
  const controller = new AbortController();
  const canceled = fetchJSON('https://test.invalid', {}, { signal: controller.signal, timeout: 1000 });
  controller.abort(new Error('Student changed the draft.'));
  await assert.rejects(canceled, /Student changed the draft/);
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: 'Coach unavailable. Try again.' }) });
  await assert.rejects(fetchJSON('https://test.invalid'), /Coach unavailable/);
  globalThis.fetch = async () => ({ ok: true, json: async () => { throw new Error('HTML instead of JSON'); } });
  await assert.rejects(fetchJSON('https://test.invalid'), /unreadable response/);
  console.log('PASS: hard deadlines for unresponsive fetch and body reads, late responses, parent cancellation, HTTP failures and malformed responses.');
} finally { globalThis.fetch = originalFetch; }
