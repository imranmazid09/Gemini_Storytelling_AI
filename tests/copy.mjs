import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { copyIssues, hookIssues, COPY_ENGINE_VERSION } from '../shared/copy.mjs';
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
 assert(copyIssues({...content,primaryText: content.primaryText.replace(hook,'An altered hook.')},payload).some(issue=>issue.includes('verbatim')));
 assert(copyIssues({...content,headline: 'Guaranteed value for 999 students.'},payload).some(issue=>issue.includes('999')));
 assert(copyIssues({...content,headline: 'The ultimate choice.'},payload).some(issue=>issue.includes('banned phrase')));
}
assert(hookIssues({options:[{tactic:'Question',hook:'A?'},{tactic:'Scene',hook:'B.'},{tactic:'Number',hook:'1.'}]}, { story: '1 approved hour' }).length===0);
assert(hookIssues({options:[{tactic:'Question',hook:'A?'},{tactic:'Question',hook:'B?'},{tactic:'Question',hook:'C?'}]}).some(issue=>issue.includes('different')));
assert(hookIssues({options:[{tactic:'Question',hook:'a'.repeat(81)},{tactic:'Scene',hook:'B.'},{tactic:'Number',hook:'1.'}]}).some(issue=>issue.includes('80')));
assert.equal(COPY_ENGINE_VERSION,'1.0.0');
console.log('PASS: all six classroom briefs, verbatim hook, mandatory detail, unapproved numbers, banned language and distinct hook types.');
