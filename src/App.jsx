import { cloneElement, useId, useMemo, useRef, useState } from "react";
import briefSet from './prebuilt-creative-briefs.json';
import { BRIEF_FIELDS, getField, briefText, missingBrief, missingContent } from '../shared/brief.mjs';
import { useProject, addEvent, edit, learningSummary } from './project';
import { downloadFile, makeReport, outputText, reportHtml, recordDigest } from './report';
import Verification from './Verification';
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
  { id: 2, name: "Story Studio", icon: BookOpen },
  { id: 3, name: "Content Studio", icon: PenLine },
  { id: 4, name: "Final Package", icon: LayoutGrid },
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

const DELIVERABLES = [
  { id: "static", name: "Static Post", output: "Caption, visual direction, CTA and alt text" },
  { id: "carousel", name: "Carousel", output: "Card sequence, caption and CTA" },
  { id: "video", name: "Short Video", output: "Script, scenes and captioning notes" },
  { id: "paid", name: "Paid Ad", output: "Primary text, headline, CTA and claim check" },
];

const HOOK_TACTICS = [
  { id: "recommended", name: "Best fit", description: "Let the coach choose for this campaign." },
  { id: "confession", name: "Confession", description: "A candid mistake or changed belief." },
  { id: "bold-claim", name: "Bold claim", description: "A supportable statement to prove." },
  { id: "relatability", name: "Relatability", description: "Specific language that signals this is for me." },
  { id: "contrast", name: "Contrast", description: "Old way versus a meaningful alternative." },
  { id: "curiosity", name: "Curiosity", description: "Open a truthful question worth staying for." },
];

