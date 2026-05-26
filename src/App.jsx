import { useMemo, useState } from "react";
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

const initialBrief = {
  organization: "",
  orgType: "Nonprofit",
  objective: "Build awareness",
  audience: "",
  platform: "Instagram",
  placement: "Organic post",
  desiredEmotion: "Hope grounded in action",
  tone: "Warm and credible",
  requiredMessage: "",
};

const sampleBrief = {
  organization: "Grand River Food Collective",
  orgType: "Nonprofit",
  objective: "Recruit student volunteers",
  audience: "College students who care about community but have limited time",
  platform: "Instagram",
  placement: "Organic post",
  desiredEmotion: "Belonging and useful action",
  tone: "Warm and credible",
  requiredMessage: "A two-hour shift helps stock choice-based grocery shelves.",
};

function App() {
  const [stage, setStage] = useState(1);
  const [briefInput, setBriefInput] = useState(initialBrief);
  const [briefText, setBriefText] = useState("");
  const [lockedBrief, setLockedBrief] = useState("");
  const [arc, setArc] = useState("threeAct");
  const [arcDrafts, setArcDrafts] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [hookOptions, setHookOptions] = useState([]);
  const [selectedHook, setSelectedHook] = useState("");
  const [storyLocked, setStoryLocked] = useState(false);
  const [deliverable, setDeliverable] = useState("static");
  const [content, setContent] = useState(null);
  const [contentLocked, setContentLocked] = useState(false);
  const [production, setProduction] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [exampleLoaded, setExampleLoaded] = useState(false);

  const arcText = useMemo(
    () =>
      ARC_STRUCTURES[arc].fields
        .map((field) => `${field}: ${arcDrafts[field] || ""}`)
        .join("\n"),
    [arc, arcDrafts],
  );

  const updateBrief = (field, value) => {
    setExampleLoaded(false);
    setBriefInput((previous) => ({ ...previous, [field]: value }));
  };
  const record = (action, detail) =>
    setHistory((previous) => [...previous, { action, detail, time: new Date().toLocaleTimeString() }]);

  const requestCoach = async (action, payload) => {
    const response = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "AI coaching request failed.");
    }
    return result;
  };

  const run = async (name, operation) => {
    setLoading(name);
    setError("");
    try {
      await operation();
    } catch (requestError) {
      setError(requestError.message || "Something went wrong. Please try again.");
    } finally {
      setLoading("");
    }
  };

  const fillSample = () => {
    resetProject();
    setExampleLoaded(true);
    setBriefInput(sampleBrief);
  };

  const generateBrief = () =>
    run("brief", async () => {
      const result = await requestCoach("brief", briefInput);
      setBriefText(result.brief);
      record("AI brief generated", `${briefInput.organization} creative strategy brief`);
    });

  const lockBrief = () => {
    setLockedBrief(briefText);
    setArcDrafts({});
    setFeedback(null);
    setHookOptions([]);
    setSelectedHook("");
    setStoryLocked(false);
    setContent(null);
    setContentLocked(false);
    setProduction(null);
    record("Brief locked", "Student reviewed and approved the editable brief");
    setStage(2);
  };

  const getStoryFeedback = () =>
    run("feedback", async () => {
      setHookOptions([]);
      setSelectedHook("");
      setStoryLocked(false);
      const result = await requestCoach("feedback", {
        brief: lockedBrief,
        arc: ARC_STRUCTURES[arc].label,
        draft: arcText,
      });
      setFeedback(result);
      record(
        "Story feedback requested",
        `${ARC_STRUCTURES[arc].label} draft; brief alignment: ${result.alignment?.status || "Review required"}; story connection: ${result.storyReadiness?.status || "Review required"}`,
      );
    });

  const updateStoryDraft = (field, value) => {
    setArcDrafts((previous) => ({ ...previous, [field]: value }));
    if (feedback || hookOptions.length || selectedHook) {
      setFeedback(null);
      setHookOptions([]);
      setSelectedHook("");
      setStoryLocked(false);
    }
  };

  const generateHooks = () =>
    run("hooks", async () => {
      const result = await requestCoach("hooks", {
        brief: lockedBrief,
        arc: ARC_STRUCTURES[arc].label,
        draft: arcText,
        feedback,
      });
      setHookOptions(result.options || []);
      record("Hook options requested", "Emotion-focused openings considered");
    });

  const lockStory = () => {
    setStoryLocked(true);
    record("Story and hook locked", selectedHook);
    setStage(3);
  };

  const createContent = () =>
    run("content", async () => {
      const result = await requestCoach("content", {
        brief: lockedBrief,
        story: arcText,
        hook: selectedHook,
        deliverable: DELIVERABLES.find((item) => item.id === deliverable)?.name,
        platform: briefInput.platform,
        placement: briefInput.placement,
      });
      setContent(result);
      setContentLocked(false);
      record("Social content generated", `${briefInput.platform} ${deliverable} draft`);
    });

  const lockContent = () => {
    setContentLocked(true);
    record("Social content approved", "Student approved editable post/ad content");
    setStage(4);
  };

  const createPackage = () =>
    run("production", async () => {
      const result = await requestCoach("production", {
        brief: lockedBrief,
        story: arcText,
        hook: selectedHook,
        deliverable: DELIVERABLES.find((item) => item.id === deliverable)?.name,
        content,
        platform: briefInput.platform,
      });
      setProduction(result);
      record("Final package created", "Production directions and educator summary generated");
    });

  const resetProject = () => {
    setStage(1);
    setBriefInput(initialBrief);
    setBriefText("");
    setLockedBrief("");
    setArc("threeAct");
    setArcDrafts({});
    setFeedback(null);
    setHookOptions([]);
    setSelectedHook("");
    setStoryLocked(false);
    setDeliverable("static");
    setContent(null);
    setContentLocked(false);
    setProduction(null);
    setHistory([]);
    setExampleLoaded(false);
    setError("");
  };

  const downloadReport = () => {
    const lines = [
      "STORYLAB PRO - EDUCATOR SNAPSHOT",
      "",
      `Organization: ${briefInput.organization}`,
      `Deliverable: ${briefInput.platform} ${DELIVERABLES.find((item) => item.id === deliverable)?.name}`,
      "",
      "CREATIVE BRIEF",
      lockedBrief,
      "",
      "STORY DRAFT",
      arcText,
      "",
      "SELECTED HOOK",
      selectedHook,
      "",
      "FINAL CONTENT",
      content?.primaryText || "",
      content?.headline ? `Headline: ${content.headline}` : "",
      content?.cta ? `CTA: ${content.cta}` : "",
      "",
      "COACHING SNAPSHOT",
      feedback?.alignment ? `Brief alignment: ${feedback.alignment.status} - ${feedback.alignment.summary}` : "",
      feedback?.storyReadiness ? `Story connection: ${feedback.storyReadiness.status} - ${feedback.storyReadiness.summary}` : "",
      feedback?.connection || "",
      feedback?.responsibility || "",
      "",
      "BEAT-BY-BEAT REVISION GUIDANCE",
      ...(feedback?.beats || []).map((beat) => `${beat.stage}: ${beat.sharpen}`),
      "",
      "REVISION EVIDENCE",
      ...history.map((entry) => `${entry.time} - ${entry.action}: ${entry.detail}`),
      "",
      "FINAL ETHICAL AND ACCESSIBILITY CHECK",
      content?.ethicalCheck || "",
      production?.accessibility || "",
    ];
    const file = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(briefInput.organization || "storylab").replaceAll(" ", "_")}_educator_snapshot.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const canVisit = (target) =>
    target === 1 ||
    (target === 2 && Boolean(lockedBrief)) ||
    (target === 3 && storyLocked) ||
    (target === 4 && contentLocked);

  return (
    <div className="app-shell">
      <Header onReset={resetProject} />
      <main>
        <Hero onStart={() => setStage(1)} onSample={fillSample} />
        <section className="studio" id="studio">
          <div className="studio-heading">
            <div>
              <p className="eyebrow">Student Workspace</p>
              <h2>Build one story. Sharpen every decision.</h2>
            </div>
            {exampleLoaded && <span className="sample-pill">Example inputs loaded - edit freely</span>}
          </div>
          <StageNav stage={stage} canVisit={canVisit} onSelect={setStage} />
          {error && <div className="error-banner">{error}</div>}
          {stage === 1 && (
            <BriefStage
              values={briefInput}
              onUpdate={updateBrief}
              briefText={briefText}
              onTextChange={setBriefText}
              onGenerate={generateBrief}
              onLock={lockBrief}
              loading={loading === "brief"}
            />
          )}
          {stage === 2 && (
            <StoryStage
              arc={arc}
              onArcChange={(nextArc) => {
                setArc(nextArc);
                setArcDrafts({});
                setFeedback(null);
                setHookOptions([]);
                setSelectedHook("");
              }}
              drafts={arcDrafts}
              onDraftChange={updateStoryDraft}
              feedback={feedback}
              hookOptions={hookOptions}
              selectedHook={selectedHook}
              onHookChange={setSelectedHook}
              onFeedback={getStoryFeedback}
              onHooks={generateHooks}
              onLock={lockStory}
              loading={loading}
            />
          )}
          {stage === 3 && (
            <ContentStage
              deliverable={deliverable}
              onDeliverable={(nextDeliverable) => {
                setDeliverable(nextDeliverable);
                setContent(null);
                setContentLocked(false);
                setProduction(null);
              }}
              content={content}
              onContent={setContent}
              onGenerate={createContent}
              onLock={lockContent}
              platform={briefInput.platform}
              loading={loading === "content"}
            />
          )}
          {stage === 4 && (
            <PackageStage
              content={content}
              production={production}
              deliverable={deliverable}
              platform={briefInput.platform}
              feedback={feedback}
              history={history}
              onGenerate={createPackage}
              onDownload={downloadReport}
              loading={loading === "production"}
            />
          )}
        </section>
        <Principles />
      </main>
      <Footer />
    </div>
  );
}

