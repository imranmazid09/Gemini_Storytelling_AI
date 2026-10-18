import { copyIssues } from './copy.mjs';
import { presentationIssues, repeatsCaption } from './creative.mjs';

export function choicesComplete(content, video = false) {
  return (!content?.choicesRequired && !content?.captionVariants) || (content?.captionVariants?.length === 3 && Number.isInteger(content.selectedCaption) && content.selectedCaption >= 0 && content.selectedCaption < 3 && (video || (content.imageConcepts?.length === 2 && Number.isInteger(content.selectedConcept) && content.selectedConcept >= 0 && content.selectedConcept < 2)));
}

export function applyChoice(content, kind, index) {
  const next = structuredClone(content);
  if (kind === 'caption') {
    const option = next.captionVariants?.[index];
    if (!option) return content;
    next.primaryText = option.primaryText;
    next.selectedCaption = index;
    if (next.frames.length === 1) next.frames[0].copy = next.headline || '';
  } else {
    const option = next.imageConcepts?.[index];
    if (!option || next.frames.length !== 1) return content;
    next.frames[0] = { ...next.frames[0], visual: option.visual, altText: option.altText, onScreen: option.onScreen || '' };
    next.visualDirection = option.visual;
    next.altText = option.altText;
    next.selectedConcept = index;
  }
  next.cta = next.primaryText.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#')).at(-1);
  if (next.frames.length === 1 && repeatsCaption(next.frames[0].onScreen, next)) next.frames[0].onScreen = '';
  return next;
}

export function reviewChoice(next, previous, payload) {
  const previousLiteral = [...copyIssues(previous, payload), ...presentationIssues(previous, payload)];
  const retained = (previous.copyReview?.issues || []).filter(issue => !previousLiteral.includes(issue));
  return { ...next, copyReview: { ...previous.copyReview, issues: [...new Set([...retained, ...copyIssues(next, payload), ...presentationIssues(next, payload)])] } };
}

export function choiceIssues(content, payload) {
  if (!payload.requireChoices) return [];
  const text = value => typeof value === 'string' && Boolean(value.trim());
  const variants = content.captionVariants;
  if (!Array.isArray(variants) || variants.length !== 3 || variants.some(option => !text(option?.label) || !text(option?.primaryText)) || new Set(variants.map(option => option.primaryText.trim().toLowerCase())).size !== 3) return ['Provide three distinct, complete caption treatments for student comparison.'];
  const issues = [];
  for (const [index, option] of variants.entries()) {
    const candidate = applyChoice(content, 'caption', index);
    issues.push(...[...copyIssues(candidate, payload), ...presentationIssues(candidate, payload)].map(issue => `Caption option ${index + 1}: ${issue}`));
  }
  if (payload.deliverable === 'Instagram Image Post') {
    const concepts = content.imageConcepts;
    if (!Array.isArray(concepts) || concepts.length !== 2 || concepts.some(option => !text(option?.label) || !text(option?.visual) || !text(option?.altText) || typeof option.onScreen !== 'string') || new Set(concepts.map(option => option.visual.trim().toLowerCase())).size !== 2) issues.push('Provide two distinct, complete still-image concepts for student comparison.');
    else for (const [index] of concepts.entries()) {
      // Check every caption/concept pairing; the app omits duplicated optional overlays.
      for (const [caption] of variants.entries()) {
        const candidate = applyChoice(applyChoice(content, 'concept', index), 'caption', caption);
        issues.push(...[...copyIssues(candidate, payload), ...presentationIssues(candidate, payload)].map(issue => `Image concept ${index + 1}: ${issue}`));
      }
    }
  }
  return [...new Set(issues)];
}
