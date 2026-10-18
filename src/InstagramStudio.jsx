import { cloneElement, useId, useState } from 'react';
import { ArrowRight, Bookmark, Download, Heart, Image as ImageIcon, MessageCircle, MoreHorizontal, Send, Sparkles, Film } from 'lucide-react';
import { missingContent } from '../shared/brief.mjs';
import { COPY_ENGINE_VERSION } from '../shared/copy.mjs';
import { choicesComplete } from '../shared/choices.mjs';
import { downloadFile } from './report';
import { renderPost, renderAsset, storyboardHtml } from './submission';

export const FORMATS = [{ id: 'static', name: 'Instagram Image Post', output: 'One image and caption in a complete Instagram post mockup.' }, { id: 'video', name: 'Instagram Video Storyboard', output: 'A timed script with one image for every scene.' }];
export const lengthFor = project => project.captionLength === 'Other' ? project.customLength : project.captionLength;
export const assetsComplete = (project, media) => Boolean(project.content?.frames?.length) && project.content.frames.every((frame, index) => {
  const asset = project.assets?.[index];
  return asset?.id && media[asset.id] && (asset.source === 'Student-uploaded' || (asset.prompt === frame.visual && (asset.visualStyle || 'editorial') === (project.visualStyle || 'editorial')));
});
const busyText = loading => loading === 'image' ? 'Creating image...' : loading === 'content' ? 'Writing content...' : loading === 'upload' ? 'Saving image...' : '';
function Field({ label, children }) { const id = useId(); return <div className="field"><label htmlFor={id}>{label}</label>{cloneElement(children, { id })}</div>; }
function Upload({ label, onFile, disabled }) { return <label className="upload-control"><ImageIcon size={16} /><span>{label}</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={event => { if (event.target.files[0]) onFile(event.target.files[0]); event.target.value = ''; }} /></label>; }
export function profileFor(project) {
  const client = project.lockedBrief?.client || 'Your organization';
  return { name: project.profileName || client, username: project.username || client.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 30), location: project.location || '', timestamp: project.timestamp || 'Just now' };
}
export function AssetPreview({ project, media, index = 0 }) {
  const asset = project.assets?.[index];
  const frame = project.content?.frames[index];
  const src = media[asset?.id];
  return <div className={`instagram-image ${project.deliverable === 'video' ? 'portrait' : ''}`}>
    {src ? <img src={src} alt={asset?.altText || frame?.altText || project.content?.altText || 'Storyboard image'} /> : <div className="image-placeholder"><ImageIcon size={32} /><p>{project.deliverable === 'video' ? 'Generate or upload a scene image' : 'Generate or upload your post image'}</p></div>}
    {src && frame?.onScreen && <div className={`image-overlay overlay-${project.overlayPosition || 'bottom'}`}>{frame.onScreen}</div>}
  </div>;
}
export function InstagramPost({ project, media }) {
  const profile = profileFor(project);
  const [expanded, setExpanded] = useState(false);
  const caption = project.content?.primaryText || 'Your caption will appear here.';
  const shortened = caption.length > 180 && !expanded;
  return <div className="ig-preview-wrap"><p className="concept-label">Student concept · Instagram mockup</p><article className="instagram-post" aria-label="Instagram post preview">
    <header className="ig-post-header"><div className="ig-avatar">{media[project.avatarId] ? <img src={media[project.avatarId]} alt={`${profile.name} profile`} /> : profile.name.slice(0, 1)}</div><div><b>{profile.username}</b><small>{profile.location || profile.name}</small></div><MoreHorizontal aria-label="Post options (preview)" /></header>
    <AssetPreview project={project} media={media} />
    <div className="ig-actions" aria-label="Instagram action icons (visual preview)"><Heart /><MessageCircle /><Send /><Bookmark className="ig-save" /></div>
    <div className="ig-copy">
      {project.showEngagement && <b className="ig-likes">{project.likes || '0'} likes · simulated</b>}
      <p><b>{profile.username}</b>{' '}{shortened ? caption.slice(0, 180) + '...' : caption}</p>
      {caption.length > 180 && <button className="ig-more" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'more'}</button>}
      {project.showEngagement && project.exampleComment && <p className="ig-comment"><b>example_viewer</b> {project.exampleComment} <small>(simulated comment)</small></p>}
      <small className="ig-time">{profile.timestamp}</small>
      <div className="ig-comment-placeholder">Add a comment... <span>Post</span></div>
    </div>
  </article></div>;
}
function Frames({ project, media }) {
  return <div className="storyboard-grid">{project.content?.frames.map((frame, index) => <article className="storyboard-card" key={index}>
    <AssetPreview project={project} media={media} index={index} />
    <div><span className="eyebrow">Scene {index + 1} · {frame.time}</span><h4>{frame.title}</h4><dl><dt>Action</dt><dd>{frame.visual}</dd><dt>Script / voiceover</dt><dd>{frame.copy}</dd><dt>On-screen text</dt><dd>{frame.onScreen || 'None'}</dd><dt>Sound</dt><dd>{frame.audio || 'No additional sound'}</dd></dl></div>
  </article>)}</div>;
}
export function InstagramStudio({ project, media, loading, onSettings, onContent, onChoose, onRationale, onGenerate, onGenerateImage, onUpload, onApprove, onEditAsset }) {
  const { content: draft, deliverable } = project;
  // A failed AI repair may retain incomplete comparisons; keep the editor usable.
  const content = draft && { ...draft, captionVariants: Array.isArray(draft.captionVariants) && draft.captionVariants.every(option => typeof option?.label === 'string' && typeof option?.primaryText === 'string') ? draft.captionVariants : undefined, imageConcepts: Array.isArray(draft.imageConcepts) && draft.imageConcepts.every(option => typeof option?.label === 'string' && typeof option?.visual === 'string' && typeof option?.altText === 'string' && typeof option?.onScreen === 'string') ? draft.imageConcepts : undefined };
  const video = deliverable === 'video';
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const missing = missingContent(content, deliverable);
  const issues = content?.copyReview?.issues || [];
  const ready = assetsComplete(project, media);
  const chosen = choicesComplete(content, video);
  const imageChoicePending = !video && content?.choicesRequired && content.selectedConcept == null;
  const customMissing = (project.captionLength === 'Other' && (!/^\d{1,3}$/.test(project.customLength || '') || Number(project.customLength) < 10 || Number(project.customLength) > 500)) || (video && project.duration === 'Other' && (!Number.isFinite(Number(project.customDuration)) || Number(project.customDuration) < 5 || Number(project.customDuration) > 180));
  const updateFrame = (index, field, value) => onContent({ ...content, frames: content.frames.map((frame, i) => i === index ? { ...frame, [field]: value } : frame) });
  const download = async mockup => { setDownloadError(''); setDownloading(true); try { const blob = mockup ? await renderPost(project, media) : await renderAsset(project, media, 0); downloadFile(mockup ? 'instagram-post-mockup.png' : 'instagram-image.png', blob, 'image/png'); } catch (error) { setDownloadError(error.message); } finally { setDownloading(false); } };
  return <div className="instagram-studio">
    <section className="panel studio-settings"><p className="eyebrow">Step 3</p><h3>Instagram Content Studio</h3><p className="support-text">Turn your approved story into an image post or an illustrated video production plan.</p>
      {content && content.copyEngineVersion !== COPY_ENGINE_VERSION && <p className="copy-review" role="status">A newer story-focused generator is available. Your current draft is preserved. Generate a replacement draft to use the updated storytelling and image direction.</p>}
      <div className="deliverables">{FORMATS.map(format => <button key={format.id} aria-pressed={deliverable === format.id} className={deliverable === format.id ? 'chosen' : ''} disabled={Boolean(loading)} onClick={() => onSettings('deliverable', format.id)}>{format.id === 'video' ? <Film /> : <ImageIcon />}<b>{format.name}</b><small>{format.output}</small></button>)}</div>
      <div className="instagram-settings-grid">
        <Field label="Creative energy"><select value={project.creativeEnergy || 'Lively and relatable'} onChange={e => onSettings('creativeEnergy', e.target.value)}><option>Lively and relatable</option><option>Playful and witty</option><option>Warm and personal</option><option>Bold and surprising</option><option>Reflective and intimate</option></select></Field>
        <Field label="Image treatment"><select value={project.visualStyle || 'editorial'} onChange={e => onSettings('visualStyle', e.target.value)}><option value="candid">Candid photo concept</option><option value="graphic">Bold graphic illustration</option><option value="editorial">Contemporary editorial illustration</option></select></Field>
        <Field label="Caption length"><select value={project.captionLength} onChange={e => onSettings('captionLength', e.target.value)}><option value="50">Up to 50 words</option><option value="100">Up to 100 words</option><option value="150">Up to 150 words</option><option>Other</option></select></Field>
        {project.captionLength === 'Other' && <Field label="Custom caption word limit"><input type="number" min="10" max="500" value={project.customLength} onChange={e => onSettings('customLength', e.target.value)} /></Field>}
        {video && <><Field label="Video duration"><select value={project.duration} onChange={e => onSettings('duration', e.target.value)}>{['15', '30', '60'].map(n => <option value={n} key={n}>{n} seconds</option>)}<option>Other</option></select></Field>{project.duration === 'Other' && <Field label="Custom duration in seconds"><input type="number" min="5" max="180" value={project.customDuration} onChange={e => onSettings('customDuration', e.target.value)} /></Field>}<Field label="Storyboard scenes"><select value={project.sceneCount} onChange={e => onSettings('sceneCount', e.target.value)}>{['3', '4', '5', '6'].map(n => <option key={n}>{n}</option>)}</select></Field></>}
      </div>
      <div className="toggle-row"><label><input type="checkbox" checked={project.hashtags} onChange={e => onSettings('hashtags', e.target.checked)} /> Include hashtags</label><label><input type="checkbox" checked={project.emojis} onChange={e => onSettings('emojis', e.target.checked)} /> Include emojis</label></div>
      {customMissing && <p role="status">Enter a caption word limit, and a duration between 5 and 180 seconds for video.</p>}
      <button className="primary-button" disabled={Boolean(loading) || customMissing} onClick={onGenerate}><Sparkles size={18} />{loading === 'content' ? 'Creating draft...' : content ? 'Generate replacement draft' : 'Generate Instagram draft'}</button>
    </section>
    {content ? <div className="instagram-editor-layout"><section className="panel instagram-editor"><h3>{video ? 'Edit your script + storyboard' : 'Edit your image + caption'}</h3><p className="micro-note">Edit the draft in your own words. Your changes remain in the learning record.</p>
      {content.captionVariants?.length === 3 && <fieldset className="scene-editor story-choices"><legend>Compare three caption treatments</legend><p className="support-text">Same approved story, different ways in. Which opening makes this audience curious, and which treatment carries the moment best? Choose one, then sharpen it below.</p>{content.captionVariants.map((option, index) => <label className="story-choice" key={index}><span><input type="radio" name="caption-treatment" checked={content.selectedCaption === index} disabled={Boolean(loading)} onChange={() => onChoose('caption', index)} /> <b>{index + 1}. {option.label}</b></span><span className="choice-copy">{option.primaryText}</span></label>)}</fieldset>}
      {!video && content.imageConcepts?.length === 2 && <fieldset className="scene-editor story-choices"><legend>Compare two image concepts</legend><p className="support-text">These are directions, not generated images. Choose the moment and viewpoint that best complement your caption, then generate or upload the image.</p>{content.imageConcepts.map((option, index) => <label className="story-choice" key={index}><span><input type="radio" name="image-concept" checked={content.selectedConcept === index} disabled={Boolean(loading)} onChange={() => onChoose('concept', index)} /> <b>{index + 1}. {option.label}</b></span><span className="choice-copy">{option.visual}</span><small>Text overlay: {option.onScreen || 'None'}</small></label>)}</fieldset>}
      {content.captionVariants && <Field label="Why these choices? (optional)"><textarea rows="3" value={content.choiceRationale || ''} placeholder="Which detail or opening will connect with your audience? What would you change?" onChange={e => onRationale(e.target.value)} /></Field>}
      {content.choicesRequired && !chosen && <p className="copy-review" role="status">Choose a caption treatment{video ? '' : ' and an image concept'} before approval. If the comparison options are incomplete, generate a replacement draft. The preview shows a working draft, not an automatic selection.</p>}
      <Field label="Caption"><textarea rows="7" value={content.primaryText} onChange={e => onContent({ ...content, primaryText: e.target.value })} /></Field><small>{content.primaryText.trim().split(/\s+/).filter(Boolean).length} words · {content.primaryText.length} characters</small>
      <details className="profile-settings"><summary>Make this story worth stopping for</summary><p className="support-text">Read the opening aloud. Does it create curiosity or recognition? Point to the moment and what changes. Does the image show that moment, and does its overlay add something the caption does not? If another organization could use this unchanged, revise it. AI checks are suggestions, not a grade.</p></details>
      {Array.isArray(content.creativeNotes) && content.creativeNotes.filter(note => typeof note === 'string').map(note => <p className="micro-note" key={note}>{note}</p>)}
      <Field label="Headline"><input value={content.headline} onChange={e => onContent({ ...content, headline: e.target.value })} /></Field><Field label="Call to action"><input value={content.cta} onChange={e => onContent({ ...content, cta: e.target.value })} /></Field>
      {!video && <details className="profile-settings" open><summary>Instagram profile and post details</summary><Field label="Organization display name"><input value={project.profileName || ''} placeholder={project.lockedBrief.client} onChange={e => onSettings('profileName', e.target.value)} /></Field><Field label="Instagram username"><input maxLength="30" value={project.username || ''} placeholder={profileFor(project).username} onChange={e => onSettings('username', e.target.value.replace(/[^a-zA-Z0-9_.]/g, ''))} /></Field><Upload label="Upload organization profile image" disabled={Boolean(loading)} onFile={file => onUpload('avatar', file)} /><Field label="Location (optional)"><input value={project.location || ''} onChange={e => onSettings('location', e.target.value)} /></Field><Field label="Timestamp label"><input value={project.timestamp} onChange={e => onSettings('timestamp', e.target.value)} /></Field><label className="toggle-row"><input type="checkbox" checked={project.showEngagement} onChange={e => onSettings('showEngagement', e.target.checked)} /> Show simulated engagement</label>{project.showEngagement && <><Field label="Simulated likes"><input type="number" min="0" max="999999" value={project.likes} onChange={e => onSettings('likes', e.target.value)} /></Field><Field label="Example comment (optional)"><input value={project.exampleComment} onChange={e => onSettings('exampleComment', e.target.value)} /></Field></>}</details>}
      {content.frames.map((frame, index) => { const asset = project.assets?.[index]; const stale = asset?.source === 'AI-generated' && (asset.prompt !== frame.visual || (asset.visualStyle || 'editorial') !== (project.visualStyle || 'editorial')); return <fieldset className="scene-editor" key={index}><legend>{video ? `Scene ${index + 1}: ${frame.title}` : 'Post image'}</legend>
        {video && <><Field label={`Scene ${index + 1} title`}><input value={frame.title} onChange={e => updateFrame(index, 'title', e.target.value)} /></Field><Field label={`Scene ${index + 1} time range`}><input value={frame.time || ''} placeholder="0–5 seconds" onChange={e => updateFrame(index, 'time', e.target.value)} /></Field><Field label={`Scene ${index + 1} script / voiceover`}><textarea rows="3" value={frame.copy} onChange={e => updateFrame(index, 'copy', e.target.value)} /></Field><Field label={`Scene ${index + 1} sound`}><input value={frame.audio || ''} onChange={e => updateFrame(index, 'audio', e.target.value)} /></Field></>}
        <Field label={video ? `Scene ${index + 1} visual action` : 'Image direction'}><textarea rows="3" value={frame.visual} onChange={e => updateFrame(index, 'visual', e.target.value)} /></Field><Field label={video ? `Scene ${index + 1} on-screen text (optional)` : 'Image text overlay (optional)'}><input maxLength="140" value={frame.onScreen || ''} onChange={e => updateFrame(index, 'onScreen', e.target.value)} /></Field>
        <Field label={video ? `Scene ${index + 1} image alt text` : 'Image alt text'}><textarea rows="2" value={asset?.altText || frame.altText || content.altText} onChange={e => onEditAsset(index, 'altText', e.target.value)} /></Field>
        <div className="asset-buttons"><button className="secondary-button" disabled={Boolean(loading) || imageChoicePending} onClick={() => onGenerateImage(index)}><Sparkles size={16} />{asset?.id ? 'Regenerate' : 'Generate'} {video ? `scene ${index + 1} image` : 'post image'}</button><Upload label={video ? `Upload scene ${index + 1} image` : 'Upload post image'} disabled={Boolean(loading) || imageChoicePending} onFile={file => onUpload(index, file)} /></div>
        {stale && <p role="status">The image direction or treatment changed. Regenerate this image or upload a replacement before approval.</p>}{asset?.source && <small>{asset.source} image</small>}
      </fieldset>; })}
      <Field label="Text overlay position"><select value={project.overlayPosition} onChange={e => onSettings('overlayPosition', e.target.value)}><option value="bottom">Bottom</option><option value="top">Top</option><option value="center">Center</option></select></Field>
      <p className="support-text">{content.ethicalCheck}</p>{issues.length > 0 && <div className="error-banner"><b>Needs a human edit before approval</b><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
      {!ready && <p className="micro-note">Add an image for {video ? 'every scene' : 'your post'} before approval. {busyText(loading)}</p>}
      <button className="primary-button full" disabled={Boolean(loading) || !ready || !chosen || missing.length > 0 || issues.length > 0} onClick={onApprove}>Approve and review submission <ArrowRight size={18} /></button>
    </section><aside className="panel instagram-live-preview"><p className="eyebrow">Live preview</p><h3>{video ? 'Illustrated storyboard' : 'Your Instagram post'}</h3>{video ? <><p className="micro-note">Production plan with scene images and script. This does not export a finished video.</p><Frames project={project} media={media} /></> : <><InstagramPost project={project} media={media} /><div className="asset-buttons"><button className="secondary-button" disabled={!ready || downloading} onClick={() => download(true)}>Download post mockup</button><button className="secondary-button" disabled={!ready || downloading} onClick={() => download(false)}>Download clean image</button></div></>}{downloadError && <p role="alert">{downloadError}</p>}</aside></div> : <section className="panel package-empty"><ImageIcon size={32} /><h3>Your story is ready for Instagram.</h3><p>Choose an output and generate a draft. Then edit the copy and add your images.</p></section>}
  </div>;
}
export function InstagramReview({ project, media, loading, summary, onReflection, onGenerate, onDownload, onLocalDownload, onOutput, onSubmission, onLocalSubmission }) {
  const video = project.deliverable === 'video';
  const [exportError, setExportError] = useState('');
  const downloadStoryboard = async () => { try { const html = await storyboardHtml(project, media); downloadFile('instagram-video-storyboard.html', html, 'text/html'); } catch (error) { setExportError(error.message); } };
  return <div className="package-layout"><section className="panel package-header"><div><p className="eyebrow">Step 4</p><h3>Review + Submit</h3><p>{video ? 'Instagram video script + illustrated storyboard' : 'Instagram image + caption'}</p></div><button className="secondary-button" disabled={Boolean(loading)} onClick={onGenerate}>{project.production ? 'Refresh final guidance' : 'Build final guidance'}</button></section>
    {video ? <section className="panel"><h3>Approved video storyboard</h3><Frames project={project} media={media} /><p className="approved-copy">{project.content.primaryText}</p></section> : <section className="panel review-post"><InstagramPost project={project} media={media} /></section>}
    <section className="panel"><h3>Student reflection</h3><p className="support-text">Explain what you changed and why the final choices serve the audience and brief.</p><Field label="Your reflection (optional)"><textarea rows="4" value={project.reflection} onChange={e => onReflection(e.target.value)} /></Field><details><summary>View recorded learning evidence</summary>{summary.statements.map((statement, index) => <p className="support-text" key={index}>{statement}</p>)}</details></section>
    {project.production && <section className="panel"><h3>Final accessibility and production guidance</h3><p className="support-text">{project.production.summary}</p><p className="support-text">{project.production.accessibility}</p><p>{project.content.ethicalCheck}</p></section>}
    <section className="panel submission-panel"><h3>Download your Blackboard submission</h3><p>The ZIP includes your creative assets, {video ? 'illustrated storyboard and script' : 'full Instagram mockup and caption'}, alt text, and learning record. Upload the ZIP to Blackboard.</p><div className="package-actions"><button className="primary-button" disabled={Boolean(loading) || !assetsComplete(project, media)} onClick={onSubmission}><Download size={18} />Download verified submission ZIP</button><button className="secondary-button" disabled={Boolean(loading) || !assetsComplete(project, media)} onClick={onLocalSubmission}>Download local submission ZIP</button></div><p className="micro-note">Verified exports include a tool-issued receipt. A local export is available when verification is unavailable and is clearly marked unverified.</p><div className="asset-buttons"><button className="secondary-button" disabled={Boolean(loading)} onClick={onOutput}>Download caption + script</button>{video && <button className="secondary-button" onClick={downloadStoryboard}>Download illustrated storyboard</button>}<button className="secondary-button" disabled={Boolean(loading)} onClick={onDownload}>Download verified learning record</button><button className="secondary-button" disabled={Boolean(loading)} onClick={onLocalDownload}>Download local learning record</button></div>{exportError && <p role="alert">{exportError}</p>}</section>
  </div>;
}
