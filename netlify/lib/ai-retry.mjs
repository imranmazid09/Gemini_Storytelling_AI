import { setTimeout as sleep } from 'node:timers/promises';

const timeoutError = () => Object.assign(new Error('AI request timed out'), { name: 'TimeoutError' });
const transient = error => [408, 500, 502, 503, 504].includes(Number(error?.status));

export async function retryTransient(operation, { deadline, signal, wait = sleep }) {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(timeoutError()), Math.max(0, deadline - Date.now()));
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (Date.now() >= deadline) throw timeoutError();
      try {
        const result = await Promise.race([operation(controller.signal), aborted]);
        if (controller.signal.aborted) throw controller.signal.reason;
        if (Date.now() >= deadline) throw timeoutError();
        return result;
      } catch (error) {
        if (controller.signal.aborted || !transient(error) || attempt === 2) throw error;
        const delay = 800 * 2 ** attempt + Math.floor(Math.random() * 300);
        // Preserve room for a useful retry, rather than sleeping beyond the deadline.
        if (Date.now() + delay + 500 >= deadline) throw error;
        await wait(delay, undefined, { signal: controller.signal });
      }
    }
  } catch (error) {
    throw controller.signal.aborted ? controller.signal.reason : error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
