export function requestFailure(message, name = 'Error') {
  const error = new Error(message); error.name = name; return error;
}
// Real timers work in browsers that do not implement AbortSignal.timeout.
// Race the complete fetch/body-read, and ignore any response arriving after cancellation.
export async function fetchJSON(url, options = {}, { signal, timeout = 45000 } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason || requestFailure('Request canceled.', 'AbortError'));
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(requestFailure('The request took too long. Your work is safe; try again.', 'TimeoutError')), timeout);
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
      if (controller.signal.aborted) throw controller.signal.reason || requestFailure('Request canceled.', 'AbortError');
      if (!response.ok) throw requestFailure(result.error || 'The request failed. Your work is safe; try again.');
      return result;
    })()]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', rejectAbort);
  }
}
