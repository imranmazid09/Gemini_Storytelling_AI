import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { presentationIssues, narrativeIssues } from '../shared/creative.mjs';
const origin = process.env.STORYLAB_URL || 'https://instagram-review--dr-imran-story-lab.netlify.app';
const briefs = JSON.parse(await fs.readFile('src/prebuilt-creative-briefs.json', 'utf8')).briefs;
// Fictional test stories, never substituted for a student's own work.
const stories = {
  copperline: 'Setup: Nia closes her notebook after class but keeps staring at the notes. Tension: At the campus market cooler she hesitates, still mentally rehearsing the lecture instead of taking a break. Resolution: She puts the notebook into her bag, chooses a Copperline can and lets the notebook stay there for her coffee pause.',
  threadloop: 'Character: Sam wants a vintage look that still feels like their own clothes. Problem: Trying to style a vintage jacket, Sam keeps changing back into the same familiar hoodie, worrying that vintage will feel like a costume. Guidance: Browsing Threadloop, Sam notices a photographed jacket styled simply. Change: Sam decides to try their own jacket with the hoodie rather than replace their whole style.',
  roomsync: 'Character: Avery wants to discuss sleep routines with a potential roommate. Problem: They draft a message, then delete it, worrying that asking about quiet time will sound unfriendly before they have met. Guidance: The RoomSync preferences quiz gives Avery a starting point. Change: Avery chooses to share their bedtime preference to begin the conversation.',
  fixery: 'Exposition: Jo tilts a cracked phone to read a message through the unbroken corner. Rising Action: They put off asking about repair because they do not know what they will be committing to. Turning Point: At The Fixery, Jo asks for an assessment and receives a price quote before any repair. Resolution: Jo reads the quote before deciding what to do next.',
  lakeshore: 'Exposition: Friends scroll their summer group chat without choosing a plan. Rising Action: Every suggestion stays a suggestion because they keep waiting for someone else to decide. Turning Point: One friend shares the Lakeshore Summer Fest event details, including the three days and two shoreline stages. Resolution: They decide to review the early-bird ticket options together.',
  'read-to-rise': 'Setup: Maya is a sophomore who signed up for Read to Rise after seeing a flyer in the campus library. She has never volunteered before and is not sure she has anything to offer. Tension: At the two-hour training she worries she is not a strong enough reader herself to help a second grader. She almost leaves early. Resolution: The trainer pairs her with a quiet eight-year-old who loves dinosaur books. They laugh through the first hour together, and Maya signs up for the full semester.',
};
async function post(path, body) {
  const response = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(70000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${path} (${response.status}): ${result.error || result.errorMessage}`);
  return result;
}
const { session } = await post('/api/record', { action: 'start' });
const results = [];
const frameworks = { copperline: 'threeAct', threadloop: 'storybrand', roomsync: 'storybrand', fixery: 'freytag', lakeshore: 'freytag', 'read-to-rise': 'threeAct' };
const selected = process.env.STORYLAB_BRIEF_IDS ? briefs.filter(brief => process.env.STORYLAB_BRIEF_IDS.split(',').includes(brief.id)) : briefs;
assert(selected.length > 0, 'Select at least one known brief.');
const cases = selected.map(brief => ({ id: brief.id, brief, story: stories[brief.id], framework: frameworks[brief.id] }));
if (process.env.STORYLAB_EXTENDED === '1') {
  const brief = briefs.find(item => item.id === 'read-to-rise');
  cases.push({ id: 'weak-source', brief, framework: 'threeAct', story: 'Read to Rise offers two-hour volunteer training and weekly one-hour reading sessions on campus. Students can participate without previous experience. The program pairs trained college volunteers with elementary students. Training is available for students who want to help. Sign up for training.', expectFlag: true });
  cases.push({ id: 'video-turn', brief, framework: 'threeAct', story: stories['read-to-rise'], video: true });
}
for (const test of cases) {
  const { brief } = test;
  const payload = { briefFields: brief, brief: JSON.stringify(brief), story: test.story, storyFramework: test.framework, deliverable: test.video ? 'Instagram Video Storyboard' : 'Instagram Image Post', sceneCount: 4, duration: 30, platform: 'Instagram', length: 100, hashtags: false, emojis: false, creativeEnergy: 'Lively and relatable', visualStyle: 'graphic' };
  const start = Date.now();
  try {
    const output = await post('/api/coach', { action: 'content', session, payload });
    const issues = [...new Set([...(output.copyReview?.issues || []), ...presentationIssues(output, payload)])];
    if (test.video && !/\bsemester\b/i.test(output.frames.map(frame => frame.copy + ' ' + frame.visual).join(' '))) issues.push('The source-specific semester commitment is missing from the actual storyboard scenes.');
    const expected = test.expectFlag ? issues.length > 0 && /source|approved story|student.*story/i.test(issues.join(' ')) : issues.length === 0;
    results.push({ id: test.id, expected, seconds: (Date.now() - start) / 1000, payload, output, issues, sourceMappingIssues: output.storyTrace ? narrativeIssues(output, payload) : [] });
    console.log(JSON.stringify({ id: test.id, framework: test.framework, expected, seconds: results.at(-1).seconds, caption: output.primaryText, frames: output.frames, issues }));
  } catch (error) {
    results.push({ id: test.id, expected: false, issues: [error.message] });
    console.log(JSON.stringify(results.at(-1)));
  }
  await fs.writeFile('/private/tmp/storylab-storytelling-review.json', JSON.stringify(results, null, 2));
}
assert.deepEqual(results.filter(result => !result.expected).map(result => result.id), [], 'Inspect unexpected results in /private/tmp/storylab-storytelling-review.json.');
console.log(`PASS: live storytelling checks across ${cases.length} cases; semantic review is AI judgment, not a quality guarantee.`);