function Header({ onReset }) {
  return (
    <header className="site-header">
      <a className="brand" href="#">
        <span className="brand-mark">S</span>
        <span>StoryLab Pro</span>
      </a>
      <nav className="header-links">
        <a href="#studio">Studio</a>
        <a href="#approach">Approach</a>
        <button className="ghost-button" onClick={onReset}>New project</button>
      </nav>
    </header>
  );
}

function Hero({ onStart, onSample }) {
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
          <button className="secondary-button" onClick={onSample}>
            <Sparkles size={17} /> Load example inputs
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

function BriefStage({ values, onUpdate, briefText, onTextChange, onGenerate, onLock, loading }) {
  return (
    <div className="workspace-grid">
      <section className="panel">
        <PanelTitle icon={Target} eyebrow="Step 1" title="Creative Strategy Brief" description="Define the assignment. AI prepares an editable brief for student approval." />
        <div className="form-grid">
          <Field label="Organization" wide>
            <input value={values.organization} onChange={(event) => onUpdate("organization", event.target.value)} placeholder="Organization or brand name" />
          </Field>
          <Field label="Organization type">
            <select value={values.orgType} onChange={(event) => onUpdate("orgType", event.target.value)}>
              {["Nonprofit", "For-profit brand", "Public service", "Social enterprise"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Objective">
            <select value={values.objective} onChange={(event) => onUpdate("objective", event.target.value)}>
              {["Build awareness", "Recruit volunteers", "Drive donations", "Promote a product", "Increase consideration", "Invite engagement"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Audience" wide>
            <textarea rows="3" value={values.audience} onChange={(event) => onUpdate("audience", event.target.value)} placeholder="Who should this story reach, and what matters to them?" />
          </Field>
          <Field label="Platform">
            <select value={values.platform} onChange={(event) => onUpdate("platform", event.target.value)}>
              {["Instagram", "TikTok", "Facebook", "LinkedIn", "YouTube Shorts"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Content type">
            <select value={values.placement} onChange={(event) => onUpdate("placement", event.target.value)}>
              {["Organic post", "Paid ad"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Desired audience feeling">
            <input value={values.desiredEmotion} onChange={(event) => onUpdate("desiredEmotion", event.target.value)} />
          </Field>
          <Field label="Tone">
            <input value={values.tone} onChange={(event) => onUpdate("tone", event.target.value)} />
          </Field>
          <Field label="Required message or approved claim" wide>
            <textarea rows="2" value={values.requiredMessage} onChange={(event) => onUpdate("requiredMessage", event.target.value)} placeholder="Any fact, CTA, claim limitation or client requirement" />
          </Field>
        </div>
        <button className="primary-button full" disabled={loading || !values.organization || !values.audience} onClick={onGenerate}>
          {loading ? <Spinner /> : <Sparkles size={18} />}
          {loading ? "Preparing brief..." : "Generate editable brief"}
        </button>
      </section>
      <section className="panel output-panel">
        <PanelTitle icon={ClipboardCheck} eyebrow="AI draft" title="Review and lock" description="Edit the brief before moving into storytelling." />
        {briefText ? (
          <>
            <textarea className="brief-editor" value={briefText} onChange={(event) => onTextChange(event.target.value)} />
            <button className="primary-button full" onClick={onLock}>
              Lock brief and continue <ArrowRight size={18} />
            </button>
          </>
        ) : (
          <EmptyState text="Your editable creative brief appears here after generation." />
        )}
      </section>
    </div>
  );
}

function StoryStage({ arc, onArcChange, drafts, onDraftChange, feedback, hookOptions, selectedHook, onHookChange, onFeedback, onHooks, onLock, loading }) {
  const structure = ARC_STRUCTURES[arc];
  const hasDraft = structure.fields.every((field) => (drafts[field] || "").trim().length > 8);
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
            <PanelTitle icon={Sparkles} eyebrow="Hook workshop" title="Sharpen the opening" description="Choose or edit a hook grounded in your story." />
            {!hookOptions.length ? (
              <button className="secondary-button full" onClick={onHooks} disabled={loading === "hooks"}>
                {loading === "hooks" ? <Spinner /> : <Sparkles size={17} />}
                Generate hook options
              </button>
            ) : (
              <>
                <div className="hook-options">
                  {hookOptions.map((option) => (
                    <button key={option.hook} className={selectedHook === option.hook ? "selected" : ""} onClick={() => onHookChange(option.hook)}>
                      <b>{option.hook}</b>
                      <small>{option.rationale}</small>
                    </button>
                  ))}
                </div>
                <Field label="Edit your selected hook">
                  <textarea rows="3" value={selectedHook} onChange={(event) => onHookChange(event.target.value)} />
                </Field>
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

function ContentStage({ deliverable, onDeliverable, content, onContent, onGenerate, onLock, platform, loading }) {
  return (
    <div className="workspace-grid content-workspace">
      <section className="panel">
        <PanelTitle icon={PenLine} eyebrow="Step 3" title="Create your post or ad" description={`Translate the approved story into an editable ${platform} deliverable.`} />
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
            <FeedbackLine title="Responsible-use check" text={content.ethicalCheck} />
            <button className="primary-button full" onClick={onLock}>
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

function PackageStage({ content, production, deliverable, platform, feedback, history, onGenerate, onDownload, loading }) {
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
            <button className="primary-button" onClick={onDownload}>
              <Download size={17} /> Educator snapshot
            </button>
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
                    <small>{scene.onScreen}</small>
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
              <p className="support-text">{production.educatorSummary}</p>
              <div className="history">
                {history.slice(-4).map((item) => (
                  <span key={`${item.time}-${item.action}`}><b>{item.action}</b>{item.detail}</span>
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
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
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

export default App;
