import { toBlob } from 'html-to-image';
import { zipSync, strToU8 } from 'fflate';
import { outputText } from './report';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
function imageFrom(src) {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('An image could not be opened for export. Upload or generate it again.')); image.src = src; });
}
function canvasBlob(canvas) { return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The image could not be exported.')), 'image/png')); }
function linesFor(context, text, width) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= width) line = candidate;
      else {
        if (line) lines.push(line);
        line = '';
        for (const character of word) {
          if (context.measureText(line + character).width > width && line) { lines.push(line); line = ''; }
          line += character;
        }
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}
export async function renderAsset(project, media, index) {
  const src = media[project.assets?.[index]?.id];
  if (!src) throw new Error(`Add an image for ${project.deliverable === 'video' ? 'scene' : 'post'} ${index + 1} before downloading.`);
  const image = await imageFrom(src);
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = project.deliverable === 'video' ? 1920 : 1080;
  const context = canvas.getContext('2d');
  const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
  context.drawImage(image, (canvas.width - image.width * scale) / 2, (canvas.height - image.height * scale) / 2, image.width * scale, image.height * scale);
  const text = project.content.frames[index].onScreen?.trim();
  if (text) {
    let fontSize = 64, lines;
    do { context.font = `700 ${fontSize}px Arial`; lines = linesFor(context, text, 936); if (lines.length * fontSize * 1.25 <= canvas.height * .4) break; fontSize -= 2; } while (fontSize > 20);
    const lineHeight = fontSize * 1.25, boxHeight = lines.length * lineHeight + 96;
    const position = project.overlayPosition || 'bottom';
    const top = position === 'top' ? 0 : position === 'center' ? (canvas.height - boxHeight) / 2 : canvas.height - boxHeight;
    context.fillStyle = 'rgba(0,0,0,.64)'; context.fillRect(0, top, canvas.width, boxHeight);
    context.fillStyle = '#fff'; context.textBaseline = 'top';
    lines.forEach((line, number) => context.fillText(line, 72, top + 48 + number * lineHeight));
  }
  return canvasBlob(canvas);
}
export async function renderPost(project, media) {
  const original = document.querySelector('.instagram-post');
  if (!original) throw new Error('Open the Instagram post preview before downloading its mockup.');
  const clone = original.cloneNode(true);
  clone.classList.add('ig-export'); clone.style.width = '540px'; clone.style.maxWidth = 'none';
  const caption = clone.querySelector('.ig-copy > p');
  const username = document.createElement('b'); username.textContent = project.username || project.lockedBrief.client.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 30);
  caption.replaceChildren(username, document.createTextNode(' ' + project.content.primaryText));
  clone.querySelectorAll('.ig-more').forEach(button => button.remove());
  const wrapper = document.createElement('div'); wrapper.className = 'ig-export-wrapper'; wrapper.style.cssText = 'position:fixed;left:-10000px;top:0;width:540px;background:white'; wrapper.append(clone); document.body.append(wrapper);
  try {
    await Promise.all([...clone.querySelectorAll('img')].map(image => image.decode()));
    const blob = await toBlob(clone, { pixelRatio: 2, skipFonts: true, backgroundColor: '#ffffff', width: 540 });
    if (!blob) throw new Error('Could not create the post mockup.');
    const bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height + 64;
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0); bitmap.close();
    context.fillStyle = '#63716c'; context.font = '22px Arial'; context.fillText('Student concept · Instagram mockup · StoryLab Pro', 32, canvas.height - 24);
    return canvasBlob(canvas);
  } finally { wrapper.remove(); }
}
async function dataUrl(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }); }
export async function storyboardHtml(project, media) {
  const scenes = await Promise.all(project.content.frames.map(async (frame, index) => {
    const image = await dataUrl(await renderAsset(project, media, index));
    return `<article><img src="${image}" alt="${escape(project.assets?.[index]?.altText || frame.altText || project.content.altText)}"><div><h2>Scene ${index + 1}: ${escape(frame.title)}</h2><p><b>Time:</b> ${escape(frame.time)}</p><p><b>Action:</b> ${escape(frame.visual)}</p><p><b>Script / voiceover:</b> ${escape(frame.copy)}</p><p><b>On-screen text:</b> ${escape(frame.onScreen || 'None')}</p><p><b>Sound:</b> ${escape(frame.audio)}</p><p><b>Image source:</b> ${escape(project.assets?.[index]?.source)}</p></div></article>`;
  }));
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instagram video storyboard</title><style>body{max-width:960px;margin:32px auto;padding:24px;font:16px/1.5 Arial;color:#17211f;background:#fffefa}h1,h2{color:#194a42}article{display:grid;grid-template-columns:220px 1fr;gap:24px;padding:24px 0;border-bottom:1px solid #d5d9d0;break-inside:avoid}img{width:100%;height:auto}p{white-space:pre-wrap;overflow-wrap:anywhere}button{background:#1865f2;color:white;border:0;padding:16px;border-radius:12px}@media(max-width:600px){article{grid-template-columns:1fr}img{max-width:220px}}@media print{button{display:none}body{margin:0;padding:0;background:white}article{grid-template-columns:170px 1fr}@page{size:letter;margin:16mm}}</style><body><h1>Instagram video storyboard</h1><p>Student concept · ${escape(project.lockedBrief.client)} · By Dr Imran</p><p>Production plan with illustrated scenes and script. This document is not a rendered video.</p><button onclick="window.print()">Print / save as PDF</button>${scenes.join('')}<h2>Instagram caption</h2><p>${escape(project.content.primaryText)}</p><h2>Accessibility and responsibility</h2><p>${escape(project.production?.accessibility || project.content.altText)}</p><p>${escape(project.content.ethicalCheck)}</p></body></html>`;
}
export async function submissionZip(project, media, learningHtml) {
  const files = {
    'instructor-learning-record.html': strToU8(learningHtml),
    'caption-and-production-script.txt': strToU8(outputText(project)),
    'READ-ME.txt': strToU8('StoryLab Pro classroom submission\nOpen instructor-learning-record.html to inspect the brief, story, revision history and verification status.\nCreative images are in images/. The image-post mockup is a simulated Instagram post, not published content. Video storyboards are production plans, not rendered videos.\n'),
  };
  for (let index = 0; index < project.content.frames.length; index++) {
    files[`images/${project.deliverable === 'video' ? 'scene' : 'post'}-${index + 1}.png`] = new Uint8Array(await (await renderAsset(project, media, index)).arrayBuffer());
  }
  if (project.deliverable === 'video') files['illustrated-storyboard.html'] = strToU8(await storyboardHtml(project, media));
  else files['instagram-post-mockup.png'] = new Uint8Array(await (await renderPost(project, media)).arrayBuffer());
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' });
}
