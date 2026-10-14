export const BRIEF_FIELDS = {
  cardIndustry: 'Industry', cardObjective: 'Campaign type', client: 'Fictional client',
  background: 'Background', audience: 'Audience', objective: 'Advertising objective',
  singleMessage: 'Single message', reasonToBelieve: 'Reason to believe / supplied scenario facts',
  'thinkFeelDo.think': 'Think', 'thinkFeelDo.feel': 'Feel', 'thinkFeelDo.do': 'Do',
  tone: 'Tone', mandatory: 'Mandatory detail', constraints: 'Constraints', deliverable: 'Deliverable',
};
export const getField = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
export const missingBrief = (brief) => Object.entries(BRIEF_FIELDS).filter(([key]) => typeof getField(brief, key) !== 'string' || !getField(brief, key).trim()).map(([, label]) => label);
export const briefText = (brief) => brief ? [brief.aiGenerated ? 'AI-generated fictional classroom brief' : 'Prebuilt fictional classroom brief', 'All client details are supplied classroom scenario facts, not verified real-world evidence.', ...Object.entries(BRIEF_FIELDS).map(([key, label]) => `${label}: ${getField(brief, key)}`)].join('\n') : '';
export const CONTENT_FIELDS = ['primaryText', 'headline', 'cta', 'visualDirection', 'altText', 'ethicalCheck'];
export function missingContent(content, format) {
  const missing = CONTENT_FIELDS.filter(key => typeof content?.[key] !== 'string' || !content[key].trim());
  if (!Array.isArray(content?.frames) || content.frames.length === 0 || content.frames.some(frame => ['title', 'copy', 'visual'].some(key => typeof frame?.[key] !== 'string' || !frame[key].trim()))) missing.push('complete frames / cards');
  return missing;
}