function App() {
  const { project, update, reset, saveError } = useProject();
  const { stage, brief, lockedBrief, readBrief, arc, arcDrafts, feedback, hookOptions, selectedHook, selectedHookPlan, hookTactic, storyLocked, deliverable, platform, content, contentLocked, production, history, reflection } = project;
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [retryAction, setRetryAction] = useState('');
  const [verificationWarning, setVerificationWarning] = useState('');
  const busy = useRef(false);
  const setStage = stage => update({ stage });
  const arcText = useMemo(() => ARC_STRUCTURES[arc].fields.map(field => `${field}: ${arcDrafts[field] || ''}`).join('\n'), [arc, arcDrafts]);
  const record = (action, detail, extra = {}) => update(previous => addEvent(previous, action, detail, extra));
  const invalidateStory = previous => ({ ...previous, feedback: null, hookOptions: [], selectedHook: '', selectedHookPlan: null, storyLocked: false, content: null, contentLocked: false, production: null });
  const clearDownstream = previous => ({ ...invalidateStory(previous), arcDrafts: {}, lockedBrief: null, readBrief: false, stage: 1 });
  const confirmReplace = () => (!brief && !lockedBrief) || window.confirm('Replace this brief? This clears story, hook, content and package work. The learning log will keep the previous decisions.');
  const chooseBrief = id => {
    const selected = briefSet.briefs.find(item => item.id === id);
    if (!selected || !confirmReplace()) return;
    update(previous => addEvent({ ...clearDownstream(previous), brief: structuredClone(selected) }, 'Prebuilt brief selected', `${selected.client} · fictional classroom scenario`));
  };
  const fillSample = () => { chooseBrief(briefSet.briefs[0].id); document.getElementById('studio')?.scrollIntoView(); };
  const updateBrief = (field, value) => {
    update(previous => {
      const next = structuredClone(previous.brief);
      const before = getField(next, field);
      if (field.startsWith('thinkFeelDo.')) next.thinkFeelDo[field.split('.')[1]] = value;
      else next[field] = value;
      return { ...edit(previous, `Brief: ${BRIEF_FIELDS[field]}`, before, value), brief: next, readBrief: false };
    });
  };
  const ensureSession = async () => {
    if (project.session) return project.session;
    const response = await fetch('/api/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start' }), signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok || !result.session) throw new Error(result.error || 'Verification session could not start.');
    update({ session: result.session });
    return result.session;
  };
  const requestCoach = async (action, payload) => {
    let session;
    try { session = await ensureSession(); } catch { setVerificationWarning('Server verification is unavailable. You can keep working and download a local record. AI calls without receipts cannot be verified later.'); }
    const response = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload, session }), signal: AbortSignal.timeout(55000) });
    let result;
    try { result = await response.json(); } catch { throw new Error('The coach returned an unreadable response. Try again.'); }
    if (!response.ok) throw new Error(result.error || 'AI coaching request failed. Try again.');
    const { _receipt, _cleanup, _receiptWarning, ...output } = result;
    if (_receiptWarning) setVerificationWarning(_receiptWarning);
    update(previous => {
      let next = addEvent(previous, 'AI response received', action, { aiAction: action });
      next = { ...next, aiOutputs: [...next.aiOutputs, { action, at: new Date().toISOString(), input: payload, output }], receipts: _receipt ? [...next.receipts, _receipt] : next.receipts };
      return _cleanup ? addEvent(next, 'Duplicate sections removed', `${_cleanup} repeated sections removed after one regeneration.`) : next;
    });
    return output;
  };
  const run = async (name, operation) => {
    if (busy.current) return;
    busy.current = true; setLoading(name); setError(''); setRetryAction('');
    try { await operation(); }
    catch (failure) { setError(failure.name === 'TimeoutError' ? 'The request took too long. Your work is safe; try again.' : failure.message || 'The request failed. Your work is safe; try again.'); setRetryAction(name); record('Request failed', name); }
    finally { busy.current = false; setLoading(''); }
  };
  const generateBrief = () => {
    if (!confirmReplace()) return;
    run('brief', async () => {
      const result = await requestCoach('brief', { previousClient: brief?.client || '', excludedIndustries: briefSet.briefs.map(item => item.cardIndustry) });
      if (missingBrief(result).length) throw new Error('The generated brief is incomplete. Try again.');
      update(previous => addEvent({ ...clearDownstream(previous), brief: result }, 'AI brief loaded', `${result.client} · AI-generated fictional scenario`));
    });
  };
  const lockBrief = () => {
    if (!readBrief || !brief || missingBrief(brief).length) return;
    const baseline = brief.aiGenerated ? [...project.aiOutputs].reverse().find(item => item.action === 'brief')?.output : briefSet.briefs.find(item => item.id === brief.id);
    const changed = JSON.stringify(brief) !== JSON.stringify(baseline);
    update(previous => addEvent({ ...previous, lockedBrief: structuredClone(brief), stage: 2 }, 'Brief locked', `${brief.aiGenerated ? 'AI-generated' : 'Prebuilt'} brief ${changed ? 'edited before approval' : 'accepted unchanged'}; student checked that they read it.`, { unchanged: !changed, aiGenerated: Boolean(brief.aiGenerated) }));
  };
  const unlockBrief = () => {
    if (!window.confirm('Unlock the creative brief? This clears downstream story, hook, content and package work. Your prior decisions remain in the learning record.')) return;
    update(previous => addEvent({ ...clearDownstream(previous), brief: structuredClone(previous.lockedBrief) }, 'Brief unlocked', 'Returned to Step 1; downstream work cleared.'));
  };
  const getStoryFeedback = () => run('feedback', async () => {
    const result = await requestCoach('feedback', { brief: briefText(lockedBrief), arc: ARC_STRUCTURES[arc].label, draft: arcText });
    update(previous => addEvent({ ...previous, feedback: result, hookOptions: [], selectedHook: '', selectedHookPlan: null, storyLocked: false, content: null, contentLocked: false, production: null }, 'Story feedback received', `Brief: ${result.alignment.status}; story: ${result.storyReadiness.status}.`, { assessment: result }));
  });
  const updateStoryDraft = (field, value) => update(previous => ({ ...invalidateStory(edit(previous, `Story: ${field}`, previous.arcDrafts[field] || '', value)), arcDrafts: { ...previous.arcDrafts, [field]: value } }));
  const generateHooks = () => run('hooks', async () => {
    const result = await requestCoach('hooks', { brief: briefText(lockedBrief), arc: ARC_STRUCTURES[arc].label, draft: arcText, feedback, organizationType: lockedBrief.cardIndustry, objective: lockedBrief.objective, platform, placement: deliverable === 'paid' ? 'Paid ad' : 'Organic post', tactic: HOOK_TACTICS.find(item => item.id === hookTactic)?.name });
    update({ hookOptions: result.options });
    record('Hook options generated', 'Opening visual, text and audio options made available for selection.');
  });
  const lockStory = () => {
    if (!selectedHook.trim() || !feedback || feedback.alignment.status !== 'Aligned' || feedback.storyReadiness.status !== 'Ready for hooks') return;
    const original = hookOptions.find(option => option.visual === selectedHookPlan?.visual && option.onScreenText === selectedHookPlan?.onScreenText);
    const unchanged = original?.hook === selectedHook;
    update(previous => addEvent({ ...previous, storyLocked: true, stage: 3 }, 'Story and hook approved', `Student-authored story; AI hook ${unchanged ? 'accepted unchanged' : 'edited before approval'}.`, { unchanged }));
  };
  const createContent = () => {
    if (content && !window.confirm('Generate a replacement content draft? Current content edits and the package will be replaced; the log retains your changes.')) return;
    run('content', async () => {
      const result = await requestCoach('content', { brief: briefText(lockedBrief), story: arcText, hook: selectedHook, hookExecution: selectedHookPlan, deliverable: DELIVERABLES.find(item => item.id === deliverable)?.name, platform, placement: deliverable === 'paid' ? 'Paid ad' : 'Organic post' });
      update({ content: result, contentLocked: false, production: null }); record('Content draft loaded', `${platform} ${deliverable}`);
    });
  };
  const updateContent = next => update(previous => {
    let changed = previous;
    for (const field of Object.keys(next)) if (JSON.stringify(next[field]) !== JSON.stringify(previous.content?.[field])) changed = edit(changed, `Content: ${field}`, previous.content?.[field], next[field]);
    return { ...changed, content: next, contentLocked: false, production: null };
  });
  const lockContent = () => {
    if (missingContent(content, deliverable).length) return;
    const baseline = [...project.aiOutputs].reverse().find(item => item.action === 'content')?.output;
    const unchanged = JSON.stringify(content) === JSON.stringify(baseline);
    update(previous => addEvent({ ...previous, contentLocked: true, stage: 4 }, 'Content approved', unchanged ? 'AI content accepted unchanged.' : 'AI content edited before approval.', { unchanged }));
  };
  const createPackage = () => run('production', async () => {
    const result = await requestCoach('production', { brief: briefText(lockedBrief), story: arcText, hook: selectedHook, hookExecution: selectedHookPlan, deliverable: DELIVERABLES.find(item => item.id === deliverable)?.name, content, platform });
    update({ production: result }); record('Production package created', 'Exact copy, frame / shot directions, audio and accessibility handoff.');
  });
  const resetProject = () => {
    if (busy.current || !window.confirm('Start a new project? This removes the current project and its learning log from this browser. Download your work first if you need it.')) return;
    reset(); setError(''); setRetryAction(''); setVerificationWarning('');
  };
  const downloadOutput = () => { record('Content downloaded', 'Production handoff text file.'); downloadFile('storylab-content.txt', outputText(project), 'text/plain;charset=utf-8'); };
  const downloadReport = (verified = true) => run(verified ? 'export' : 'localExport', async () => {
    const snapshot = addEvent(project, 'Learning record export requested', verified ? 'Requested server-issued verification receipt.' : 'Local unverified record.');
    const report = makeReport(snapshot);
    let receipt;
    if (verified) {
      const session = await ensureSession();
      const response = await fetch('/api/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'export', session, reportHash: await recordDigest(report), receipts: report.receipts, browserEventCount: report.history.length }), signal: AbortSignal.timeout(20000) });
      receipt = await response.json();
      if (!response.ok) throw new Error(receipt.error || 'Verification failed. Try again or download the local record.');
    }
    const html = await reportHtml(report, receipt, window.location.origin);
    record('Learning record downloaded', receipt ? `Verified receipt issued: ${receipt.id}` : 'Local unverified record.');
    downloadFile('storylab-learning-record.html', html, 'text/html;charset=utf-8');
  });
  const retry = () => ({ brief: generateBrief, feedback: getStoryFeedback, hooks: generateHooks, content: createContent, production: createPackage, export: downloadReport, localExport: () => downloadReport(false) }[retryAction]?.());
  const canVisit = (target) =>
    target === 1 ||
    (target === 2 && Boolean(lockedBrief)) ||
    (target === 3 && storyLocked) ||
    (target === 4 && contentLocked);

  return (
    <div className="app-shell">
      <Header onReset={resetProject} busy={Boolean(loading)} />
      <main>
        <Hero onStart={() => { if (!busy.current) setStage(stage); }} onSample={fillSample} busy={Boolean(loading)} />
        <section className="studio" id="studio">
          <div className="studio-heading">
            <div>
              <p className="eyebrow">Student Workspace</p>
              <h2>Build one story. Sharpen every decision.</h2>
            </div>

          </div>
          <p className="micro-note">Your drafts and timestamped edits are saved in this browser. Verified downloads send only record hashes and call metadata to the tool. No names are collected. Anyone with the verification link can view its receipt.</p>
          <button className="ghost-button" onClick={() => downloadReport(false)} disabled={Boolean(loading)}>Save a local copy of work and learning record</button>
          {saveError && <div className="error-banner" role="alert">{saveError}</div>}
          {verificationWarning && <div className="error-banner" role="status">{verificationWarning}</div>}
          {error && <div className="error-banner" role="alert">{error} <button className="secondary-button" disabled={Boolean(loading)} onClick={retry}>Try again</button></div>}
          <fieldset className="workspace-controls" disabled={Boolean(loading)}>
          <StageNav stage={stage} canVisit={canVisit} onSelect={setStage} />

          {stage === 1 && (
            <BriefStage
              brief={brief}
              locked={Boolean(lockedBrief)}
              readBrief={readBrief}
              onRead={value => { update({ readBrief: value }); record('Brief read confirmation', value ? 'Checked' : 'Unchecked'); }}
              onUpdate={updateBrief}
              onChoose={chooseBrief}
              onGenerate={generateBrief}
              onLock={lockBrief}
              onUnlock={unlockBrief}
              loading={loading === 'brief'}
            />
          )}
          {stage > 1 && lockedBrief && <LockedBrief brief={lockedBrief} onUnlock={unlockBrief} />}
          {stage === 2 && (
            <StoryStage
              arc={arc}
              onArcChange={nextArc => {
                if (nextArc === arc) return;
                if (Object.values(arcDrafts).some(value => value.trim()) && !window.confirm('Change story arc? This clears the current story and downstream work; your changes remain in the learning record.')) return;
                update(previous => addEvent({ ...invalidateStory(previous), arc: nextArc, arcDrafts: {} }, 'Story arc selected', ARC_STRUCTURES[nextArc].label));
              }}
              drafts={arcDrafts}
              onDraftChange={updateStoryDraft}
              feedback={feedback}
              hookOptions={hookOptions}
              selectedHook={selectedHook}
              hookTactic={hookTactic}
              onHookTactic={nextTactic => {
                update({ hookTactic: nextTactic, hookOptions: [], selectedHook: '', selectedHookPlan: null, storyLocked: false, content: null, contentLocked: false, production: null });
                record('Hook tactic selected', nextTactic);
              }}
              onSelectHook={option => {
                update({ selectedHook: option.hook, selectedHookPlan: option, storyLocked: false, content: null, contentLocked: false, production: null });
                record('AI hook selected', option.hook);
              }}
              onHookChange={value => update(previous => ({ ...edit(previous, 'Selected hook', previous.selectedHook, value), selectedHook: value, selectedHookPlan: { ...previous.selectedHookPlan, hook: value }, storyLocked: false, content: null, contentLocked: false, production: null }))}
              onFeedback={getStoryFeedback}
              onHooks={generateHooks}
              onLock={lockStory}
              loading={loading}
            />
          )}
          {stage === 3 && (
            <ContentStage
              deliverable={deliverable}
              onDeliverable={nextDeliverable => {
                if (nextDeliverable === deliverable) return;
                if (content && !window.confirm('Change format? This clears the current content and package. Your changes remain in the learning record.')) return;
                update(previous => addEvent({ ...previous, deliverable: nextDeliverable, content: null, contentLocked: false, production: null }, 'Deliverable selected', nextDeliverable));
              }}
              onPlatform={nextPlatform => {
                if (content && !window.confirm('Change platform? This clears the current content and package.')) return;
                update(previous => addEvent({ ...previous, platform: nextPlatform, content: null, contentLocked: false, production: null }, 'Platform selected', nextPlatform));
              }}
              content={content}
              onContent={updateContent}
              onGenerate={createContent}
              onLock={lockContent}
              platform={platform}
              loading={loading === "content"}
            />
          )}
          {stage === 4 && (
            <PackageStage
              content={content}
              production={production}
              deliverable={deliverable}
              platform={platform}
              feedback={feedback}
              history={history}
              onGenerate={createPackage}
              summary={learningSummary(project)}
              reflection={reflection}
              onReflection={value => update(previous => ({ ...edit(previous, 'Student reflection', previous.reflection, value), reflection: value }))}
              onDownload={() => downloadReport(true)}
              onLocalDownload={() => downloadReport(false)}
              onOutput={downloadOutput}
              loading={Boolean(loading)}
            />
          )}
          </fieldset>
        </section>
        <Principles />
      </main>
      <Footer />
    </div>
  );
}

