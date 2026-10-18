import { cloneElement, useEffect, useId, useMemo, useRef, useState } from "react";
import briefSet from './prebuilt-creative-briefs.json';
import { BRIEF_FIELDS, getField, briefText, missingBrief, missingContent } from '../shared/brief.mjs';
import { useProject, addEvent, edit, learningSummary } from './project';
import { downloadFile, makeReport, outputText, reportHtml, recordDigest } from './report';
import Verification from './Verification';
import { fetchJSON, requestFailure } from './request';
import { COPY_ENGINE_VERSION, copyIssues } from '../shared/copy.mjs';
import { presentationIssues } from '../shared/creative.mjs';
import { InstagramStudio, InstagramReview, FORMATS, lengthFor, assetsComplete } from './InstagramStudio';
import { readMedia, saveMedia, prepareUpload } from './media';
import { submissionZip } from './submission';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardCheck,
  Download,
  Film,
  HeartHandshake,
  LayoutGrid,
  MessageSquareQuote,
  PenLine,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

const STAGES = [
  { id: 1, name: "Creative Brief", icon: Target },
  { id: 2, name: "Story Workshop", icon: BookOpen },
  { id: 3, name: "Instagram Content Studio", icon: PenLine },
  { id: 4, name: "Review + Submit", icon: LayoutGrid },
];

const ARC_STRUCTURES = {
  threeAct: {
    label: "Three-Act",
    description: "A human moment moves from situation to pressure to meaningful resolution.",
    fields: ["Setup", "Tension", "Resolution"],
  },
  storybrand: {
    label: "StoryBrand",
    description: "A character faces a problem, finds guidance, and chooses an action.",
    fields: ["Character", "Problem", "Guidance", "Change"],
  },
  freytag: {
    label: "Freytag",
    description: "Useful when the social story builds through a clear dramatic turning point.",
    fields: ["Exposition", "Rising Action", "Turning Point", "Resolution"],
  },
};

const DELIVERABLES = FORMATS;

