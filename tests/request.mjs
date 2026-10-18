import assert from 'node:assert/strict';
import { fetchJSON, failureDetails, requestFailure, startDeadline, requestLimit } from '../src/request.js';
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
  assert.equal(requestLimit('image'), 60000); assert.equal(requestLimit('content'), 70000);
  const originalNow = Date.now;
  const originalDocument = globalThis.document;
  let now = originalNow();
  try {
    Date.now = () => now;
    // Simulate a suspended event loop: the response arrives after wall time expires,
    // before the timer callback has had an opportunity to run.
    globalThis.fetch = async () => { now += 100; return { ok: true, json: async () => ({ late: true }) }; };
    await assert.rejects(fetchJSON('https://test.invalid', {}, { timeout: 50 }), error => error.name === 'TimeoutError');
    globalThis.document = new EventTarget();
    const paused = new AbortController();
    const deadline = startDeadline(paused, 100);
    now += 101;
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(paused.signal.reason.name, 'TimeoutError', 'Resuming a tab checks elapsed wall time, not delayed timer ticks.');
    deadline.dispose();
    const disposed = new AbortController();
    const cleared = startDeadline(disposed, 100);
    cleared.dispose(); now += 101;
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(disposed.signal.aborted, false, 'Completed requests remove their resume listeners.');
  } finally { Date.now = originalNow; if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument; }
  console.log('PASS: hard deadlines for unresponsive fetch and body reads, late responses, parent cancellation, HTTP failures and malformed responses.');
} finally { globalThis.fetch = originalFetch; }
