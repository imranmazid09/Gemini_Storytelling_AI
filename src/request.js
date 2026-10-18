export function requestFailure(message, name = 'Error') {
  const error = new Error(message); error.name = name; return error;
}
export const requestLimit = name => name === 'image' ? 60000 : name === 'content' ? 70000 : 45000;

export function startDeadline(controller, timeout) {
  const startedAt = Date.now();
  const expiresAt = startedAt + timeout;
  const expire = () => { if (!controller.signal.aborted) controller.abort(requestFailure('The request took too long. Your work is safe; try again.', 'TimeoutError')); };
  const check = () => {
    if (Date.now() >= expiresAt) expire();
  };
  const timer = setTimeout(expire, timeout);
  // A suspended tab cannot execute timers. Recheck wall time as soon as it resumes.
  const watchdog = setInterval(check, 1000);
  globalThis.document?.addEventListener('visibilitychange', check);
  globalThis.addEventListener?.('focus', check);
  globalThis.addEventListener?.('pageshow', check);
  return { startedAt, expiresAt, check, dispose() {
    clearTimeout(timer); clearInterval(watchdog);
    globalThis.document?.removeEventListener('visibilitychange', check);
    globalThis.removeEventListener?.('focus', check);
    globalThis.removeEventListener?.('pageshow', check);
  } };
}
export function failureDetails(error) {
  const reasons = {
    REQUEST_TIMEOUT: ['timeout', 'The request timed out. Your work is safe; try again.'],
    IMAGE_REVIEW_REJECTED: ['image-review-rejected', 'The image did not pass the brief and image-safety review. Try a simpler direction or upload a suitable image.'],
    IMAGE_REVIEW_UNAVAILABLE: ['image-review-unavailable', 'The image review could not finish. This is not a confirmed image-safety violation. Try generating the image again.'],
    IMAGE_GENERATION_UNAVAILABLE: ['image-generation-unavailable', 'The image service could not return an image. Try again or upload an image.'],
    IMAGE_TOO_LARGE: ['image-too-large', 'The generated image was too large to use. Generate another image or upload a smaller one.'],
    IMAGE_DIRECTION_REQUIRED: ['image-direction-required', 'Add an image direction before generating an image.'],
  };
  if (Object.hasOwn(reasons, error?.code)) return { failureCode: error.code, failureCategory: reasons[error.code][0], explanation: reasons[error.code][1] };
  if (error?.name === 'TimeoutError') return { failureCategory: 'timeout', explanation: 'The request timed out. Your work is safe; try again.' };
  if (error?.name === 'AbortError') return { failureCategory: 'canceled', explanation: 'The request was canceled. Existing work was kept.' };
  return { failureCategory: 'service-or-connection-error', explanation: 'The request could not finish because of a service, connection or response error. Your work is safe; try again.' };
}
// Real timers work in browsers that do not implement AbortSignal.timeout.
// Race the complete fetch/body-read, and ignore any response arriving after cancellation.
export async function fetchJSON(url, options = {}, { signal, timeout = 45000 } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason || requestFailure('Request canceled.', 'AbortError'));
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const deadline = startDeadline(controller, timeout);
  let rejectAbort;
  const canceled = new Promise((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason || requestFailure('Request canceled.', 'AbortError'));
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
    if (controller.signal.aborted) rejectAbort();
  });
  try {
    return await Promise.race([canceled, (async () => {
      const response = await fetch(url, { ...options, signal: controller.signal });
      let result;
      try { result = await response.json(); }
      catch { throw requestFailure('The service returned an unreadable response. Your work is safe; try again.'); }
      deadline.check();
      if (controller.signal.aborted) throw controller.signal.reason || requestFailure('Request canceled.', 'AbortError');
      if (!response.ok) {
        const error = requestFailure(result.error || 'The request failed. Your work is safe; try again.');
        error.code = result.code;
        error.status = response.status;
        throw error;
      }
      return result;
    })()]);
  } finally {
    deadline.dispose();
    signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', rejectAbort);
  }
}