function App() {
  const { project, update, reset, saveError } = useProject();
  const { stage, brief, lockedBrief, readBrief, arc, arcDrafts, feedback, storyLocked, deliverable, platform, content, contentLocked, production, history, reflection } = project;
  const [media, setMedia] = useState({});
  useEffect(() => { let active = true; readMedia(project.projectId).then(value => { if (active) setMedia(value); }).catch(() => setError('Saved images could not be opened. Upload or generate them again.')); return () => { active = false; }; }, [project.projectId]);
  useEffect(() => { if (stage > 1) document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [stage]);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [retryAction, setRetryAction] = useState('');
  const [verificationWarning, setVerificationWarning] = useState('');
  const busy = useRef(false);
  const activeRequest = useRef(null);
  const [confirmation, setConfirmation] = useState(null);
  const askConfirm = message => new Promise(resolve => setConfirmation({ message, resolve }));
  const answerConfirm = accepted => { confirmation?.resolve(accepted); setConfirmation(null); };
  const cancelPending = (message = 'Request canceled. Your work is safe; try again when ready.') => {
    const pending = activeRequest.current;
    if (!pending) return;
    activeRequest.current = null;
    pending.controller.abort(requestFailure(message, 'AbortError'));
    busy.current = false; setLoading(''); setError(message); setRetryAction(pending.name);
    record('Request canceled', pending.name);
  };
  const setStage = stage => { if (stage !== project.stage) { cancelPending(); setError(''); setRetryAction(''); } update({ stage }); };
  const arcText = useMemo(() => ARC_STRUCTURES[arc].fields.map(field => `${field}: ${arcDrafts[field] || ''}`).join('\n'), [arc, arcDrafts]);
  const record = (action, detail, extra = {}) => update(previous => addEvent(previous, action, detail, extra));
  const invalidateStory = previous => ({ ...previous, feedback: null, storyLocked: false, content: null, contentLocked: false, production: null, assets: [] });
  const clearDownstream = previous => ({ ...invalidateStory(previous), arcDrafts: {}, lockedBrief: null, readBrief: false, stage: 1 });
  const revealBrief = () => window.requestAnimationFrame(() => {
    const review = document.getElementById('brief-review');
    review?.focus({ preventScroll: true });
    review?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const confirmReplace = async () => {
    const baseline = brief?.aiGenerated ? [...project.aiOutputs].reverse().find(item => item.action === 'brief')?.output : briefSet.briefs.find(item => item.id === brief?.id);
    const edited = brief && baseline && JSON.stringify(brief) !== JSON.stringify(baseline);
    const dependentWork = lockedBrief || Object.values(arcDrafts).some(value => value.trim()) || content || production;
    return (!edited && !dependentWork) || await askConfirm('Replace this brief? This clears your brief edits and any story, content and package work. The learning log will keep the previous decisions.');
  };
  const chooseBrief = async id => {
    const selected = briefSet.briefs.find(item => item.id === id);
    if (!selected) return;
    if (brief?.id === id && !brief.aiGenerated) { revealBrief(); return; }
    if (!await confirmReplace()) return;
    cancelPending();
    update(previous => addEvent({ ...clearDownstream(previous), brief: structuredClone(selected) }, 'Prebuilt brief selected', `${selected.client} · fictional classroom scenario`));
    revealBrief();
  };
  const openBriefChooser = () => {
    setStage(1);
    window.requestAnimationFrame(() => {
      const chooser = document.getElementById('brief-chooser');
      chooser?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      chooser?.querySelector('button')?.focus({ preventScroll: true });
    });
  };
  const updateBrief = (field, value) => {
    cancelPending('Request canceled because the brief changed. Try again with the updated brief.');
    update(previous => {
      const next = structuredClone(previous.brief);
      const before = getField(next, field);
      if (field.startsWith('thinkFeelDo.')) next.thinkFeelDo[field.split('.')[1]] = value;
      else next[field] = value;
      return { ...edit(previous, `Brief: ${BRIEF_FIELDS[field]}`, before, value), brief: next, readBrief: false };
    });
  };
  const ensureSession = async signal => {
    if (project.session) return project.session;
    const result = await fetchJSON('/api/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start' }) }, { signal, timeout: 5000 });
    if (!result.session) throw new Error('Verification session could not start.');
    update({ session: result.session });
    return result.session;
  };
  const requestCoach = async (action, payload, signal) => {
    let session;
    try { session = await ensureSession(signal); }
    catch (failure) {
      if (signal.aborted) throw signal.reason || requestFailure('Request canceled.', 'AbortError');
      setVerificationWarning('Server verification is unavailable. You can keep working and download a local record. AI calls without receipts cannot be verified later.');
    }
    const result = await fetchJSON('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload, session }) }, { signal, timeout: action === 'image' ? 55000 : action === 'content' ? 65000 : 40000 });
    if (signal.aborted) throw signal.reason || requestFailure('Request canceled.', 'AbortError');
    const { _receipt, _cleanup, _receiptWarning, ...output } = result;
    if (_receiptWarning) setVerificationWarning(_receiptWarning);
    update(previous => {
      let next = addEvent(previous, 'AI response received', action, { aiAction: action });
      const { dataUrl: _image, ...recordedOutput } = output;
      next = { ...next, aiOutputs: [...next.aiOutputs, { action, at: new Date().toISOString(), copyEngineVersion: output.copyEngineVersion || null, input: payload, output: recordedOutput }], receipts: _receipt ? [...next.receipts, _receipt] : next.receipts };
      return _cleanup ? addEvent(next, 'Duplicate sections removed', `${_cleanup} repeated sections removed after one regeneration.`) : next;
    });
    return output;
  };
  const run = async (name, operation) => {
    if (busy.current) return;
    const controller = new AbortController();
    activeRequest.current = { name, controller };
    busy.current = true; setLoading(name); setError(''); setRetryAction('');
    const deadline = setTimeout(() => controller.abort(requestFailure('The request took too long. Your work is safe; try again.', 'TimeoutError')), name === 'image' ? 60000 : name === 'content' ? 70000 : 45000);
    let onAbort;
    const canceled = new Promise((_, reject) => {
      onAbort = () => reject(controller.signal.reason || requestFailure('Request canceled.', 'AbortError'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    try { await Promise.race([operation(controller.signal), canceled]); }
    catch (failure) {
      if (activeRequest.current?.controller !== controller) return;
      setError(failure?.message || 'The request failed. Your work is safe; try again.');
      setRetryAction(name); record('Request failed', name);
    } finally {
      clearTimeout(deadline); controller.signal.removeEventListener('abort', onAbort);
      if (activeRequest.current?.controller === controller) { activeRequest.current = null; busy.current = false; setLoading(''); }
    }
  };
  const generateBrief = async () => {
    if (busy.current) return;
    if (!await confirmReplace()) return;
    cancelPending();
    run('brief', async signal => {
      const result = await requestCoach('brief', { previousClient: brief?.client || '', excludedIndustries: briefSet.briefs.map(item => item.cardIndustry) }, signal);
      if (missingBrief(result).length) throw new Error('The generated brief is incomplete. Try again.');
      update(previous => addEvent({ ...clearDownstream(previous), brief: result }, 'AI brief loaded', `${result.client} · AI-generated fictional scenario`));
      revealBrief();
    });
  };
  const lockBrief = () => {
    if (!readBrief || !brief || missingBrief(brief).length) return;
    cancelPending();
    const baseline = brief.aiGenerated ? [...project.aiOutputs].reverse().find(item => item.action === 'brief')?.output : briefSet.briefs.find(item => item.id === brief.id);
    const changed = JSON.stringify(brief) !== JSON.stringify(baseline);
    update(previous => addEvent({ ...previous, lockedBrief: structuredClone(brief), stage: 2 }, 'Brief locked', `${brief.aiGenerated ? 'AI-generated' : 'Prebuilt'} brief ${changed ? 'edited before approval' : 'accepted unchanged'}; student checked that they read it.`, { unchanged: !changed, aiGenerated: Boolean(brief.aiGenerated) }));
  };
  const unlockBrief = async () => {
    if (!await askConfirm('Unlock the creative brief? This clears downstream story, content and package work. Your prior decisions remain in the learning record.')) return;
    cancelPending();
    update(previous => addEvent({ ...clearDownstream(previous), brief: structuredClone(lockedBrief) }, 'Brief unlocked', 'Returned to Step 1; downstream work cleared.'));
    revealBrief();
  };
  const getStoryFeedback = () => run('feedback', async signal => {
    const result = await requestCoach('feedback', { brief: briefText(lockedBrief), briefFields: lockedBrief, arc: ARC_STRUCTURES[arc].label, draft: arcText }, signal);
    update(previous => addEvent({ ...previous, feedback: result, storyLocked: false, content: null, contentLocked: false, production: null, assets: [] }, 'Story feedback received', `Brief: ${result.alignment.status}; story: ${result.storyReadiness.status}.`, { assessment: result }));
  });
  const updateStoryDraft = (field, value) => { cancelPending('Request canceled because the story changed. Try again with the updated story.'); update(previous => ({ ...invalidateStory(edit(previous, `Story: ${field}`, previous.arcDrafts[field] || '', value)), arcDrafts: { ...previous.arcDrafts, [field]: value } })); };
  const lockStory = () => {
    if (!feedback || feedback.alignment.status !== 'Aligned' || feedback.storyReadiness.status !== 'Ready for content') return;
    cancelPending();
    update(previous => addEvent({ ...previous, storyLocked: true, stage: 3 }, 'Story approved', 'Student reviewed the story and coaching before creating Instagram content.'));
  };
  const createContent = async () => {
    if (busy.current) return;
    if (content && !await askConfirm('Generate a replacement content draft? Current content edits and the package will be replaced; the log retains your changes.')) return;
    run('content', async signal => {
      const result = await requestCoach('content', { brief: briefText(lockedBrief), briefFields: lockedBrief, story: arcText, storyFramework: arc, deliverable: DELIVERABLES.find(item => item.id === deliverable)?.name, platform: 'Instagram', creativeEnergy: project.creativeEnergy, visualStyle: project.visualStyle, length: lengthFor(project), duration: Number(project.duration === 'Other' ? project.customDuration : project.duration), sceneCount: Number(project.sceneCount), hashtags: project.hashtags, emojis: project.emojis }, signal);
      update({ content: result, contentLocked: false, production: null, assets: [] }); record('Content draft loaded', `Instagram ${deliverable}`);
    });
  };
  const updateContent = next => { cancelPending('Request canceled because the content changed. Try again with the updated content.'); update(previous => {
    let changed = previous;
    for (const field of Object.keys(next)) if (JSON.stringify(next[field]) !== JSON.stringify(previous.content?.[field])) changed = edit(changed, `Content: ${field}`, previous.content?.[field], next[field]);
    const reviewPayload = { briefFields: previous.lockedBrief, brief: briefText(previous.lockedBrief), story: arcText, deliverable: DELIVERABLES.find(item => item.id === previous.deliverable)?.name, length: lengthFor(previous), duration: Number(previous.duration === 'Other' ? previous.customDuration : previous.duration), sceneCount: Number(previous.sceneCount), hashtags: previous.hashtags, emojis: previous.emojis };
    const reviewed = { ...next, copyReview: { version: next.copyEngineVersion || COPY_ENGINE_VERSION, issues: [...copyIssues(next, reviewPayload), ...presentationIssues(next, reviewPayload)] } };
    return { ...changed, content: reviewed, contentLocked: false, production: null };
  }); };
  const lockContent = () => {
    if (missingContent(content, deliverable).length || content?.copyReview?.issues?.length || !assetsComplete(project, media)) return;
    cancelPending();
    const baseline = [...project.aiOutputs].reverse().find(item => item.action === 'content')?.output;
    const unchanged = JSON.stringify(content) === JSON.stringify(baseline);
    update(previous => addEvent({ ...previous, contentLocked: true, stage: 4 }, 'Content approved', unchanged ? 'AI content accepted unchanged.' : 'AI content edited before approval.', { unchanged }));
  };
  const createPackage = () => run('production', async signal => {
    const result = await requestCoach('production', { brief: briefText(lockedBrief), briefFields: lockedBrief, story: arcText, deliverable: DELIVERABLES.find(item => item.id === deliverable)?.name, content, platform: 'Instagram', duration: Number(project.duration === 'Other' ? project.customDuration : project.duration) }, signal);
    update({ production: result }); record('Production package created', 'Exact copy, frame / shot directions, audio and accessibility handoff.');
  });
  const updateSettings = async (field, value) => {
    const resets = ['deliverable', 'captionLength', 'customLength', 'duration', 'customDuration', 'sceneCount', 'hashtags', 'emojis', 'creativeEnergy'].includes(field);
    if (content && resets && !await askConfirm('Change content settings? This clears the current draft and images. Your revisions remain in the learning record.')) return;
    cancelPending();
    update(previous => ({ ...edit(previous, `Instagram settings: ${field}`, previous[field], value), [field]: value, ...(field === 'visualStyle' ? { contentLocked: false, production: null } : {}), ...(resets ? { content: null, assets: [], contentLocked: false, production: null } : {}) }));
  };
  const editAsset = (index, field, value) => {
    cancelPending();
    update(previous => ({ ...edit(previous, `Image ${index + 1}: ${field}`, previous.assets?.[index]?.[field] || '', value), assets: Object.assign([...(previous.assets || [])], { [index]: { ...(previous.assets?.[index] || {}), [field]: value } }), contentLocked: false, production: null }));
  };
  const storeImage = async (index, dataUrl, source, signal) => {
    const id = crypto.randomUUID();
    await saveMedia(project.projectId, id, dataUrl);
    if (signal?.aborted) return;
    setMedia(previous => ({ ...previous, [id]: dataUrl }));
    update(previous => {
      const assets = [...(previous.assets || [])];
      assets[index] = { ...assets[index], id, source, visualStyle: previous.visualStyle || 'editorial', altText: assets[index]?.altText || previous.content?.frames[index]?.altText || previous.content?.altText || '', prompt: previous.content?.frames[index]?.visual || '' };
      return addEvent({ ...previous, assets, contentLocked: false, production: null }, 'Image added', `${source} image for ${deliverable === 'video' ? 'scene' : 'post'} ${index + 1}.`);
    });
  };
  const generateImage = index => run('image', async signal => {
    const frame = content.frames[index];
    const result = await requestCoach('image', { prompt: frame.visual, visualStyle: project.visualStyle, context: arcText, brief: briefText(lockedBrief), frame: index + 1, aspectRatio: deliverable === 'video' ? '9:16' : '1:1' }, signal);
    if (signal.aborted) return;
    await storeImage(index, result.dataUrl, 'AI-generated', signal);
  });
  const uploadImage = (index, file) => run('upload', async signal => {
    const image = await prepareUpload(file);
    if (signal.aborted) return;
    if (index === 'avatar') {
      const id = crypto.randomUUID(); await saveMedia(project.projectId, id, image);
      if (signal.aborted) return;
      setMedia(previous => ({ ...previous, [id]: image })); update({ avatarId: id }); record('Profile image uploaded', 'Organization profile image selected.');
    } else await storeImage(index, image, 'Student-uploaded', signal);
  });
  const downloadSubmission = (verified = true) => run('submission', async signal => {
    const snapshot = addEvent(project, 'Submission export requested', verified ? 'Requested a verified Blackboard package.' : 'Requested a local, unverified Blackboard package.');
    const report = makeReport(snapshot);
    let receipt;
    if (verified) {
      const session = await ensureSession(signal);
      receipt = await fetchJSON('/api/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'export', session, reportHash: await recordDigest(report), receipts: report.receipts, browserEventCount: report.history.length }) }, { signal, timeout: 20000 });
    }
    const html = await reportHtml(report, receipt, window.location.origin);
    const zip = await submissionZip(project, media, html);
    if (signal.aborted) return;
    downloadFile('storylab-blackboard-submission.zip', zip, 'application/zip'); record('Submission downloaded', verified ? 'Creative assets and verified learning record.' : 'Creative assets and local, unverified learning record.');
  });
  const resetProject = async () => {
    if (!await askConfirm('Start a new project? This removes the current project and its learning log from this browser. Download your work first if you need it.')) return;
    cancelPending(); reset(); setError(''); setRetryAction(''); setVerificationWarning(''); openBriefChooser();
  };
  const downloadOutput = () => { record('Content downloaded', 'Production handoff text file.'); downloadFile('storylab-content.txt', outputText(project), 'text/plain;charset=utf-8'); };
  const downloadReport = (verified = true) => run(verified ? 'export' : 'localExport', async signal => {
    const snapshot = addEvent(project, 'Learning record export requested', verified ? 'Requested server-issued verification receipt.' : 'Local unverified record.');
    const report = makeReport(snapshot);
    let receipt;
    if (verified) {
      const session = await ensureSession(signal);
      receipt = await fetchJSON('/api/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'export', session, reportHash: await recordDigest(report), receipts: report.receipts, browserEventCount: report.history.length }) }, { signal, timeout: 20000 });
    }
    const html = await reportHtml(report, receipt, window.location.origin);
    if (signal.aborted) throw signal.reason || requestFailure('Request canceled.', 'AbortError');
    record('Learning record downloaded', receipt ? `Verified receipt issued: ${receipt.id}` : 'Local unverified record.');
    downloadFile('storylab-learning-record.html', html, 'text/html;charset=utf-8');
  });
  const retry = () => ({ brief: generateBrief, feedback: getStoryFeedback, content: createContent, production: createPackage, export: downloadReport, localExport: () => downloadReport(false) }[retryAction]?.());
  const canRetry = retryAction === 'brief' ? stage === 1 : retryAction === 'feedback' ? stage === 2 && ARC_STRUCTURES[arc].fields.every(field => arcDrafts[field]?.trim()) : retryAction === 'content' ? stage === 3 && storyLocked : retryAction === 'production' ? stage === 4 && contentLocked : ['export', 'localExport'].includes(retryAction);
  const canVisit = (target) =>
    target === 1 ||
    (target === 2 && Boolean(lockedBrief)) ||
    (target === 3 && storyLocked) ||
    (target === 4 && contentLocked);

  return (
    <div className="app-shell">
      <Header onReset={resetProject} />
      <main>
        <Hero onStart={() => { if (!busy.current) setStage(stage); }} onSample={openBriefChooser} busy={Boolean(loading)} />
        <section className="studio" id="studio">
          <div className="studio-heading">
            <div>
              <p className="eyebrow">Student Workspace</p>
              <h2>Build one story. Sharpen every decision.</h2>
            </div>

          </div>
          <p className="workspace-intro">Your drafts and timestamped edits are saved in this browser. Verified downloads send only record hashes and call metadata to the tool. No names are collected. Anyone with the verification link can view its receipt.</p>
          <button className="ghost-button" onClick={() => downloadReport(false)} disabled={Boolean(loading)}>Save a local copy of work and learning record</button>
          {saveError && <div className="error-banner" role="alert">{saveError}</div>}
          {verificationWarning && <div className="error-banner" role="status">{verificationWarning}</div>}
          {loading && <div className="request-status" role="status" aria-live="polite" aria-label="Request progress"><Spinner /><div><b>{({ brief: 'Generating your creative brief…', feedback: 'Reviewing your story…', content: 'Generating your content draft…', image: 'Creating your image…', upload: 'Saving your image…', submission: 'Preparing your submission…', production: 'Building your production package…', export: 'Preparing your verified record…', localExport: 'Preparing your local record…' })[loading]}</b><p>{saveError ? "Autosave is unavailable; keep this tab open." : "Your work is saved in this browser."} This request will stop within {loading === 'image' ? '60' : '45'} seconds.</p></div><button className="secondary-button" onClick={() => cancelPending()}>Cancel request</button></div>}
          {error && <div className="error-banner" id="request-error" role="alert">{error} <button className="secondary-button" disabled={Boolean(loading) || !canRetry} onClick={retry}>Try again</button></div>}
          <div className="workspace-controls">
          <StageNav stage={stage} canVisit={canVisit} onSelect={setStage} />

          {stage === 1 && (
            <BriefStage
              brief={brief}
              locked={Boolean(lockedBrief)}
              readBrief={readBrief}
              onRead={value => { update({ readBrief: value }); record('Brief read confirmation', value ? 'Checked' : 'Unchecked'); }}
              onUpdate={updateBrief}
              onChoose={chooseBrief}
              onOpenChooser={openBriefChooser}
              onGenerate={generateBrief}
              onLock={lockBrief}
              onUnlock={unlockBrief}
              loading={loading === 'brief'}
              pending={Boolean(loading)}
            />
          )}
          {stage > 1 && lockedBrief && <LockedBrief brief={lockedBrief} onUnlock={unlockBrief} />}
          {stage === 2 && (
            <StoryStage
              arc={arc}
              onArcChange={async nextArc => {
                if (nextArc === arc) return;
                if (Object.values(arcDrafts).some(value => value.trim()) && !await askConfirm('Change story arc? This clears the current story and downstream work; your changes remain in the learning record.')) return;
                cancelPending();
                update(previous => addEvent({ ...invalidateStory(previous), arc: nextArc, arcDrafts: {} }, 'Story arc selected', ARC_STRUCTURES[nextArc].label));
              }}
              drafts={arcDrafts}
              onDraftChange={updateStoryDraft}
              feedback={feedback}
              onFeedback={getStoryFeedback}
              onLock={lockStory}
              loading={loading}
            />
          )}
          {stage === 3 && <InstagramStudio project={project} media={media} loading={loading} onSettings={updateSettings} onContent={updateContent} onGenerate={createContent} onGenerateImage={generateImage} onUpload={uploadImage} onApprove={lockContent} onEditAsset={editAsset} />}
          {stage === 4 && <InstagramReview project={project} media={media} loading={loading} summary={learningSummary(project)} onReflection={value => { cancelPending(); update(previous => ({ ...edit(previous, 'Student reflection', previous.reflection, value), reflection: value })); }} onGenerate={createPackage} onDownload={() => downloadReport(true)} onLocalDownload={() => downloadReport(false)} onOutput={downloadOutput} onSubmission={() => downloadSubmission(true)} onLocalSubmission={() => downloadSubmission(false)} />}

          </div>
        </section>
        <Principles />
      </main>
      <Footer />
      {confirmation && <Confirmation message={confirmation.message} onAnswer={answerConfirm} />}
    </div>
  );
}

function Confirmation({ message, onAnswer }) {
  const modal = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    modal.current?.querySelector('button')?.focus();
    return () => previousFocus?.isConnected && previousFocus.focus();
  }, []);
  const onKey = event => {
    if (event.key === 'Escape') { event.preventDefault(); onAnswer(false); }
    if (event.key === 'Tab') {
      const buttons = [...modal.current.querySelectorAll('button')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  return <div className="confirmation-overlay"><section ref={modal} className="panel confirmation-panel" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message" onKeyDown={onKey}><h2 id="confirmation-title">Confirm this change</h2><p id="confirmation-message">{message}</p><div className="confirmation-actions"><button className="secondary-button" onClick={() => onAnswer(false)}>Keep my work</button><button className="primary-button" onClick={() => onAnswer(true)}>Confirm change</button></div></section></div>;
}

function Header({ onReset }) {
  return (
    <header className="site-header">
      <a className="brand" href="#">
        <span className="brand-mark">S</span>
        <span>StoryLab Pro<small className="endorsement">By Dr Imran</small></span>
      </a>
      <nav className="header-links">
        <a href="#studio">Studio</a>
        <a href="#approach">Approach</a>
        <button className="ghost-button" onClick={onReset}>New project</button>
      </nav>
    </header>
  );
}

function Hero({ onStart, onSample, busy }) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">AI-guided storytelling for AdPR students</p>
        <h1>Turn strategy into stories people can feel.</h1>
        <p className="hero-description">
          Shape social posts and ads for brands and nonprofits with focused AI coaching on human
          connection, audience responsibility and platform-ready execution.
        </p>
        <div className="hero-actions">
          <a href="#studio" className="primary-button" onClick={onStart}>
            Start a project <ArrowRight size={18} />
          </a>
          <button className="secondary-button" onClick={onSample} disabled={busy}>
            <Sparkles size={17} /> Load a prebuilt brief
          </button>
        </div>
        <div className="trust-row">
          <span><ShieldCheck size={17} /> Student remains the author</span>
          <span><HeartHandshake size={17} /> Ethics built into feedback</span>
        </div>
      </div>
      <div className="hero-product">
        <div className="preview-toolbar">
          <div className="dots"><i /><i /><i /></div>
          <span>Story Studio / Feedback</span>
        </div>
        <div className="preview-body">
          <div className="preview-sidebar">
            {["Brief", "Story", "Content", "Package"].map((item, index) => (
              <div className={index === 1 ? "active" : ""} key={item}>{item}</div>
            ))}
          </div>
          <div className="preview-canvas">
            <span className="tiny-label">Connection</span>
            <p className="quote">"What specific moment lets your audience understand why this matters?"</p>
            <div className="feedback-cards">
              <div>
                <MessageSquareQuote size={17} />
                <b>Craft</b>
                <small>Add one lived detail.</small>
              </div>
              <div>
                <ShieldCheck size={17} />
                <b>Responsibility</b>
                <small>Protect agency.</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StageNav({ stage, canVisit, onSelect }) {
  return (
    <div className="stage-nav">
      {STAGES.map(({ id, name, icon: Icon }) => (
        <button
          key={id}
          disabled={!canVisit(id)}
          className={stage === id ? "current" : id < stage ? "complete" : ""}
          onClick={() => onSelect(id)}
        >
          <Icon size={18} />
          <span><small>Step {id}</small>{name}</span>
          {id < stage ? <Check size={17} /> : <ChevronRight size={17} />}
        </button>
      ))}
    </div>
  );
}

function LockedBrief({ brief, onUnlock }) {
  return <section className="panel locked-brief"><details><summary>Locked creative brief · {brief.client} · {brief.aiGenerated ? 'AI-generated' : 'Prebuilt'}</summary><pre>{briefText(brief)}</pre></details><button className="ghost-button" onClick={onUnlock}>Unlock to edit</button></section>;
}
function BriefStage({ brief, locked, readBrief, onRead, onUpdate, onChoose, onOpenChooser, onGenerate, onLock, onUnlock, loading, pending }) {
  const missing = brief ? missingBrief(brief) : [];
  return <div className="brief-workspace">
    <div className="workspace-grid">
      <section className="panel">
        <PanelTitle icon={BookOpen} eyebrow="Step 1 · Choose" title="Use a prebuilt brief" description="Start with one of six fictional advertising assignments." />
        <button className="primary-button full" onClick={onOpenChooser}>Compare six briefs <ArrowRight size={18} /></button>
        <p className="micro-note">Compare the objective and single message before choosing.</p>
      </section>
      <section className="panel">
        <PanelTitle icon={Sparkles} eyebrow="Step 1 · Generate" title="Generate with AI" description="Create a complete fictional advertising assignment in one click." />
        <button className="primary-button full" onClick={onGenerate} disabled={pending}>{loading ? <Spinner /> : <Sparkles size={18} />}{loading ? 'Preparing brief…' : 'Generate a brief'}</button><button className="secondary-button full" onClick={onGenerate} disabled={pending || !brief?.aiGenerated}>Regenerate a brief</button>
        <p className="micro-note" role="status">{loading ? "Working with AI. Keep this page open; generation may take up to a minute." : "The complete brief will open below. Review its facts and constraints before developing your story."}</p>
      </section>
    </div>
    <section className="panel" id="brief-chooser">
        <PanelTitle icon={BookOpen} eyebrow="Step 1 · Choose" title="Choose a prebuilt brief" description="Compare the industry, objective and single message before choosing a fictional client." />
        <div className="brief-gallery" aria-label="Prebuilt creative briefs">{briefSet.briefs.map(item => <button type="button" className={`brief-card ${brief?.id === item.id && !brief.aiGenerated ? 'selected' : ''}`} aria-pressed={brief?.id === item.id && !brief.aiGenerated} aria-label={`Choose ${item.client}`} key={item.id} onClick={() => onChoose(item.id)}><span className="brief-card-meta">{item.cardIndustry} · {item.cardObjective}</span><strong>{item.client}</strong><span><b>Objective</b>{item.objective}</span><span><b>Single message</b>{item.singleMessage}</span>{brief?.id === item.id && !brief.aiGenerated && <small>Selected brief</small>}</button>)}</div>
        <p className="micro-note">Six classroom scenarios · brief set {briefSet.version}</p>
    </section>
    <section className="panel" id="brief-review" tabIndex={-1} aria-label="Selected brief details">
      <PanelTitle icon={ClipboardCheck} eyebrow={brief?.aiGenerated ? 'AI-generated fictional brief' : 'Prebuilt fictional brief'} title={brief ? `Review: ${brief.client}` : 'Read, review and lock'} description="All client details are supplied classroom scenario facts, not verified real-world evidence. Keep claims within the brief." />
      {brief ? <>
        <div className="form-grid">{Object.entries(BRIEF_FIELDS).map(([key, label]) => <Field key={key} label={label} wide={!['cardIndustry', 'cardObjective', 'client', 'tone'].includes(key)}><textarea rows={key === 'background' || key === 'constraints' ? 3 : 2} value={getField(brief, key) || ''} disabled={locked} onChange={event => onUpdate(key, event.target.value)} /></Field>)}</div>
        {locked ? <button className="secondary-button" onClick={onUnlock}>Unlock to edit</button> : <>
          <label className="read-check"><input type="checkbox" checked={readBrief} onChange={event => onRead(event.target.checked)} />I have read this brief.</label>
          <p className="micro-note">{missing.length ? `Complete: ${missing.join(', ')}.` : !readBrief ? 'Confirm that you have read the brief to continue.' : 'You may approve this brief unchanged or after editing.'}</p>
          <button className="primary-button" disabled={!readBrief || missing.length > 0 || loading} onClick={onLock}>Lock creative brief <ArrowRight size={18} /></button>
        </>}
      </> : <EmptyState text="Select a prebuilt client or generate a brief to begin." />}
    </section>
  </div>;
}

function StoryStage({ arc, onArcChange, drafts, onDraftChange, feedback, onFeedback, onLock, loading }) {
  const structure = ARC_STRUCTURES[arc];
  const missingDraft = structure.fields.filter(field => !(drafts[field] || '').trim());
  const hasDraft = missingDraft.length === 0;
  const isAligned = feedback?.alignment?.status === "Aligned";
  const isStoryReady = feedback?.storyReadiness?.status === "Ready for content";
  const canApproveStory = isAligned && isStoryReady;
  return (
    <div className="story-layout">
      <section className="panel">
        <PanelTitle icon={BookOpen} eyebrow="Step 2" title="Develop your story" description="Center a person, a pressure and a change. Coaching stays focused and concise." />
        <div className="arc-selector">
          {Object.entries(ARC_STRUCTURES).map(([key, option]) => (
            <button key={key} aria-pressed={arc === key} className={arc === key ? "chosen" : ""} onClick={() => onArcChange(key)}>
              <b>{option.label}</b><small>{option.description}</small>
            </button>
          ))}
        </div>
        <p className="structure-status" role="status">Selected structure: <b>{structure.label}</b> · {structure.fields.join(" → ")}</p>
        <div className="arc-fields">
          {structure.fields.map((field) => (
            <Field label={field} key={field}>
              <textarea
                rows="3"
                value={drafts[field] || ""}
                onChange={(event) => onDraftChange(field, event.target.value)}
                placeholder={`Draft the ${field.toLowerCase()} in your own words...`}
              />
            </Field>
          ))}
        </div>
        {missingDraft.length > 0 && <p className="micro-note">Complete: {missingDraft.join(', ')}.</p>}
        <button className="primary-button full" disabled={!hasDraft || Boolean(loading)} onClick={onFeedback}>
          {loading === "feedback" ? <Spinner /> : <MessageSquareQuote size={18} />}
          {loading === "feedback" ? "Reviewing your story…" : feedback ? "Refresh focused feedback" : "Get focused feedback"}
        </button>
      </section>
      <aside className="story-aside">
        <section className="panel compact-panel">
          <PanelTitle icon={HeartHandshake} eyebrow="Coach" title="Feedback grounded in your brief" />
          {feedback ? (
            <div className="coach-results">
              <AlignmentResult alignment={feedback.alignment} />
              <ReadinessResult readiness={feedback.storyReadiness} />
              <FeedbackLine title="Human focus" text={feedback.connection} />
              {(feedback.beats || []).length > 0 && (
                <div className="beat-coaching">
                  <b>Sharpen each beat</b>
                  {(feedback.beats || []).map((beat, index) => (
                    <article key={`${beat.stage}-${index}`}>
                      <span>{beat.stage}</span>
                      <p>{beat.sharpen}</p>
                    </article>
                  ))}
                </div>
              )}
              <FeedbackLine title="Responsibility" text={feedback.responsibility} />
              <div className="questions">
                <b>Revision questions</b>
                <ol>
                  {(feedback.questions || []).map((question) => <li key={question}>{question}</li>)}
                </ol>
              </div>
              <div className="rubric-chips">
                {(feedback.rubric || []).map((item) => (
                  <span key={item.label}><b>{item.label}</b>{item.level}</span>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState text="Feedback will check strategy, human connection and each story beat without rewriting your work." />
          )}
        </section>
        {feedback && !canApproveStory && (
          <section className="panel compact-panel revision-gate">
            <PanelTitle
              icon={RefreshCw}
              eyebrow="Revise first"
              title={isAligned ? "Build a story people can enter" : "Reconnect the story to the brief"}
              description="Continue to content after the draft serves the strategy through a human story."
            />
            <p>
              {isAligned
                ? feedback.storyReadiness?.priority || "Center one person's experience, pressure and meaningful change."
                : feedback.alignment?.missingLink || "Show how this story supports the organization, audience and objective in the locked brief."}
            </p>
          </section>
        )}
        {canApproveStory && <button className="primary-button full" disabled={Boolean(loading)} onClick={onLock}>Approve story and continue <ArrowRight size={18} /></button>}
      </aside>
    </div>
  );
}

function Principles() {
  return (
    <section className="principles" id="approach">
      <p className="eyebrow">The StoryLab approach</p>
      <h2>AI feedback that sharpens, without taking over.</h2>
      <div className="principle-grid">
        <article><HeartHandshake size={24} /><h3>Human connection</h3><p>A focal person, emotional clarity, concrete detail and meaningful change guide each story review.</p></article>
        <article><PenLine size={24} /><h3>Student authorship</h3><p>Students revise, select and approve the creative decisions that become final work.</p></article>
        <article><ShieldCheck size={24} /><h3>Responsible persuasion</h3><p>Feedback checks dignity, accuracy, agency and appropriate calls to action.</p></article>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <span className="brand"><span className="brand-mark">S</span> StoryLab Pro</span>
      <p>AI-guided social storytelling studio for advertising and public relations education.</p>
    </footer>
  );
}

function PanelTitle({ icon: Icon, eyebrow, title, description }) {
  return (
    <div className="panel-title">
      <span className="panel-icon"><Icon size={19} /></span>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
        {description && <p className="description">{description}</p>}
      </div>
    </div>
  );
}

function Field({ label, children, wide }) {
  const id = useId();
  return <div className={`field ${wide ? 'wide' : ''}`}><label htmlFor={id}>{label}</label>{cloneElement(children, { id })}</div>;
}

function AlignmentResult({ alignment }) {
  const status = alignment?.status || "Needs connection";
  const tone = status === "Aligned" ? "aligned" : status === "Off brief" ? "off-brief" : "needs-connection";
  return (
    <div className={`alignment-result ${tone}`}>
      <div>
        <b>Brief alignment</b>
        <span>{status}</span>
      </div>
      <p>{alignment?.summary || "The story must clearly connect to the locked brief before creating content."}</p>
      {alignment?.missingLink && <small><b>Reconnect by:</b> {alignment.missingLink}</small>}
    </div>
  );
}

function ReadinessResult({ readiness }) {
  const status = readiness?.status || "Revise first";
  const tone = status === "Ready for content" ? "ready" : "revise";
  return (
    <div className={`readiness-result ${tone}`}>
      <div>
        <b>Story connection</b>
        <span>{status}</span>
      </div>
      <p>{readiness?.summary || "A connecting story needs a focal person, meaningful pressure and change."}</p>
      {readiness?.priority && <small><b>Priority:</b> {readiness.priority}</small>}
    </div>
  );
}

function FeedbackLine({ title, text }) {
  return (
    <div className="feedback-line">
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="empty-state">
      <Sparkles size={22} />
      <p>{text}</p>
    </div>
  );
}

function Spinner() {
  return <RefreshCw className="spinner" size={18} />;
}

export default function StoryLabRouter() {
  const match = window.location.pathname.match(/^\/verify\/([a-f0-9]{48})$/);
  return match ? <Verification id={match[1]} /> : <App />;
}
