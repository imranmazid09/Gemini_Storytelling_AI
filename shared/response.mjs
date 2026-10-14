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
    const headingOf = line => {
      const labeled = line.match(/^(?:#{1,3}[ \t]+(.+?)|([A-Za-z][A-Za-z /-]{3,}):)[ \t]*$/);
      if (labeled) return labeled[1] || labeled[2];
      if (/^[A-Z][A-Z /-]{3,}[ \t]*$/.test(line)) return line.trim();
      if (/^(creative brief|story draft|selected hook|final content|revision evidence|coaching snapshot|final ethical and accessibility check)[ \t]*$/i.test(line)) return line.trim();
      return null;
    };
    const lines = item.split('\n');
    const blocks = [];
    let block = { heading: null, lines: [] };
    for (const line of lines) {
      const heading = headingOf(line);
      if (heading) { blocks.push(block); block = { heading, lines: [line] }; }
      else block.lines.push(line);
    }
    blocks.push(block);
    const seen = [];
    return blocks.filter(block => {
      if (!block.heading) return true;
      const body = block.lines.slice(1).join('\n');
      const duplicate = seen.some(previous => normalized(previous.heading) === normalized(block.heading) && similarity(previous.body, body) >= .9);
      if (duplicate) removed++; else seen.push({ heading: block.heading, body });
      return !duplicate;
    }).map(block => block.lines.join('\n')).filter(Boolean).join('\n');
  };
  return { result: walk(value), removed };
}
