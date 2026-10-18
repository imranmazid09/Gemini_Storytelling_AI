import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { copyIssues, sceneTimes, COPY_ENGINE_VERSION } from '../shared/copy.mjs';
const briefs = JSON.parse(await fs.readFile('src/prebuilt-creative-briefs.json','utf8')).briefs;
const examples = [
 ['Notebook down. Cooler door open.', 'Cold brew for the between-class break.', 'Find Copperline in the campus market cooler starting October 27.', 'Try a can from the cooler.'],
 ['What will you wear to your next class?', 'Vintage without the hunt.', 'New drops every Friday.', 'Browse the Friday drop.'],
 ['What would you ask a roommate?', 'Start the roommate conversation before move-in.', 'Take the preferences quiz before March housing selection.', 'Download the app and take the quiz.'],
 ['Your cracked screen has questions.', 'Start your screen repair close to campus.', '48 West Fulton, weekdays 9 to 6.', 'Walk in for an assessment.'],
 ['Three days. Two stages. One shoreline.', 'Plan a lakeside music weekend.', 'Early-bird ends May 1. Link in bio to tickets.', 'Buy an early-bird ticket.'],
 ['One hour a week. A stack of picture books.', 'Read together on campus.', 'No experience needed; training provided.', 'Sign up for training.']
];
for (let i=0;i<briefs.length;i++) {
 const [hook, message, mandatory, cta] = examples[i];
 const payload = { briefFields: briefs[i], story: 'An approved fictional scene includes a notebook, a cooler and picture books when appropriate.', hook, deliverable: 'Static Post' };
 const content = { primaryText: `${hook}\n${message}\n\n${mandatory}\n${cta}`, headline: message, cta, frames: [{ copy: hook }] };
 assert.deepEqual(copyIssues(content,payload),[],briefs[i].client);
 assert(copyIssues({...content,headline: 'Guaranteed value for 999 students.'},payload).some(issue=>issue.includes('999')));
 assert(copyIssues({...content,headline: 'The ultimate choice.'},payload).some(issue=>issue.includes('banned phrase')));
}
assert(copyIssues({primaryText:'Your outfit?\nSkip the crowded racks.\n\nNew drops every Friday.\nBrowse the Friday drop.',headline:'Vintage',cta:'Browse the Friday drop.',frames:[]},{briefFields:briefs[1],hook:'Your outfit?',story:'A student browses Friday listings.'}).some(issue=>issue.includes('crowding')));
assert.match(COPY_ENGINE_VERSION,/^\d+\.\d+\.\d+$/);
const punctuationCopy = { primaryText: 'Cracked screen.\n\n48 West Fulton, weekdays 9 to 6.\nStop by for a screen assessment.', headline: 'Screen assessments near campus', cta: 'Stop by for a screen assessment', frames: [] };
assert(!copyIssues(punctuationCopy,{briefFields:briefs[3],hook:'Cracked screen.',story:'A student requests an assessment.',deliverable:'Static Post'}).some(issue=>issue.includes('End the caption')));
const base = { ...punctuationCopy, frames: [{ title: 'Image', copy: 'Cracked screen.', visual: 'A phone.', onScreen: '' }] };
const settings = { briefFields: briefs[3], story: 'A student requests an assessment.', deliverable: 'Instagram Image Post', length: 100, hashtags: false, emojis: false };
assert(!copyIssues(base, settings).some(issue => /hook/i.test(issue)));
assert(copyIssues({ ...base, primaryText: base.primaryText + '\n#repair' }, settings).some(issue => issue.includes('hashtags')));
assert(copyIssues(base, { ...settings, length: 3 }).some(issue => issue.includes('3 words')));
assert(copyIssues({ ...base, headline: 'Twenty ideas. Zero plans.' }, settings).some(issue => issue.includes('20')), 'Spelled-out invented quantities must not bypass the approved-number check.');
assert(!copyIssues({ ...base, headline: 'Read through one unbroken corner.' }, settings).some(issue => issue.includes('approved brief or story: 1')), 'Indefinite narrative language is not an unsupported statistic.');
assert(copyIssues({ ...base, headline: 'A one-hour repair.' }, settings).some(issue => issue.includes('approved brief or story: 1')), 'An unsupported one-hour promise must still fail.');
assert(!copyIssues({ ...base, headline: '1 shoreline.' }, { ...settings, story: 'A student looks toward one shoreline.' }).some(issue => issue.includes('approved brief or story: 1')), 'Written source quantities still authorize their numeric form.');
const video = { ...base, frames: [0,1,2].map(index => ({ copy: 'A student pauses.', onScreen: '', time: `${index * 5}-${(index + 1) * 5} seconds` })) };
assert.deepEqual(sceneTimes('0:00 - 0:07'), [0, 7]);
assert.deepEqual(sceneTimes('1:05.5 - 1:12'), [65.5, 72]);
assert.deepEqual(sceneTimes('0.5-7 seconds'), [0.5, 7]);
assert.deepEqual(sceneTimes('0:65 - 1:10'), []);
assert.deepEqual(sceneTimes('scene 1, 0-5'), []);
const clockVideo = { ...video, frames: video.frames.map((frame, index) => ({ ...frame, time: `0:${String(index * 5).padStart(2, '0')} - 0:${String((index + 1) * 5).padStart(2, '0')}` })) };
assert(!copyIssues(clockVideo, { ...settings, deliverable: 'Instagram Video Storyboard', duration: 15, sceneCount: 3 }).some(issue => /consecutive|must end/.test(issue)));
assert(!copyIssues(video, { ...settings, deliverable: 'Instagram Video Storyboard', duration: 15, sceneCount: 3 }).some(issue => /consecutive|must end|scenes/.test(issue)));
assert(copyIssues(video, { ...settings, deliverable: 'Instagram Video Storyboard', duration: 20, sceneCount: 3 }).some(issue => issue.includes('end at 20')));
console.log('PASS: all six briefs, mandatory detail, unapproved numbers, banned language, caption settings and storyboard duration; no separate opening approval.');
