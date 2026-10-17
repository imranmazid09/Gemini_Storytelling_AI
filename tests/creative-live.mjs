import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = process.env.STORYLAB_URL || 'https://instagram-review--dr-imran-story-lab.netlify.app';
const brief = JSON.parse(await fs.readFile('src/prebuilt-creative-briefs.json', 'utf8')).briefs.find(brief => brief.id === 'read-to-rise');
const story = 'Setup: Maya is a sophomore who signed up for Read to Rise after seeing a flyer in the campus library. She has never volunteered before and is not sure she has anything to offer.\nTension: At the two-hour training she worries she is not a strong enough reader herself to help a second grader. She almost leaves early.\nResolution: The trainer pairs her with a quiet eight-year-old who loves dinosaur books. They laugh through the first hour together, and Maya signs up for the full semester.';
async function post(path, body) {
  const response = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(65000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${path} (${response.status}): ${result.error}`);
  return result;
}
const { session } = await post('/api/record', { action: 'start' });
const payload = { briefFields: brief, brief: JSON.stringify(brief), story, deliverable: 'Instagram Image Post', platform: 'Instagram', length: 100, hashtags: false, emojis: false, creativeEnergy: 'Lively and relatable', visualStyle: process.env.VISUAL_STYLE || 'candid' };
const draft = await post('/api/coach', { action: 'content', payload, session });
await fs.writeFile('/private/tmp/storylab-creative-example.json', JSON.stringify({ brief, story, draft }, null, 2));
console.log(JSON.stringify({ caption: draft.primaryText, visual: draft.frames[0].visual, overlay: draft.frames[0].onScreen, issues: draft.copyReview?.issues, trace: draft.storyTrace }, null, 2));
assert.deepEqual(draft.copyReview.issues, []);
assert(draft.primaryText.includes('Maya'));
const visual = await post('/api/coach', { action: 'image', session, payload: { prompt: draft.frames[0].visual, context: story, brief: JSON.stringify(brief), visualStyle: payload.visualStyle, aspectRatio: '1:1' } });
const [header, data] = visual.dataUrl.split(',');
const path = '/private/tmp/storylab-creative-example.' + (header.includes('jpeg') ? 'jpg' : 'png');
await fs.writeFile(path, Buffer.from(data, 'base64'));
await fs.writeFile('/private/tmp/storylab-creative-media.json', JSON.stringify({ dataUrl: visual.dataUrl, visualStyle: payload.visualStyle }));
console.log(JSON.stringify({ image: path, review: visual.imageReview, model: visual.model, bytes: Buffer.from(data, 'base64').length, receipt: Boolean(visual._receipt) }));
assert.equal(visual.imageReview.checked, true);
