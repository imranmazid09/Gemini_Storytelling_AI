import config from '../copy-engine/v1.json' with { type: 'json' };
export const COPY_ENGINE_VERSION = config.version;
const normalize = text => String(text || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const numberWords = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000 };
const numberText = (text, allowIndefiniteOne = false) => String(text || '').replace(/\b[a-z]+\b/gi, (word, offset, source) => {
  // Indefinite "one" is narrative grammar; timed or measured promises still need source support.
  if (allowIndefiniteOne && word.toLowerCase() === 'one' && !/^[\s-]*(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?|percent|dollars?|pounds?|miles?|times?)\b/i.test(source.slice(offset + word.length))) return word;
  return Object.hasOwn(numberWords, word.toLowerCase()) ? String(numberWords[word.toLowerCase()]) : word;
});
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function briefFields(payload) {
  if (payload.briefFields && typeof payload.briefFields === 'object') return payload.briefFields;
  const labels = { client: 'Fictional client', objective: 'Advertising objective', audience: 'Audience', singleMessage: 'Single message', tone: 'Tone', reasonToBelieve: 'Reason to believe / supplied scenario facts', mandatory: 'Mandatory detail', constraints: 'Constraints' };
  return Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, String(payload.brief || '').split('\n').find(line => line.startsWith(label + ':'))?.slice(label.length + 1).trim() || '']));
}
export function copyTask(payload) {
  const values = { ...briefFields(payload), format: payload.deliverable, platform: payload.platform, story: payload.story || payload.draft };
  return config.taskTemplate.replace(/{{(\w+)}}/g, (_, key) => String(values[key] || ''));
}
export function sceneTimes(value) {
  const match = String(value || '').match(/^\s*(\d+(?::[0-5]\d)?(?:\.\d+)?)\s*(?:s|seconds?)?\s*[-–—]\s*(\d+(?::[0-5]\d)?(?:\.\d+)?)\s*(?:s|seconds?)?\s*$/i);
  if (!match) return [];
  return match.slice(1).map(part => {
    const units = part.split(':').map(Number);
    return units.length === 2 ? units[0] * 60 + units[1] : units[0];
  });
}
export function copyIssues(result, payload) {
  const issues = [];
  const instagram = String(payload.deliverable || '').startsWith('Instagram ');
  const caption = String(result.primaryText || '');
  if (instagram) {
    const words = caption.trim().split(/\s+/).filter(Boolean).length;
    if (Number(payload.length) > 0 && words > Number(payload.length)) issues.push(`Keep the caption to ${payload.length} words or fewer.`);
    if (payload.hashtags === false && /#[\p{L}\p{N}_]+/u.test(caption)) issues.push('Remove hashtags or enable them in the content settings.');
    if (payload.emojis === false && /\p{Extended_Pictographic}/u.test(caption)) issues.push('Remove emojis or enable them in the content settings.');
    const frames = result.frames || [];
    const video = payload.deliverable === 'Instagram Video Storyboard';
    if (!video && frames.length !== 1) issues.push('An image post needs exactly one still image.');
    if (video) {
      if (frames.length !== Number(payload.sceneCount || 4)) issues.push(`Use exactly ${payload.sceneCount || 4} scenes.`);
      let cursor = 0;
      for (const [index, frame] of frames.entries()) {
        const times = sceneTimes(frame.time);
        if (times.length !== 2 || times[0] !== cursor || times[1] <= times[0]) issues.push(`Scene ${index + 1} needs a consecutive start-end time range.`);
        if (times.length === 2) {
          if (String(frame.copy || '').trim().split(/\s+/).length > (times[1] - times[0]) * 3) issues.push(`Shorten scene ${index + 1} script so it can be spoken in its allotted time.`);
          cursor = times[1];
        }
      }
      if (cursor !== Number(payload.duration)) issues.push(`The storyboard must end at ${payload.duration} seconds.`);
    }
  }
  const lines = caption.replace(/\r/g, '').split('\n');
  const creative = [caption, result.headline, result.cta, ...(result.frames || []).flatMap(frame => [frame.copy, frame.onScreen])].filter(Boolean).join('\n');
  for (const phrase of config.bannedPhrases) if (new RegExp(`\\b${escape(normalize(phrase))}\\b`, 'i').test(normalize(creative))) issues.push(`Remove the banned phrase: ${phrase}.`);
  const cta = String(result.cta || '').trim();
  if (!cta || /^learn more\b/i.test(cta)) issues.push('Use one specific call to action.');
  if (cta && /^link in bio|^tickets? in bio/i.test(cta)) issues.push('Name the specific action that serves the objective, not only the link location.');
  const captionLines = lines.filter(line => line.trim() && !/^\s*#/.test(line));
  if (cta && normalize(captionLines.at(-1)).replace(/[.!?]+$/, '') !== normalize(cta).replace(/[.!?]+$/, '')) issues.push('End the caption with the CTA, with no extra requests.');
  if (cta && normalize(caption).split(normalize(cta)).length - 1 > 1) issues.push('Do not repeat the CTA within the caption.');
  const brief = briefFields(payload);
  const source = [payload.brief, JSON.stringify(brief), payload.story].join(' ');
  const narrativeSource = normalize([brief.background, brief.audience, brief.reasonToBelieve, payload.story].join(' '));
  if (/\b(crowded|crowding|queues?|waiting|endless searching)\b/i.test(creative) && !/\b(crowded|crowding|queues?|waiting|endless searching)\b/i.test(narrativeSource)) issues.push('Remove crowding, queues or waiting not supplied in the brief or approved story.');
  const approvedNumbers = new Set(numberText(source).match(/\b\d+(?:[.,]\d+)?\b/g) || []);
  const newNumbers = [...new Set((numberText(creative, true).match(/\b\d+(?:[.,]\d+)?\b/g) || []).filter(number => !approvedNumbers.has(number)))];
  if (newNumbers.length) issues.push(`Remove numbers not in the approved brief or story: ${newNumbers.join(', ')}.`);
  if (!/\d/.test(creative) && !['client', 'audience', 'mandatory'].some(key => String(brief[key] || '').split(/\s+/).some(word => word.length > 4 && normalize(creative).includes(normalize(word))))) issues.push('Include a concrete detail from the approved brief or story.');
  const mandatory = String(brief.mandatory || '').split(/include:/i).at(-1).replace(/This is a fictional classroom address\./i, '').trim();
  const words = normalize(mandatory).replace(/oct\b/g, 'october').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length > 3 || /^\d+$/.test(word));
  const body = normalize(creative).replace(/oct\b/g, 'october');
  if (words.length && words.filter(word => body.includes(word)).length / words.length < .8) issues.push('Include the brief’s mandatory detail without adding claims.');
  return [...new Set(issues)];
}
