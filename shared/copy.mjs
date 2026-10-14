import config from '../copy-engine/v1.json' with { type: 'json' };
export const COPY_ENGINE_VERSION = config.version;
export const HOOK_TYPES = config.hookTypes;
const normalize = text => String(text || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const numberText = text => String(text || '').replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, word => String(['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'].indexOf(word.toLowerCase()) + 1));
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function briefFields(payload) {
  if (payload.briefFields && typeof payload.briefFields === 'object') return payload.briefFields;
  const labels = { client: 'Fictional client', objective: 'Advertising objective', audience: 'Audience', singleMessage: 'Single message', tone: 'Tone', reasonToBelieve: 'Reason to believe / supplied scenario facts', mandatory: 'Mandatory detail', constraints: 'Constraints' };
  return Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, String(payload.brief || '').split('\n').find(line => line.startsWith(label + ':'))?.slice(label.length + 1).trim() || '']));
}
export function copyTask(payload) {
  const values = { ...briefFields(payload), format: payload.deliverable, platform: payload.platform, story: payload.story || payload.draft, hook: payload.hook };
  return config.taskTemplate.replace(/{{(\w+)}}/g, (_, key) => String(values[key] || ''));
}
export function hookIssues(result, payload = {}) {
  const options = result.options || [];
  const issues = [];
  if (options.length !== 3) issues.push('Return exactly three hook options.');
  if (new Set(options.map(option => option.tactic)).size !== options.length || options.some(option => !HOOK_TYPES.includes(option.tactic))) issues.push('Use three different approved hook types.');
  if (options.some(option => String(option.hook).length > 80)) issues.push('Keep each hook to at most 80 characters.');
  const client = normalize(briefFields(payload).client);
  if (options.some(option => /^introducing\b/i.test(option.hook) || (client && normalize(option.hook).startsWith(client)))) issues.push('Open with the audience moment or question, not an introduction or the client name.');
  const source = [payload.brief, JSON.stringify(briefFields(payload)), payload.story, payload.draft].join(' ');
  const approved = new Set(numberText(source).match(/\b\d+(?:[.,]\d+)?\b/g) || []);
  const invented = options.flatMap(option => [option.hook, option.onScreenText, option.visual, option.audio].filter(Boolean).join(' ').match(/\b\d+(?:[.,]\d+)?\b/g) || []).filter(number => !approved.has(number));
  if (invented.length) issues.push(`Use only approved numbers in hooks and visual/audio directions: ${[...new Set(invented)].join(', ')}.`);
  return issues;
}
export function copyIssues(result, payload) {
  const issues = [];
  const hook = String(payload.hook || '');
  const caption = String(result.primaryText || '');
  const lines = caption.replace(/\r/g, '').split('\n');
  if (lines[0] !== hook) issues.push('The first line must be the selected hook verbatim.');
  if (hook.length > 80) issues.push('Shorten the selected hook to 80 characters or fewer.');
  const creative = [caption, result.headline, result.cta, ...(result.frames || []).map(frame => frame.copy)].filter(Boolean).join('\n');
  for (const phrase of config.bannedPhrases) if (new RegExp(`\\b${escape(normalize(phrase))}\\b`, 'i').test(normalize(creative))) issues.push(`Remove the banned phrase: ${phrase}.`);
  if (/\bfrom\s+\S+(?:\s+\S+){0,3}\s+to\b/i.test(creative)) issues.push('Avoid generic from-X-to-Y framing.');
  const cta = String(result.cta || '').trim();
  if (!cta || /^learn more\b/i.test(cta)) issues.push('Use one specific call to action.');
  if (cta && /^link in bio|^tickets? in bio/i.test(cta)) issues.push('Name the specific action that serves the objective, not only the link location.');
  if (cta && normalize(lines.filter(line => line.trim()).at(-1)).replace(/[.!?]+$/, '') !== normalize(cta).replace(/[.!?]+$/, '')) issues.push('End the caption with the CTA, with no extra requests.');
  if (cta && normalize(caption).split(normalize(cta)).length - 1 > 1) issues.push('Do not repeat the CTA within the caption.');
  if (caption.split(/\n\s*\n/).some(paragraph => paragraph.trim().split('\n').length > 2)) issues.push('Use blocks of no more than two written lines, separated by blank lines.');
  const brief = briefFields(payload);
  const source = [payload.brief, JSON.stringify(brief), payload.story].join(' ');
  const narrativeSource = normalize([brief.background, brief.audience, brief.reasonToBelieve, payload.story].join(' '));
  if (/\b(crowded|crowding|queues?|waiting|endless searching)\b/i.test(creative) && !/\b(crowded|crowding|queues?|waiting|endless searching)\b/i.test(narrativeSource)) issues.push('Remove crowding, queues or waiting not supplied in the brief or approved story.');
  const approvedNumbers = new Set(numberText(source).match(/\b\d+(?:[.,]\d+)?\b/g) || []);
  const newNumbers = [...new Set((numberText(creative).match(/\b\d+(?:[.,]\d+)?\b/g) || []).filter(number => !approvedNumbers.has(number)))];
  if (newNumbers.length) issues.push(`Remove numbers not in the approved brief or story: ${newNumbers.join(', ')}.`);
  if (!/\d/.test(creative) && !['client', 'audience', 'mandatory'].some(key => String(brief[key] || '').split(/\s+/).some(word => word.length > 4 && normalize(creative).includes(normalize(word))))) issues.push('Include a concrete detail from the approved brief or story.');
  const mandatory = String(brief.mandatory || '').split(/include:/i).at(-1).replace(/This is a fictional classroom address\./i, '').trim();
  const words = normalize(mandatory).replace(/oct\b/g, 'october').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length > 3 || /^\d+$/.test(word));
  const body = normalize(creative).replace(/oct\b/g, 'october');
  if (words.length && words.filter(word => body.includes(word)).length / words.length < .8) issues.push('Include the brief’s mandatory detail without adding claims.');
  if (payload.deliverable === 'Carousel' && result.frames?.[0]?.copy?.split('\n')[0] !== hook) issues.push('Use the selected hook verbatim on the first carousel card.');
  return [...new Set(issues)];
}
