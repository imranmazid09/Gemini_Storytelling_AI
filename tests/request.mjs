import assert from 'node:assert/strict';
import { fetchJSON, failureDetails, requestFailure } from '../src/request.js';
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
  globalThis.fetch = async () => ({ ok: false, status: 422, json: async () => ({ error: 'Review rejected this image.', code: 'IMAGE_REVIEW_REJECTED' }) });
  await assert.rejects(fetchJSON('https://test.invalid'), error => error.status === 422 && failureDetails(error).failureCategory === 'image-review-rejected');
  assert.equal(failureDetails(requestFailure('Slow request', 'TimeoutError')).failureCategory, 'timeout');
  assert.equal(failureDetails(requestFailure('Canceled', 'AbortError')).failureCategory, 'canceled');
  assert.equal(failureDetails({ code: 'IMAGE_REVIEW_UNAVAILABLE' }).failureCategory, 'image-review-unavailable');
  assert.equal(failureDetails({ code: 'IMAGE_GENERATION_UNAVAILABLE' }).failureCategory, 'image-generation-unavailable');
  assert.equal(failureDetails({ code: 'REQUEST_TIMEOUT' }).failureCategory, 'timeout');
  const unknown = failureDetails({ code: 'PRIVATE_PROVIDER_ERROR', message: 'raw provider diagnostics and secrets' });
  assert.equal(unknown.failureCategory, 'service-or-connection-error');
  assert(!JSON.stringify(unknown).includes('PRIVATE_PROVIDER_ERROR'));
  assert(!JSON.stringify(unknown).includes('raw provider'));
  globalThis.fetch = async () => ({ ok: true, json: async () => { throw new Error('HTML instead of JSON'); } });
  await assert.rejects(fetchJSON('https://test.invalid'), /unreadable response/);
  console.log('PASS: hard deadlines for unresponsive fetch and body reads, late responses, parent cancellation, HTTP failures and malformed responses.');
} finally { globalThis.fetch = originalFetch; }
