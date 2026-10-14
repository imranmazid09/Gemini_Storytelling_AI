import { getStore } from '@netlify/blobs';
import { createHash, randomBytes } from 'node:crypto';
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(24).toString('hex');
export const records = (context: string) => getStore({ name: `storylab-receipts-${context || 'dev'}`, consistency: 'strong' });
export async function validSession(store: ReturnType<typeof records>, session: unknown) {
  if (typeof session !== 'string' || !/^[a-f0-9]{48}$/.test(session)) return false;
  const started = await store.get(`sessions/${hash(session)}`, { type: 'json' }) as { startedAt: string } | null;
  return Boolean(started);
}
