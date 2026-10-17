import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { presentationIssues, narrativeIssues } from '../shared/creative.mjs';
const origin = process.env.STORYLAB_URL || 'https://instagram-review--dr-imran-story-lab.netlify.app';
const briefs = JSON.parse(await fs.readFile('src/prebuilt-creative-briefs.json', 'utf8')).briefs;
// Fictional test stories, never substituted for a student's own work.
const stories = {
  copperline: 'Setup: Nia closes her notebook after class but keeps staring at the notes. Tension: At the campus market cooler she hesitates, still mentally rehearsing the lecture instead of taking a break. Resolution: She puts the notebook into her bag, chooses a Copperline can and lets the notebook stay there for her coffee pause.',
  threadloop: 'Setup: Sam is trying to style a vintage jacket but keeps changing back into the same familiar hoodie. Tension: They worry that a vintage look will feel like a costume instead of their own clothes. Resolution: Browsing Threadloop, they notice a photographed jacket styled simply, and decide to try their own jacket with the hoodie rather than replace their whole style.',
  roomsync: 'Setup: Avery drafts a message to a potential roommate about sleep routines, then deletes it. Tension: They worry that asking about quiet time will sound unfriendly before they have even met. Resolution: The RoomSync preferences quiz gives Avery a starting point, and they choose to share their bedtime preference to begin the conversation.',
  fixery: 'Setup: Jo tilts a cracked phone to read a message through the unbroken corner. Tension: They have been putting off asking about repair because they do not know what they will be committing to. Resolution: At The Fixery, Jo asks for an assessment and reads the price quote before deciding what to do next.',
  lakeshore: 'Setup: A group of friends scrolls their summer group chat without choosing a plan. Tension: Every suggestion stays a suggestion because they keep waiting for someone else to decide. Resolution: One friend shares the Lakeshore Summer Fest event details, including the three days and two shoreline stages, and they decide to review the early-bird ticket options together.',
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
for (const brief of briefs) {
  const payload = { briefFields: brief, brief: JSON.stringify(brief), story: stories[brief.id], deliverable: 'Instagram Image Post', platform: 'Instagram', length: 100, hashtags: false, emojis: false, creativeEnergy: 'Lively and relatable', visualStyle: 'graphic' };
  const start = Date.now();
  try {
    const output = await post('/api/coach', { action: 'content', session, payload });
    const issues = [...new Set([...(output.copyReview?.issues || []), ...presentationIssues(output, payload)])];
    results.push({ id: brief.id, seconds: (Date.now() - start) / 1000, payload, output, issues, sourceMappingIssues: output.storyTrace ? narrativeIssues(output, payload) : [] });
    console.log(JSON.stringify({ id: brief.id, seconds: results.at(-1).seconds, caption: output.primaryText, visual: output.frames[0].visual, overlay: output.frames[0].onScreen, issues }));
  } catch (error) {
    results.push({ id: brief.id, issues: [error.message] });
    console.log(JSON.stringify(results.at(-1)));
  }
  await fs.writeFile('/private/tmp/storylab-storytelling-review.json', JSON.stringify(results, null, 2));
}
assert.deepEqual(results.filter(result => result.issues.length).map(result => result.id), [], 'Inspect flagged drafts in /private/tmp/storylab-storytelling-review.json.');
console.log('PASS: live captions and image concepts across all six briefs; semantic review is AI judgment, not a quality guarantee.');
