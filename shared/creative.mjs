const compact = text => String(text || '').replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').toLowerCase().trim();
const words = text => compact(text).replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

export function repeatsCaption(text, result) {
  const overlay = words(text);
  if (!overlay) return false;
  const repeatedLine = String(result.primaryText || '').split('\n').some(line => words(line) === overlay);
  return (overlay.split(' ').length >= 3 && (' ' + words(result.primaryText) + ' ').includes(' ' + overlay + ' ')) || repeatedLine || overlay === words(result.cta);
}

export function presentationIssues(result, payload) {
  if (!String(payload.deliverable || '').startsWith('Instagram ')) return [];
  const issues = [];
  const opening = String(result.primaryText || '').trim().split('\n')[0];
  if ([...opening].length > 80) issues.push('Make line 1 a standalone attention-grabbing opening of at most 80 characters; develop the moment on the following lines.');
  if (payload.deliverable !== 'Instagram Image Post') return issues;
  for (const frame of result.frames || []) {
    const overlay = words(frame.onScreen);
    if (!overlay) continue;
    if (overlay.split(' ').length > 5) issues.push('Keep the optional image overlay to five words or fewer.');
    if (repeatsCaption(frame.onScreen, result)) issues.push('The image overlay repeats caption wording. Add a complementary thought or leave it empty.');
  }
  return [...new Set(issues)];
}

export function campaignTypeIssues(brief) {
  return /^(commercial brand|nonprofit|non-profit|for-profit(?: brand)?|advocacy(?: organization)?|public service|social enterprise)$/i.test(String(brief.cardObjective || '').trim())
    ? ['Campaign type must name the communication task, such as Volunteer Recruitment or Product Launch, rather than the organization category.'] : [];
}

export function narrativeIssues(result, payload) {
  const story = compact(payload.story);
  if (!story || story.split(' ').length < 35) return [];
  const caption = compact(result.primaryText);
  const trace = result.storyTrace;
  if (!trace?.moment || !trace?.turn) return ['Restore the student story: show its specific human situation and turning point in the caption. Return storyTrace with moment and turn sourceQuote/captionQuote pairs.'];
  const issues = [];
  for (const beat of ['moment', 'turn']) {
    const { sourceQuote, captionQuote } = trace[beat];
    if (compact(sourceQuote).split(' ').length < 4 || !story.includes(compact(sourceQuote))) issues.push(`The ${beat} sourceQuote must quote an actual passage of at least four words from the approved story.`);
    if (compact(captionQuote).split(' ').length < 4 || !caption.includes(compact(captionQuote))) issues.push(`Show the story's ${beat} in the actual caption and quote that passage in captionQuote.`);
  }
  if (compact(trace.moment.captionQuote) === compact(trace.turn.captionQuote)) issues.push('Use distinct passages for the situation and the change; do not substitute a single slogan for both.');
  return issues;
}

export const VISUAL_STYLES = {
  candid: 'Candid social photograph concept: lively, present-tense, natural daylight or direct flash where appropriate, vivid but believable color, a deliberate tight crop and an adult point of view. Avoid staged stock-photo smiles, polished office stock and generic flat lays. Any people are fictional, not documentary subjects.',
  graphic: 'Bold graphic illustration: strong silhouettes, confident shapes, fresh saturated color, dynamic diagonal composition and an expressive decisive moment. Contemporary social campaign art, not a muted sepia textbook illustration. Keep the scene legible at phone size.',
  editorial: 'Contemporary editorial illustration: energetic framing, expressive gestures, clear hierarchy, tactile detail and a fresh palette chosen for this story. Avoid the automatic brown-and-beige coffee-table scene.',
};

export function imagePrompt(payload) {
  const style = VISUAL_STYLES[payload.visualStyle] || VISUAL_STYLES.candid;
  return `Art-direct ONE Instagram image for this student's fictional campaign. The goal is a vivid story moment that feels relevant to its audience.
VISUAL TREATMENT: ${style}
APPROVED SHOT TO EXECUTE: ${payload.prompt}
STUDENT STORY (source of actions and details, not text to print): ${payload.context || ''}
BRIEF AND CONSTRAINTS: ${payload.brief || ''}
Create one intentional focal point, an interesting viewpoint and visible action or tension. Compose for the requested crop. Preserve every brief constraint, particularly child privacy; show a child's hands, back or book rather than an identifiable face when faces are prohibited. Never invent testimony or proof.
CRITICAL TEXT RULE: Do not render any readable words or numbers anywhere in the image, including on books, notebooks, packaging, walls, signs or clothing. Use blank covers, plain packaging and abstract marks. No volunteer journal, diary, completed checklist, dates, named children, attendance record, certificate, invented logo or fabricated branding. These can falsely appear to document events. Do not convert this prompt or the supplied story into writing on a prop. The app adds any approved overlay separately.
Do not fill the frame with unrelated coffee cups, glasses, stationery or decorative props. Keep only scene details that make the actual story moment visible.`;
}

export function normalizeGeneratedTypography(value) {
  if (typeof value === 'string') return value.replace(/\s*\u2014\s*/g, ' - ');
  if (Array.isArray(value)) return value.map(normalizeGeneratedTypography);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeGeneratedTypography(item)]));
  return value;
}
