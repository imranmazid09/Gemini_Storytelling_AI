const normalized = (text) => String(text).toLowerCase().replace(/\s+/g, ' ').trim();
// Word-level edit similarity avoids quadratic work on long character strings.
export function similarity(a, b) {
  a = normalized(a); b = normalized(b);
  if (a === b) return 1;
  const x = a.split(' '), y = b.split(' ');
  if (Math.min(x.length, y.length) / Math.max(x.length, y.length) < .9) return 0;
  let row = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const next = [i];
    for (let j = 1; j <= y.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    row = next;
  }
  return 1 - row[y.length] / Math.max(x.length, y.length);
}
export function removeDuplicateSections(value) {
  let removed = 0;
  const walk = (item) => {
    if (Array.isArray(item)) {
      const seen = [];
      return item.filter(entry => {
        const heading = entry && typeof entry === 'object' ? entry.stage || entry.title || entry.label : null;
        if (!heading) return true;
        const body = JSON.stringify(Object.fromEntries(Object.entries(entry).filter(([key]) => !['stage', 'title', 'label'].includes(key))));
        const duplicate = seen.some(previous => normalized(previous.heading) === normalized(heading) && similarity(previous.body, body) >= .9);
        if (duplicate) removed++; else seen.push({ heading, body });
        return !duplicate;
      }).map(walk);
    }
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, walk(child)]));
    if (typeof item !== 'string') return item;
    // Only explicit labeled blocks; equal copy in distinct fields is legitimate.
    const blocks = item.split(/(?=^(?:#{1,3} )?[A-Z][A-Z /-]{3,}:?\s*$)/m);
    const seen = [];
    return blocks.filter(block => {
      const match = block.match(/^(?:#{1,3} )?([A-Z][A-Z /-]{3,}):?\s*\n([\s\S]*)$/);
      if (!match) return true;
      const [, heading, body] = match;
      const duplicate = seen.some(previous => normalized(previous.heading) === normalized(heading) && similarity(previous.body, body) >= .9);
      if (duplicate) removed++; else seen.push({ heading, body });
      return !duplicate;
    }).join('');
  };
  return { result: walk(value), removed };
}