function Header({ onReset, busy }) {
  return (
    <header className="site-header">
      <a className="brand" href="#">
        <span className="brand-mark">S</span>
        <span>StoryLab Pro<small className="endorsement">By Dr Imran</small></span>
      </a>
      <nav className="header-links">
        <a href="#studio">Studio</a>
        <a href="#approach">Approach</a>
        <button className="ghost-button" disabled={busy} onClick={onReset}>New project</button>
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
function BriefStage({ brief, locked, readBrief, onRead, onUpdate, onChoose, onGenerate, onLock, onUnlock, loading }) {
  const missing = brief ? missingBrief(brief) : [];
  return <div className="brief-workspace">
    <div className="workspace-grid">
      <section className="panel">
        <PanelTitle icon={BookOpen} eyebrow="Step 1 · Choose" title="Choose a prebuilt brief" description="Select any fictional client. Its complete brief appears below." />
        <Field label="Prebuilt creative brief"><select value={briefSet.briefs.some(item => item.id === brief?.id) ? brief.id : ''} onChange={event => onChoose(event.target.value)}><option value="" disabled>Select a client…</option>{briefSet.briefs.map(item => <option value={item.id} key={item.id}>{item.client} · {item.cardIndustry} · {item.cardObjective}</option>)}</select></Field>
        <p className="micro-note">Six classroom scenarios · brief set {briefSet.version}</p>
      </section>
      <section className="panel">
        <PanelTitle icon={Sparkles} eyebrow="Step 1 · Generate" title="Generate with AI" description="Create a complete fictional advertising assignment in one click." />
        <button className="primary-button full" onClick={onGenerate} disabled={loading}>{loading ? <Spinner /> : <Sparkles size={18} />}{loading ? 'Preparing brief…' : brief?.aiGenerated ? 'Regenerate a brief' : 'Generate a brief'}</button>
        <p className="micro-note">Review its facts and constraints before developing your story.</p>
      </section>
    </div>
    <section className="panel">
      <PanelTitle icon={ClipboardCheck} eyebrow={brief?.aiGenerated ? 'AI-generated fictional brief' : 'Prebuilt fictional brief'} title="Read, review and lock" description="All client details are supplied classroom scenario facts, not verified real-world evidence. Keep claims within the brief." />
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

function StoryStage({ arc, onArcChange, drafts, onDraftChange, feedback, hookOptions, selectedHook, hookTactic, onHookTactic, onSelectHook, onHookChange, onFeedback, onHooks, onLock, loading }) {
  const structure = ARC_STRUCTURES[arc];
  const missingDraft = structure.fields.filter(field => !(drafts[field] || '').trim());
  const hasDraft = missingDraft.length === 0;
  const isAligned = feedback?.alignment?.status === "Aligned";
  const isStoryReady = feedback?.storyReadiness?.status === "Ready for hooks";
  const canDevelopHooks = isAligned && isStoryReady;
  return (
    <div className="story-layout">
      <section className="panel">
        <PanelTitle icon={BookOpen} eyebrow="Step 2" title="Develop your story" description="Center a person, a pressure and a change. Coaching stays focused and concise." />
        <div className="arc-selector">
          {Object.entries(ARC_STRUCTURES).map(([key, option]) => (
            <button key={key} className={arc === key ? "chosen" : ""} onClick={() => onArcChange(key)}>
              <b>{option.label}</b><small>{option.description}</small>
            </button>
          ))}
        </div>
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
        <button className="primary-button full" disabled={!hasDraft || loading === "feedback"} onClick={onFeedback}>
          {loading === "feedback" ? <Spinner /> : <MessageSquareQuote size={18} />}
          {feedback ? "Refresh focused feedback" : "Get focused feedback"}
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
        {feedback && !canDevelopHooks && (
          <section className="panel compact-panel revision-gate">
            <PanelTitle
              icon={RefreshCw}
              eyebrow="Revise first"
              title={isAligned ? "Build a story people can enter" : "Reconnect the story to the brief"}
              description="Hook development opens after the draft serves the strategy through a human story."
            />
            <p>
              {isAligned
                ? feedback.storyReadiness?.priority || "Center one person's experience, pressure and meaningful change."
                : feedback.alignment?.missingLink || "Show how this story supports the organization, audience and objective in the locked brief."}
            </p>
          </section>
        )}
        {canDevelopHooks && (
          <section className="panel compact-panel hook-panel">
            <PanelTitle icon={Sparkles} eyebrow="Hook workshop" title="Win the first 3 seconds" description="Stop the scroll, signal who this is for, and earn the next moment." />
            <div className="hook-modes">
              <span><b>Visual</b> See</span>
              <span><b>Text</b> Read</span>
              <span><b>Audio</b> Hear</span>
            </div>
            <Field label="Tactic">
              <select value={hookTactic} onChange={(event) => onHookTactic(event.target.value)}>
                {HOOK_TACTICS.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </Field>
            <p className="hook-tactic-note">{HOOK_TACTICS.find((option) => option.id === hookTactic)?.description}</p>
            {!hookOptions.length ? (
              <button className="secondary-button full" onClick={onHooks} disabled={loading === "hooks"}>
                {loading === "hooks" ? <Spinner /> : <Sparkles size={17} />}
                Create 3-second hooks
              </button>
            ) : (
              <>
                <div className="hook-options">
                  {hookOptions.map((option) => (
                    <button key={option.hook} className={selectedHook === option.hook ? "selected" : ""} onClick={() => onSelectHook(option)}>
                      <small className="hook-label">{option.tactic} / {option.trigger}</small>
                      <b>{option.hook}</b>
                      <span><strong>Visual</strong>{option.visual}</span>
                      <span><strong>Text</strong>{option.onScreenText}</span>
                      <span><strong>Audio</strong>{option.audio}</span>
                      <small>{option.whyItWorks}</small>
                      {option.claimCheck && <small className="hook-check">{option.claimCheck}</small>}
                    </button>
                  ))}
                </div>
                <Field label="Edit selected hook line">
                  <input value={selectedHook} onChange={(event) => onHookChange(event.target.value)} />
                </Field>
                {!selectedHook.trim() && <p className="micro-note">Select or write the opening hook line.</p>}
                <button className="primary-button full" disabled={!selectedHook.trim()} onClick={onLock}>
                  Approve story and hook <ArrowRight size={18} />
                </button>
              </>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}

function ContentStage({ deliverable, onDeliverable, onPlatform, content, onContent, onGenerate, onLock, platform, loading }) {
  const missing = missingContent(content, deliverable);
  return (
    <div className="workspace-grid content-workspace">
      <section className="panel">
        <PanelTitle icon={PenLine} eyebrow="Step 3" title="Create your post or ad" description={`Translate the approved story into an editable ${platform} deliverable.`} />
        <Field label="Publishing platform"><select value={platform} onChange={event => onPlatform(event.target.value)}>{['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'YouTube Shorts'].map(item => <option key={item}>{item}</option>)}</select></Field>
        <div className="deliverables">
          {DELIVERABLES.map((item) => (
            <button key={item.id} className={deliverable === item.id ? "chosen" : ""} onClick={() => onDeliverable(item.id)}>
              <b>{item.name}</b>
              <small>{item.output}</small>
            </button>
          ))}
        </div>
        <button className="primary-button full" onClick={onGenerate} disabled={loading}>
          {loading ? <Spinner /> : <Sparkles size={18} />}
          {content ? "Generate revised content" : "Generate content draft"}
        </button>
        <p className="micro-note">AI creates a starting draft. Students edit and approve the deliverable.</p>
      </section>
      <section className="panel output-panel">
        <PanelTitle icon={MessageSquareQuote} eyebrow="Editable deliverable" title={DELIVERABLES.find((item) => item.id === deliverable)?.name || "Content"} />
        {content ? (
          <div className="content-editor">
            <Field label="Primary text or caption">
              <textarea rows="9" value={content.primaryText || ""} onChange={(event) => onContent({ ...content, primaryText: event.target.value })} />
            </Field>
            <div className="two-cols">
              <Field label="Headline">
                <input value={content.headline || ""} onChange={(event) => onContent({ ...content, headline: event.target.value })} />
              </Field>
              <Field label="Call to action">
                <input value={content.cta || ""} onChange={(event) => onContent({ ...content, cta: event.target.value })} />
              </Field>
            </div>
            <Field label="Visual direction">
              <textarea rows="3" value={content.visualDirection || ""} onChange={(event) => onContent({ ...content, visualDirection: event.target.value })} />
            </Field>
            <Field label="Accessibility alt text">
              <textarea rows="2" value={content.altText || ""} onChange={(event) => onContent({ ...content, altText: event.target.value })} />
            </Field>
            {(content.frames || []).map((frame, index) => <div className="frame-editor" key={index}><h4>Card / beat {index + 1}</h4>{['title', 'copy', 'visual'].map(field => <Field label={field === 'copy' ? 'Exact copy / spoken lines' : field === 'visual' ? 'Visual direction' : 'Title'} key={field}><textarea rows="2" value={frame[field] || ''} onChange={event => onContent({ ...content, frames: content.frames.map((item, i) => i === index ? { ...item, [field]: event.target.value } : item) })} /></Field>)}</div>)}
            <Field label="Responsibility / claim check"><textarea rows="2" value={content.ethicalCheck || ''} onChange={event => onContent({ ...content, ethicalCheck: event.target.value })} /></Field>
            {missing.length > 0 && <p className="micro-note">Complete: {missing.join(', ')}.</p>}
            <button className="primary-button full" onClick={onLock} disabled={missing.length > 0 || loading}>
              Approve content and build package <ArrowRight size={18} />
            </button>
          </div>
        ) : (
          <EmptyState text="Choose a format and create the editable social content draft." />
        )}
      </section>
    </div>
  );
}

function PackageStage({ content, production, deliverable, platform, feedback, history, summary, reflection, onReflection, onGenerate, onDownload, onLocalDownload, onOutput, loading }) {
  const outputName = DELIVERABLES.find((item) => item.id === deliverable)?.name;
  return (
    <div className="package-layout">
      <section className="panel package-header">
        <div>
          <p className="eyebrow">Step 4</p>
          <h3>Final production package</h3>
          <p>{platform} {outputName}: execution guidance plus a compact educator record.</p>
        </div>
        <div className="package-actions">
          <button className="secondary-button" onClick={onGenerate} disabled={loading}>
            {loading ? <Spinner /> : <Film size={17} />}
            {production ? "Refresh package" : "Build package"}
          </button>
          {production && (
            <><button className="secondary-button" onClick={onOutput}><Download size={17} /> Download content</button><button className="primary-button" onClick={onDownload}><Download size={17} /> Download verified learning record</button><button className="ghost-button" onClick={onLocalDownload}>Download local record</button></>
          )}
        </div>
      </section>
      {production ? (
        <>
          <div className="production-grid">
            <section className="panel final-copy">
              <PanelTitle icon={MessageSquareQuote} eyebrow="Approved social content" title={content?.headline || outputName} />
              <p className="approved-copy">{content?.primaryText}</p>
              <div className="cta-row">{content?.cta}</div>
              <div className="alt-box"><b>Alt text</b>{content?.altText}</div>
            </section>
            <section className="panel">
              <PanelTitle icon={Film} eyebrow="Visual execution" title={deliverable === "video" ? "Storyboard" : "Frame plan"} />
              <div className="scene-list">
                {(production.scenes || []).map((scene, index) => (
                  <article key={`${scene.stage}-${index}`}>
                    <span>{scene.time}</span>
                    <h4>{scene.stage}</h4>
                    <p>{scene.visual}</p>
                    <small><b>On screen:</b> {scene.onScreen}</small><p><b>Audio:</b> {scene.audio}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
          <div className="production-grid lower">
            <section className="panel">
              <PanelTitle icon={ShieldCheck} eyebrow="Final check" title="Accessibility and responsibility" />
              <p className="support-text">{production.accessibility}</p>
              <p className="support-text">{content?.ethicalCheck}</p>
            </section>
            <section className="panel">
              <PanelTitle icon={ClipboardCheck} eyebrow="Educator snapshot" title="Evidence of revision" />
              {summary.statements.map((statement, index) => <p className="support-text" key={index}>{statement}</p>)}
              <Field label="Your reflection (optional): what did you change, and why does it serve the audience?"><textarea rows="4" value={reflection} onChange={event => onReflection(event.target.value)} /></Field>
              <p className="micro-note">The learning record includes timestamps, before-and-after edits, AI drafts and approvals. Open the downloaded document to review, share, or print / save as PDF. Its QR links to a tool-issued receipt; browser edits do not prove authorship.</p>
              <div className="history">
                {history.slice(-4).map((item) => (
                  <span key={item.id}><b>{item.action}</b>{item.detail}</span>
                ))}
              </div>
              {feedback?.rubric && (
                <div className="rubric-chips">
                  {feedback.rubric.map((item) => <span key={item.label}><b>{item.label}</b>{item.level}</span>)}
                </div>
              )}
            </section>
          </div>
        </>
      ) : (
        <section className="panel package-empty">
          <Film size={30} />
          <h3>Your approved content is ready for execution.</h3>
          <p>Build only the frame plan, accessibility guidance and learning record needed for this deliverable.</p>
        </section>
      )}
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
      <p>{alignment?.summary || "The story must clearly connect to the locked brief before hook development."}</p>
      {alignment?.missingLink && <small><b>Reconnect by:</b> {alignment.missingLink}</small>}
    </div>
  );
}

function ReadinessResult({ readiness }) {
  const status = readiness?.status || "Revise first";
  const tone = status === "Ready for hooks" ? "ready" : "revise";
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
