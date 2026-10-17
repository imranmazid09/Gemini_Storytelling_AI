import fs from 'node:fs/promises';
const origin = process.env.STORYLAB_URL || 'https://instagram-review--dr-imran-story-lab.netlify.app';
const brief = JSON.parse(await fs.readFile('src/prebuilt-creative-briefs.json', 'utf8')).briefs[0];
async function post(path, body) { const response = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(65000) }); const result = await response.json(); if (!response.ok) throw new Error(`${path} (${response.status}): ${result.error}`); return result; }
const { session } = await post('/api/record', { action: 'start' });
const payload = { briefFields: brief, brief: JSON.stringify(brief), story: 'Setup: A student puts a notebook down during a break between classes. Tension: The student wants a coffee pause before the next class. Resolution: They choose a Copperline can from the campus market cooler.', deliverable: 'Instagram Image Post', platform: 'Instagram', length: 100, duration: 30, sceneCount: 4, hashtags: false, emojis: false };
const draft = await post('/api/coach', { action: 'content', payload, session });
await fs.writeFile('/private/tmp/storylab-live-draft.json', JSON.stringify(draft, null, 2));
console.log(JSON.stringify({ test: 'Live Instagram image-post draft', frames: draft.frames.length, issues: draft.copyReview?.issues, receipt: Boolean(draft._receipt) }));
const visual = await post('/api/coach', { action: 'image', session, payload: { prompt: draft.frames[0].visual, context: payload.story, brief: JSON.stringify(brief), aspectRatio: '1:1' } });
const [header, data] = visual.dataUrl.split(',');
const extension = header.includes('jpeg') ? 'jpg' : 'png';
await fs.writeFile(`/private/tmp/storylab-live-image.${extension}`, Buffer.from(data, 'base64'));
console.log(JSON.stringify({ test: 'Live generated image', model: visual.model, bytes: Buffer.from(data,'base64').length, receipt: Boolean(visual._receipt) }));
const storyboard = await post('/api/coach', { action: 'content', session, payload: { ...payload, deliverable: 'Instagram Video Storyboard', duration: 20, sceneCount: 4 } });
await fs.writeFile('/private/tmp/storylab-live-storyboard.json', JSON.stringify(storyboard, null, 2));
console.log(JSON.stringify({ test: 'Live video storyboard', scenes: storyboard.frames.length, times: storyboard.frames.map(frame => frame.time), issues: storyboard.copyReview?.issues, receipt: Boolean(storyboard._receipt) }));
