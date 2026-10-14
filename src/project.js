import { missingBrief } from '../shared/brief.mjs';
import { useEffect, useRef, useState } from 'react';
export const STORAGE_KEY = 'storylab-project-v2';
export function freshProject() {
  return { version: 2, projectId: crypto.randomUUID(), startedAt: new Date().toISOString(), stage: 1, brief: null, lockedBrief: null, readBrief: false, arc: 'threeAct', arcDrafts: {}, feedback: null, hookOptions: [], selectedHook: '', selectedHookPlan: null, hookTactic: 'recommended', storyLocked: false, deliverable: 'static', platform: 'Instagram', content: null, contentLocked: false, production: null, history: [], aiOutputs: [], receipts: [], session: null, reflection: '' };
}
export function readProject() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { project: freshProject(), error: '' };
    const project = JSON.parse(saved);
    if (project.version !== 2 || !Array.isArray(project.history) || !Array.isArray(project.aiOutputs) || !Array.isArray(project.receipts) || !Number.isInteger(project.stage) || project.stage < 1 || project.stage > 4 || !project.arcDrafts || !['threeAct', 'storybrand', 'freytag'].includes(project.arc)) throw new Error('Invalid saved project');
    if ((project.lockedBrief && missingBrief(project.lockedBrief).length) || (project.stage > 1 && !project.lockedBrief) || (project.stage > 2 && (!project.storyLocked || !project.selectedHook)) || (project.stage > 3 && (!project.contentLocked || !project.content))) throw new Error('Incomplete saved project');
    return { project, error: '' };
  } catch {
    return { project: freshProject(), error: 'Your saved project could not be restored. The original save will be kept until you choose New project. Downloads remain available.' };
  }
}
export function useProject() {
  const [initial] = useState(readProject);
  const [project, setProject] = useState(initial.project);
  const [saveError, setSaveError] = useState(initial.error);
  const dirty = useRef(false);
  const unavailable = useRef(Boolean(initial.error));
  const update = (change) => {
    dirty.current = true;
    setProject(previous => typeof change === 'function' ? change(previous) : { ...previous, ...change });
  };
  useEffect(() => {
    if (unavailable.current) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); dirty.current = false; }
    catch { unavailable.current = true; dirty.current = true; setSaveError('Autosave is unavailable. Changes are unsaved. Keep this tab open and download your work before leaving.'); }
  }, [project]);
  useEffect(() => {
    const warn = event => { if (dirty.current || unavailable.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const reset = () => {
    unavailable.current = false;
    setSaveError('');
    update(freshProject());
  };
  return { project, update, reset, saveError };
}
export function addEvent(project, action, detail, extra = {}) {
  const at = new Date().toISOString();
  const entry = { id: crypto.randomUUID(), at, action, detail, ...extra };
  const history = [...project.history];
  const last = history.at(-1);
  if (action === 'Edited' && last?.action === action && last.target === extra.target) history[history.length - 1] = { ...last, after: extra.after, endedAt: at };
  else history.push(entry);
  return { ...project, history };
}
export function edit(project, target, before, after) {
  return JSON.stringify(before) === JSON.stringify(after) ? project : addEvent(project, 'Edited', target, { target, before, after });
}
export function learningSummary(project) {
  const edits = project.history.filter(event => event.action === 'Edited' && JSON.stringify(event.before) !== JSON.stringify(event.after));
  const feedback = project.aiOutputs.filter(output => output.action === 'feedback');
  const storyEditsAfterFeedback = edits.filter(event => event.target.startsWith('Story:') && project.history.slice(0, project.history.indexOf(event)).some(previous => previous.action === 'Story feedback received'));
  const approvals = project.history.filter(event => event.action === 'Content approved' || event.action === 'Brief locked' || event.action === 'Story and hook approved');
  return { editCount: edits.length, feedbackRounds: feedback.length, successfulCalls: project.aiOutputs.length, approvals, statements: [
    `${project.aiOutputs.length} successful AI responses and ${feedback.length} story feedback rounds were recorded in this browser.`,
    `${edits.length} edit episodes changed a field from its starting value. Consecutive typing in the same field is one episode.`,
    `${storyEditsAfterFeedback.length} story edit episodes followed delivered AI feedback. This counts actions, not the quality of the changes.`,
    ...feedback.map((entry, index) => `Feedback round ${index + 1}: ${entry.output.alignment.status}; ${entry.output.storyReadiness.status}.`),
    ...approvals.map(event => `${event.action}: ${event.detail}`),
    edits.length ? 'Review the before-and-after entries to judge how the revisions served the audience and brief.' : 'No field edits were recorded. Selecting or approving an AI response alone does not demonstrate revision.',
    'These observations describe recorded actions; they do not grade effort, understanding or authorship. Time between events may include breaks.'
  ] };
}
