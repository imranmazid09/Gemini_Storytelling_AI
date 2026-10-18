import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { freshProject } from '../src/project.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
const origin = process.env.STORYLAB_URL || 'http://127.0.0.1:4173';
const brief = JSON.parse(await fs.readFile('src/prebuilt-creative-briefs.json', 'utf8')).briefs[0];
const feedback = { alignment: { status: 'Aligned', summary: 'Specific audience and brand role.', missingLink: '' }, storyReadiness: { status: 'Ready for hooks', summary: 'A choice changes the experience.', priority: '' }, connection: 'Concrete viewpoint.', responsibility: 'Supplied facts.', beats: [{ stage: 'Setup', sharpen: 'Add a detail.' }], questions: ['Why does this moment matter?'], rubric: [{ label: 'Brief alignment', level: 'Aligned' }] };
const hook = { hook: 'Take a break between classes.', tactic: 'Relatability', trigger: 'Identity call-out', visual: 'Cooler opens.', onScreenText: 'Time for a break.', audio: 'Door opens.', whyItWorks: 'Concrete moment.', claimCheck: 'Supplied facts only.' };
const content = { primaryText: 'Time for a break. Find Copperline in the campus market cooler starting October 27.', headline: 'Time for a break', cta: 'Try a can.', visualDirection: 'Can beside notebook.', altText: 'Can beside notebook.', ethicalCheck: 'Fictional classroom facts.', frames: [{ title: 'Frame 1', copy: 'Time for a break.', visual: 'Can beside notebook.' }] };
const production = { summary: 'Build this post.', scenes: [{ stage: 'Frame 1', time: 'Frame 1', visual: 'Can beside notebook.', onScreen: 'Time for a break.', audio: 'Not applicable — static format' }], accessibility: 'Use legible contrast.', educatorSummary: 'Approved copy and visual.' };
const stageFor = { brief: 1, feedback: 2, content: 3, production: 4, image: 3 };
const buttonFor = { brief: 'Generate a brief', feedback: 'Get focused feedback', content: 'Generate Instagram draft', production: 'Build final guidance', image: 'Generate post image' };
const outputFor = { brief: { ...brief, id: 'ai-new', client: 'New Fictional Client', aiGenerated: true }, feedback, hooks: { options: [hook] }, content, production, image: { dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', source: 'AI-generated' } };
async function setup(action) {
 const project = { ...freshProject(), session: 'a'.repeat(48), stage: stageFor[action], brief: action === 'brief' ? null : brief, lockedBrief: action === 'brief' ? null : brief, arcDrafts: action === 'brief' ? {} : { Setup: 'Mina leaves class for a break.', Tension: 'She wants a brief pause before her next class.', Resolution: 'She chooses a can from the campus cooler.' }, feedback: action === 'hooks' ? feedback : null, storyLocked: ['content', 'production', 'image'].includes(action), selectedHook: ['content', 'production'].includes(action) ? hook.hook : '', selectedHookPlan: ['content', 'production'].includes(action) ? hook : null, contentLocked: action === 'production', content: ['production', 'image'].includes(action) ? content : null };
 const page = await browser.newPage();
 const errors = []; page.on('pageerror', error => errors.push(error.message));
 await page.addInitScript(project => { localStorage.setItem('storylab-project-v2', JSON.stringify(project)); window.confirm = () => { throw new Error('Native dialogs unavailable'); }; AbortSignal.timeout = undefined; }, project);
 let mode = 'hang', requests = 0;
 const pending = [];
 await page.route('**/api/coach', async route => { requests++; if (mode === 'hang') { pending.push(route); return; } await route.fulfill({ status: mode === 'fail' ? 502 : 200, contentType: 'application/json', body: JSON.stringify(mode === 'fail' ? { error: 'The coach is temporarily unavailable. Try again.' } : outputFor[action]) }); });
 await page.goto(origin);
 await page.getByRole('button', { name: buttonFor[action], exact: true }).waitFor();
 await page.clock.install();
 return { page, errors, getRequests: () => requests, mode: value => { mode = value; }, releaseLate: async () => { for (const route of pending.splice(0)) await route.fulfill({ json: outputFor[action] }).catch(() => {}); } };
}
for (const action of Object.keys(stageFor)) {
 const test = await setup(action), { page } = test;
 await page.getByRole('button', { name: buttonFor[action], exact: true }).click();
 await page.getByRole('status', { name: 'Request progress', exact: true }).waitFor();
 assert(await page.getByRole('button', { name: 'Cancel request', exact: true }).isEnabled());
 assert(await page.getByRole('button', { name: 'New project', exact: true }).isEnabled());
 assert.equal(await page.locator('fieldset[disabled]').count(), 0);
 if (action === 'feedback') await page.screenshot({ path: '/private/tmp/storylab-request-progress.png' });
 await page.waitForFunction(() => document.querySelector('.request-status'));
 // Advance the same production timers; no special test-only timeout setting.
 assert((await page.getByRole('status', { name: 'Request progress', exact: true }).innerText()).includes(`Waiting limit: ${action === 'image' ? 60 : action === 'content' ? 70 : 45} seconds`));
 await page.clock.fastForward(action === 'content' ? 71000 : action === 'image' ? 61000 : 46000);
 await page.getByRole('alert').filter({ hasText: action === 'image' ? 'timed out' : 'took too long' }).waitFor();
 if (action === 'image') {
   const box = await page.locator('#request-error').boundingBox();
   assert(box && box.y >= 0 && box.y < page.viewportSize().height, 'The image timeout stays visible while scrolled into the image editor.');
   await page.screenshot({ path: '/private/tmp/storylab-image-timeout.png' });
 }
 assert.equal(await page.getByRole('button', { name: 'Cancel request', exact: true }).count(), 0);
 assert(await page.getByRole('button', { name: buttonFor[action], exact: true }).isEnabled());
 const retryButton = action === 'image' ? buttonFor.image : 'Try again';
 test.mode('fail'); await page.getByRole('button', { name: retryButton, exact: true }).click();
 await page.getByRole('alert').filter({ hasText: action === 'image' ? 'service, connection' : 'temporarily unavailable' }).waitFor();
 test.mode('success'); await page.getByRole('button', { name: retryButton, exact: true }).click();
 await page.waitForFunction(() => JSON.parse(localStorage.getItem('storylab-project-v2')).aiOutputs.length === 1);
 assert.equal(await page.getByRole('button', { name: 'Cancel request', exact: true }).count(), 0);
 assert.deepEqual(test.errors, []);
 if (action === 'brief') assert(await page.getByRole('button', { name: 'Regenerate a brief', exact: true }).isEnabled());
 if (action === 'production') assert((await page.locator('.package-header').innerText()).includes('Instagram image + caption'));
 await page.close(); console.log(`PASS: ${action} loading, hard timeout, error, retry, recovery without native browser APIs.`);
}
// Returning to a suspended image request must end the wait before accepting a late image.
{
 const test = await setup('image'), { page } = test;
 const before = await page.evaluate(() => JSON.parse(localStorage.getItem('storylab-project-v2')));
 await page.getByRole('button', { name: buttonFor.image, exact: true }).click();
 await page.getByRole('status', { name: 'Request progress', exact: true }).waitFor();
 await page.clock.fastForward(21000);
 assert(await page.getByText('Still waiting for image generation or review.', { exact: false }).isVisible());
 const now = await page.evaluate(() => Date.now());
 await page.clock.setSystemTime(new Date(now + 61000));
 await page.evaluate(() => window.dispatchEvent(new Event('focus')));
 await page.getByRole('alert').filter({ hasText: 'timed out' }).waitFor();
 await test.releaseLate();
 await page.clock.fastForward(1000);
 const after = await page.evaluate(() => JSON.parse(localStorage.getItem('storylab-project-v2')));
 assert.deepEqual(after.content, before.content); assert.deepEqual(after.arcDrafts, before.arcDrafts);
 assert.equal(after.aiOutputs.length, 0); assert.equal(after.assets.length, 0);
 assert(after.history.some(event => event.action === 'Request started' && event.requestAction === 'image' && event.timeoutMs === 60000));
 assert(after.history.some(event => event.failureCategory === 'timeout' && event.elapsedMs >= 60000));
 assert(await page.getByRole('button', { name: buttonFor.image, exact: true }).isEnabled());
 assert.deepEqual(test.errors, []); await page.close();
 console.log('PASS: image elapsed progress, wall-clock timeout on resume, preserved work and ignored late images.');
}
// An edit cancels the old request and preserves the new draft.
{
 const { page, errors } = await setup('feedback');
 await page.getByRole('button', { name: 'Get focused feedback', exact: true }).click();
 await page.getByRole('button', { name: 'Cancel request', exact: true }).waitFor();
 await page.getByLabel('Setup', { exact: true }).fill('A new student-written setup.');
 await page.getByRole('alert').filter({ hasText: 'story changed' }).waitFor();
 assert.equal(await page.getByLabel('Setup', { exact: true }).inputValue(), 'A new student-written setup.');
 assert.equal(await page.getByRole('button', { name: 'Cancel request', exact: true }).count(), 0);
 // Every arc change has a visible active state and different fields, despite unavailable window.confirm.
 for (const [name, fields] of [['StoryBrand', ['Character', 'Problem', 'Guidance', 'Change']], ['Freytag', ['Exposition', 'Rising Action', 'Turning Point', 'Resolution']], ['Three-Act', ['Setup', 'Tension', 'Resolution']]]) {
   await page.getByRole('button', { name: new RegExp('^' + name) }).click();
   if (await page.getByRole('alertdialog').count()) await page.getByRole('button', { name: 'Confirm change', exact: true }).click();
   for (const field of fields) await page.getByLabel(field, { exact: true }).waitFor();
   assert.equal(await page.getByRole('button', { name: new RegExp('^' + name) }).getAttribute('aria-pressed'), 'true');
 }
 await page.getByRole('button', { name: 'Unlock to edit', exact: true }).click();
 await page.getByRole('alertdialog').waitFor();
 await page.screenshot({ path: '/private/tmp/storylab-unlock-confirmation.png' });
 await page.getByRole('button', { name: 'Keep my work', exact: true }).click();
 assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('storylab-project-v2')))).stage, 2);
 await page.getByRole('button', { name: 'Unlock to edit', exact: true }).click();
 await page.getByRole('button', { name: 'Confirm change', exact: true }).click();
 await page.getByLabel('Fictional client', { exact: true }).waitFor();
 assert(await page.getByLabel('Fictional client', { exact: true }).isEditable());
 await page.getByRole('button', { name: 'New project', exact: true }).click();
 await page.getByRole('alertdialog').waitFor();
 await page.getByRole('button', { name: 'Confirm change', exact: true }).click();
 assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('storylab-project-v2')))).brief, null);
 assert.deepEqual(errors, []); await page.close();
 console.log('PASS: edit cancellation, all arc fields/active states, canceled/confirmed unlock, confirmed reset.');
}
// Reset remains a recovery option while an AI request is pending.
{
 const { page } = await setup('feedback');
 await page.getByRole('button', { name: 'Get focused feedback', exact: true }).click();
 await page.getByRole('button', { name: 'Cancel request', exact: true }).waitFor();
 await page.getByRole('button', { name: 'New project', exact: true }).click();
 await page.getByRole('button', { name: 'Confirm change', exact: true }).click();
 await page.locator('.brief-card').first().waitFor();
 await page.clock.fastForward(60000);
 const project = await page.evaluate(() => JSON.parse(localStorage.getItem('storylab-project-v2')));
 assert.equal(project.brief, null); assert.equal(project.aiOutputs.length, 0); assert.equal(project.history.length, 0);
 await page.close(); console.log('PASS: reset aborts pending AI work and late deadlines cannot overwrite the new project.');
}
await browser.close();
