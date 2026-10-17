import QRCode from 'qrcode';
import { briefText } from '../shared/brief.mjs';
import { learningSummary } from './project';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const labels = { primaryText: 'Primary copy', cta: 'Call to action', visualDirection: 'Visual direction', altText: 'Alt text', ethicalCheck: 'Responsibility check', onScreenText: 'On-screen text', onScreen: 'On-screen copy', whyItWorks: 'Why it works', claimCheck: 'Claim check', storyReadiness: 'Story readiness', missingLink: 'Connection to establish', educatorSummary: 'Production summary' };
export function readable(value, indent = '') {
  if (Array.isArray(value)) return value.map((item, index) => `${indent}${index + 1}. ${readable(item, indent + '  ')}`).join('\n\n');
  if (value && typeof value === 'object') return Object.entries(value).filter(([, item]) => item !== '').map(([key, item]) => `${indent}${labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase())}: ${typeof item === 'object' ? '\n' + readable(item, indent + '  ') : item}`).join('\n');
  return String(value ?? '');
}
export function outputText(project) {
  const { content, production } = project;
  return [`STORYLAB PRO — INSTAGRAM PRODUCTION HANDOFF`, `Fictional classroom client: ${project.lockedBrief?.client}`, `Format: Instagram ${project.deliverable === 'video' ? 'video storyboard' : 'image post'}`, `Exported: ${new Date().toISOString()}`, '', 'CAPTION', content?.primaryText, '', 'HEADLINE', content?.headline, '', 'CALL TO ACTION', content?.cta, '', ...(content?.frames || []).flatMap((frame, index) => [`${project.deliverable === 'video' ? 'SCENE' : 'IMAGE'} ${index + 1}: ${frame.title}`, `Time: ${frame.time || 'Still image'}`, `Script: ${frame.copy}`, `Visual: ${frame.visual}`, `On-screen text: ${frame.onScreen || 'None'}`, `Sound: ${frame.audio || 'Not applicable'}`, `Alt text: ${project.assets?.[index]?.altText || frame.altText || content.altText}`, '']), 'PRODUCTION GUIDANCE', production?.summary, '', 'ACCESSIBILITY', production?.accessibility, '', 'CLAIM / RESPONSIBILITY CHECK', content?.ethicalCheck, '', 'LOCKED BRIEF', briefText(project.lockedBrief)].join('\n');
}
export function downloadFile(name, value, type) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function recordDigest(report) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(report)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function makeReport(project) {
  const { session, ...snapshot } = project;
  return { copyEngineVersion: project.content?.copyEngineVersion || null, exportedAt: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...snapshot, version: 1, summary: learningSummary(project) };
}
export async function reportHtml(report, receipt, origin) {
  const url = receipt ? `${origin}/verify/${receipt.id}` : null;
  const qr = url ? await QRCode.toDataURL(url, { width: 240, margin: 4, errorCorrectionLevel: 'M' }) : null;
  const block = (title, value) => `<section><h2>${escape(title)}</h2><pre>${escape(value)}</pre></section>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>StoryLab Pro learning record</title><style>body{max-width:850px;margin:40px auto;padding:24px;font:16px/1.55 Arial,sans-serif;color:#17211f;background:#fffefa}h1,h2{color:#194a42}h1{font:36px Georgia,serif}h2{font-size:22px;margin-top:32px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}article{border:1px solid #d5d9d0;padding:16px;margin:16px 0;break-inside:avoid}img{width:180px}a{color:#1865f2}small{overflow-wrap:anywhere}button{padding:12px;background:#1865f2;color:white;border:0;border-radius:12px}@page{size:letter;margin:16mm}@media print{body{margin:0;padding:0;background:white}button{display:none}h2{break-after:avoid}}</style><body><h1>StoryLab Pro learning record</h1><p>By Dr Imran · Advertising storytelling training</p><p>Project: ${escape(report.projectId)}<br>Started: ${escape(report.startedAt)}<br>Exported: ${escape(report.exportedAt)}<br>Generation prompt version: ${escape(report.copyEngineVersion || 'Not recorded for this draft')}<br>Student timezone: ${escape(report.timezone)}. Event times below use ISO 8601 with UTC offset Z.</p><button onclick="window.print()">Print / save as PDF</button>
${block('What you did', report.summary.statements.join('\n'))}
${block('Student reflection', report.reflection || 'No reflection entered.')}
${block('Content production handoff', outputText(report))}
${block('Student story draft', Object.entries(report.arcDrafts).map(([key, value]) => `${key}: ${value}`).join('\n'))}
${block('Instagram image decisions', readable(report.assets || []))}
${block('Latest coaching feedback', readable(report.feedback))}
<section><h2>Timestamped decisions and changes</h2>${report.history.map(event => `<article><b>${escape(event.action)}</b><p>${escape(event.at)}${event.endedAt ? ` → ${escape(event.endedAt)}` : ''}</p><p>${escape(event.detail)}</p>${Object.hasOwn(event, 'before') ? `<b>Before</b><pre>${escape(typeof event.before === 'string' ? event.before : readable(event.before))}</pre><b>After</b><pre>${escape(typeof event.after === 'string' ? event.after : readable(event.after))}</pre>` : ''}</article>`).join('')}</section>
<section><h2>AI drafts retained for comparison</h2>${report.aiOutputs.map((entry, index) => `<article><h3>${index + 1}. AI-generated ${escape(entry.action)} · ${escape(entry.at)}${entry.copyEngineVersion ? ` · copy engine ${escape(entry.copyEngineVersion)}` : ''}</h3><pre>${escape(readable(entry.output))}</pre></article>`).join('')}</section>
<section><h2>Instructor verification</h2>${receipt ? `<img alt="QR code linking to this report’s StoryLab verification receipt" src="${qr}"><p><a href="${escape(url)}">Open the tool-issued receipt</a></p><p>Issued: ${escape(receipt.issuedAt)}. Server-confirmed successful AI calls: ${receipt.serverActions.length}.</p><p>${escape(receipt.notice)}</p><p>Upload this original HTML document on the verification page to check that its embedded record matches the tool-issued SHA-256 digest. Printed copies contain the QR and digest but cannot be checked byte for byte.</p><small>Record digest: ${escape(receipt.reportHash)}</small>` : '<p>No server receipt was issued. This is a local, unverified learning record. Return to StoryLab and try the verified download when the service is available.</p>'}</section>
<script type="application/json" id="storylab-record">${JSON.stringify(report).replace(/</g, '\\u003c')}</script></body></html>`;
}
