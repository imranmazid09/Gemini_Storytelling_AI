import type { Config, Context } from "@netlify/functions";
import copyEngine from '../../copy-engine/v1.json' with { type: 'json' };
import { copyTask, copyIssues, hookIssues } from '../../shared/copy.mjs';
import { GoogleGenAI } from "@google/genai";
import { BRIEF_FIELDS, missingBrief, missingContent } from "../../shared/brief.mjs";
import { removeDuplicateSections } from "../../shared/response.mjs";
import { hash, token, records, validSession } from "../lib/records.mts";

type Action = "brief" | "feedback" | "hooks" | "content" | "production";

type CoachRequest = {
  session?: string;
  action?: Action;
  payload?: Record<string, unknown>;
};

const jsonHeaders = { "Content-Type": "application/json" };

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, "Cache-Control": "no-store" } });
}

function cleanJson(text: string) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function validateResult(action: Action, result: Record<string, any>, payload: Record<string, unknown>) {
  const text = (value: unknown) => typeof value === "string" && Boolean(value.trim());
  const fields = (object: any, keys: string[]) => object && keys.every(key => text(object[key]));
  if (action === "brief") return text(result.id) && missingBrief(result).length === 0 && result.aiGenerated === true &&
    ['Instagram static post', 'Instagram carousel', 'Short video', 'Paid ad'].includes(result.deliverable) && result.reasonToBelieve.startsWith('Supplied fictional scenario facts:') &&
    result.client.toLowerCase() !== String(payload.previousClient || "").toLowerCase() &&
    !Object.keys(BRIEF_FIELDS).some(key => /^(tbd|n\/a)$/i.test(String(key.includes('.') ? result.thinkFeelDo?.[key.split('.')[1]] : result[key]).trim()));
  if (action === "feedback") return fields(result.alignment, ['status', 'summary']) &&
    ['Aligned', 'Needs connection', 'Off brief'].includes(result.alignment.status) &&
    fields(result.storyReadiness, ['status', 'summary']) && ['Ready for hooks', 'Revise first'].includes(result.storyReadiness.status) &&
    fields(result, ['connection', 'responsibility']) && Array.isArray(result.beats) && result.beats.length > 0 && result.beats.every((beat: any) => fields(beat, ['stage', 'sharpen'])) &&
    Array.isArray(result.questions) && result.questions.length > 0 && result.questions.every(text) &&
    Array.isArray(result.rubric) && result.rubric.length > 0 && result.rubric.every((entry: any) => fields(entry, ['label', 'level']));
  if (action === "hooks") return Array.isArray(result.options) && result.options.length > 0 && result.options.every((option: any) => fields(option, ['tactic', 'trigger', 'hook', 'visual', 'onScreenText', 'audio', 'whyItWorks', 'claimCheck']) && option.hook.trim().split(/\s+/).length <= 12 && option.onScreenText.trim().split(/\s+/).length <= 8);
  if (action === "content") return missingContent(result, String(payload.deliverable).includes('Video') ? 'video' : String(payload.deliverable) === 'Carousel' ? 'carousel' : 'static').length === 0;
  return fields(result, ['summary', 'accessibility', 'educatorSummary']) && Array.isArray(result.scenes) && result.scenes.length > 0 && result.scenes.every((scene: any) => fields(scene, ['stage', 'time', 'visual', 'audio', 'onScreen']));
}

function promptFor(action: Action, payload: Record<string, unknown>) {
  const context = JSON.stringify(payload, null, 2);
  const shared = `You are StoryLab Pro, an attentive AdPR storytelling coach. Students create social media
posts or ads for fictional nonprofit or for-profit classroom clients. This is advertising storytelling training: connect an audience tension to a credible brand role, one message and an actionable CTA. Help them make strategic content more human,
specific, persuasive and respectful. Do not pressure disclosure, invent client claims, exploit hardship,
or replace student authorship.

Identify the campaign mode before coaching:
- Commercial brand: connect through a recognizable customer situation, identity or product tension; require
  credible product proof and never invent performance claims.
- Nonprofit or community service: connect mission to voluntary action while preserving dignity, agency and
  accurate impact claims.
- Advocacy or public-policy: center stakeholder or self-advocate leadership, identify a systemic barrier
  and a responsible civic action; never fictionalize lived experience or make hardship spectacle.
- Public-service communication: prioritize clarity, trust, behavioral usefulness and equitable framing.
All brief facts are fictional classroom scenario facts, not verified real-world evidence. Do not present them as researched facts. Preserve the locked brief's mandatory details and constraints in every output. Do not add superiority claims, guarantees, fabricated testimony or unsupported outcomes. Do not infer engagement or learning quality from button clicks.
A nonprofit can run advocacy and a brand can support a cause. Infer the mode from the objective and brief;
do not impose advocacy standards on ordinary brand work. Return only valid JSON.`;

  switch (action) {
    case "brief":
      return {
        systemInstruction: `${shared}
Invent a fictional client with a different name from previousClient. Prefer an industry other than Food and Beverage, Retail, Technology, Local Services, Entertainment or Nonprofit. Fill every field; no empty fields or TBD. Use plain language readable in under two minutes. singleMessage is one single-minded plain-language advertising message. mandatory names a concrete place, date or action. reasonToBelieve must begin "Supplied fictional scenario facts:". Include only modest concrete scenario facts; no statistics, performance promises, superlatives or unverified comparisons. constraints explicitly name prohibited claims and creative choices. deliverable must be exactly Instagram static post, Instagram carousel, Short video or Paid ad. cardIndustry and cardObjective are short menu labels.`,
        prompt: `Create one complete fictional advertising brief. ${context}
Return only this JSON shape with every string filled:
{"id":"unique fictional client slug","cardIndustry":"industry","cardObjective":"campaign type","client":"fictional client name","background":"context","audience":"specific audience","objective":"advertising objective","singleMessage":"one message","reasonToBelieve":"Supplied fictional scenario facts: ...","thinkFeelDo":{"think":"thought","feel":"feeling","do":"action"},"tone":"tone","mandatory":"concrete required detail","constraints":"what is off limits","deliverable":"Instagram static post","aiGenerated":true}`,
      };
    case "feedback":
      return {
        systemInstruction: `${shared}
The locked brief is the strategic standard for the student's story. Before offering craft advice, compare the
draft directly with the brief's organization, objective, audience, approved message and intended action.
Never invent a connection that the student did not write. If a draft could belong to a different campaign,
mark it "Off brief" and state the mismatch plainly. If the draft gestures toward the brief but does not yet
serve its objective, mark it "Needs connection." Mark it "Aligned" only when the relationship is visible in
the student's own draft.

Brief alignment is not story quality. Separately judge whether this is a connecting narrative rather than
an explanation, proposal or list of claims. For nonprofit and advocacy stories, "Ready for hooks" requires
a clearly focal person or ethically framed stakeholder viewpoint the audience can follow, a desire or stake,
pressure or obstacle, a concrete moment or choice, and an observable change tied to the action. A committee,
organization or policy idea is context, not a central character, unless one participant's viewpoint carries
the experience. For commercial brand stories, a sharply defined customer situation or use-case can supply
the focal viewpoint without naming a protagonist, but the tension and credible product role must be concrete.
A story may be aligned and still require revision because it lacks a connecting human viewpoint.

Give compact Socratic coaching rather than rewriting the story. For every submitted arc field, give one
specific revision move that teaches the student how to sharpen that beat. Do not write finished replacement
copy. In advocacy or nonprofit storytelling, recommend consent-based, self-advocate-led or transparently
composite viewpoints as appropriate; never suggest inventing lived experience or using vulnerability as
spectacle. Evaluate focal viewpoint, emotional clarity, concrete detail, conflict/transformation,
perspective-taking and ethical storytelling. Do not give a Strong or Exceptional focal-viewpoint score when
the audience has no specific experience, identity, desire or change to enter.`,
        prompt: `Review the student's story-arc draft in relation to its locked brief.
${context}
Return JSON exactly shaped as:
{
  "alignment": {
    "status": "Aligned|Needs connection|Off brief",
    "summary": "direct verdict naming how the draft does or does not serve the locked brief",
    "missingLink": "the strategic connection the student must establish, or an empty string when aligned"
  },
  "storyReadiness": {
    "status": "Ready for hooks|Revise first",
    "summary": "plain-language verdict about whether an audience can enter a focal person or audience viewpoint and its change",
    "priority": "the single most important connection revision, or an empty string when ready"
  },
  "connection": "one concise observation about the focal character or audience viewpoint appropriate to this campaign mode",
  "responsibility": "one concise accuracy/dignity/agency observation",
  "beats": [
    {"stage": "each submitted arc field name exactly, such as Setup", "sharpen": "one specific instructional revision move for this beat without writing the student's finished line"}
  ],
  "questions": ["revision question one", "revision question two"],
  "rubric": [
    {"label": "Brief alignment", "level": "Off brief|Needs connection|Aligned"},
    {"label": "Focal viewpoint", "level": "Missing|Emerging|Developing|Strong|Exceptional"},
    {"label": "Emotional clarity", "level": "Emerging|Developing|Strong|Exceptional"},
    {"label": "Concrete detail", "level": "Emerging|Developing|Strong|Exceptional"},
    {"label": "Conflict and change", "level": "Missing|Emerging|Developing|Strong|Exceptional"},
    {"label": "Perspective-taking", "level": "Emerging|Developing|Strong|Exceptional"},
    {"label": "Ethical storytelling", "level": "Emerging|Developing|Strong|Exceptional"}
  ]
}.`,
      };
    case "hooks":
      return {
        systemInstruction: `${shared}
${copyEngine.hookPrompt}
The hook is the first three seconds, not a caption paragraph. It must stop the scroll, help the intended
audience recognize relevance and earn the next five seconds. Create extremely concise openings: the hook
line must be no longer than 12 words and on-screen text no longer than 8 words. Coordinate three modes:
what the audience sees immediately, reads immediately and hears immediately when audio is used.
Use three different types: Question, Bold claim, Scene, Confession or Number. Include a requested type only when the evidence permits it; do not force three of the same type. For
"Best fit", vary tactics appropriately for the campaign mode. Use pattern interrupt and identity call-out
responsibly; never agitate trauma or vulnerability. Commercial bold claims must be supportable. Advocacy
and nonprofit hooks must preserve agency and avoid pity, fearmongering or invented testimony.
For commercial brand work, do not add "guaranteed", "only", "best", superiority comparisons or performance
promises unless those exact claims are included as approved claims in the brief. If an approved test fact is
given, a bold claim may state only that supported fact clearly. Do not invent proof demonstrations, test
conditions, temperature readings, percentages or numbers beyond the approved fact in the brief, including
in the visual concept or on-screen text. Preserve the strength of approved wording exactly: for example,
an approved "cold" claim does not authorize "ice-cold," "freezing" or other intensified performance wording.
For advocacy or nonprofit work, never write dialogue, first-person testimony, feelings, diagnosis impacts or
lived experiences for a stakeholder unless the student's approved story already provides those words or facts.
Use observable actions, design decisions, narrator copy or ambient sound instead.
Only develop hooks from a story whose recorded alignment status is "Aligned" and story readiness status is
"Ready for hooks".`,
        prompt: `Develop three distinct hook options from the approved story direction.
${context}
Return JSON shaped as:
{ "options": [{
  "tactic": "Question|Bold claim|Scene|Confession|Number",
  "trigger": "Pattern interrupt|Identity call-out|Credible tension",
  "hook": "hook line, maximum 80 characters and 12 words",
  "visual": "first-frame visual, one short sentence",
  "onScreenText": "screen text, maximum 8 words",
  "audio": "spoken line or sound cue for the opening moment",
  "whyItWorks": "one short reason this earns attention appropriately",
  "claimCheck": "support or responsibility check when needed"
}] }.`,
      };
    case "content":
      return {
        systemInstruction: `${shared}
${copyEngine.systemPrompt}
Banned phrases: ${copyEngine.bannedPhrases.join(", ")}.
Format guidance: ${copyEngine.formats[String(payload.deliverable) as keyof typeof copyEngine.formats] || copyEngine.formats["Static Post"]}
Approved examples (use only when the client/story facts match): ${JSON.stringify(copyEngine.examples)}
Translate the student's approved story and hook into platform-ready social content. Adapt the output to the
selected static post, carousel, short video or paid ad. Preserve the selected hook execution's visual,
text and audio logic where it fits the final format. For a paid ad, keep claims supportable and the CTA
appropriate. Apply the campaign-mode standards rather than making every post sound like advocacy.
Make the copy ready to place in a design or editing tool. Provide exact text and concrete visual directions, no placeholders. Carousel frames contain a finished card headline and body in copy. Short video frames contain finished spoken lines or captions in copy, with visual shot instructions. A static post or paid ad has one frame. Preserve approved facts without embellishment. Include the locked mandatory detail and CTA. Do not invent student rationale.`,
        prompt: `${copyTask(payload)}
Create an editable social content draft.
${context}
Return JSON shaped as:
{
  "primaryText": "caption, primary copy, or brief script",
  "headline": "short headline",
  "cta": "appropriate CTA",
  "visualDirection": "respectful visual concept",
  "altText": "accessible alt text for the primary visual",
  "ethicalCheck": "one responsibility or claim check",
  "frames": [{"title": "frame/card/beat title", "copy": "short copy", "visual": "direction"}]
}.`,
      };
    case "production":
      return {
        systemInstruction: `${shared}
Create only the execution material needed for the selected deliverable. Static posts need a frame plan, not
a video storyboard. Carousels need card sequencing. Videos need timed shots and caption guidance. Paid ads
need execution directions and a clear claim/CTA review.
This is an executable handoff: each scene has exact on-screen copy, shot/card composition, and actual voiceover or sound cues. Videos use explicit time ranges totaling a feasible short video; carousels use card numbers; static and paid ads use one frame. Use "Not applicable — static format" for audio only in static formats. Reuse approved content.frames and copy; do not rewrite approved claims, add new facts or invent missing decisions. Accessibility must give usable alt text or caption instructions. educatorSummary describes this production package only; never invent student revision, effort or learning.`,
        prompt: `Turn the student's approved content into a final production package.
${context}
Return JSON shaped as:
{
  "summary": "brief package summary",
  "scenes": [
    { "stage": "frame, card, or scene label", "time": "frame number or time", "visual": "direction", "audio": "audio or Not applicable", "onScreen": "on-screen copy" }
  ],
  "accessibility": "alt text, captions, contrast or reading guidance as appropriate",
  "educatorSummary": "one sentence noting strategic storytelling and responsible communication evidence"
}.`,
      };
  }
}

export default async function coach(req: Request, context: Context) {
  if (req.method !== "POST") {
    return response({ error: "Only POST requests are supported." }, 405);
  }

  let body: CoachRequest;
  try {
    body = (await req.json()) as CoachRequest;
  } catch {
    return response({ error: "Request body must be valid JSON." }, 400);
  }

  if (!body.action || !["brief", "feedback", "hooks", "content", "production"].includes(body.action)) {
    return response({ error: "A valid coaching action is required." }, 400);
  }

  const apiKey = Netlify.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return response({ error: "Gemini is not configured. Add GEMINI_API_KEY in Netlify environment settings." }, 503);
  }

  const payload = body.payload || {};
  const serializedPayload = JSON.stringify(payload);
  if (serializedPayload.length > 25000) {
    return response({ error: "The draft is too large for this coaching request." }, 413);
  }

  if (body.action === 'hooks') {
    const feedback = payload.feedback as any;
    if (feedback?.alignment?.status !== 'Aligned' || feedback?.storyReadiness?.status !== 'Ready for hooks') return response({ error: 'Revise your story and request feedback before developing hooks.' }, 400);
  }
  const model = Netlify.env.get("GEMINI_MODEL") || "gemini-3.5-flash";
  const { systemInstruction, prompt } = promptFor(body.action, payload);

  try {
    const ai = new GoogleGenAI({ apiKey });
    let output: Record<string, any> | undefined;
    let cleanup = 0;
    let repairIssues: string[] = [];
    let previousDraft = "";
    let bestCopy: { draft: Record<string, any>; issues: string[]; cleanup: number } | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await ai.models.generateContent({
        model,
        contents: prompt + (attempt ? `\nRepair these failed checks without inventing facts or changing the selected hook: ${repairIssues.join(" ") || "Return complete, clean JSON with no duplicate blocks."}. Correct only failed checks and preserve the rest. Previous draft: ${previousDraft}` : ""),
        config: { systemInstruction, temperature: attempt ? copyEngine.temperatures.repair : body.action === "hooks" ? copyEngine.temperatures.hooks : body.action === "content" ? copyEngine.temperatures.content : body.action === "feedback" ? 0.2 : 0.6, responseMimeType: "application/json" },
      });
      let parsed;
      try { parsed = JSON.parse(cleanJson(result.text || "")); } catch { if (!attempt) continue; if (bestCopy) { output = { ...bestCopy.draft, aiGenerated: true, copyEngineVersion: copyEngine.version, copyReview: { version: copyEngine.version, issues: bestCopy.issues } }; cleanup = bestCopy.cleanup; break; } throw new Error('Invalid JSON'); }
      const deduped = removeDuplicateSections(parsed);
      if (deduped.removed && !attempt) { repairIssues = ['Remove repeated labeled sections.']; continue; }
      if (!validateResult(body.action, deduped.result, payload)) { if (!attempt) { repairIssues = ['Complete all required fields and structured frames/cards.']; previousDraft = JSON.stringify(deduped.result); continue; } if (bestCopy) { output = { ...bestCopy.draft, aiGenerated: true, copyEngineVersion: copyEngine.version, copyReview: { version: copyEngine.version, issues: bestCopy.issues } }; cleanup = bestCopy.cleanup; break; } throw new Error('Incomplete AI response'); }
      const issues = body.action === 'content' ? copyIssues(deduped.result, payload) : body.action === 'hooks' ? hookIssues(deduped.result, payload) : [];
      if (body.action === 'content' && (!bestCopy || issues.length < bestCopy.issues.length)) bestCopy = { draft: deduped.result, issues, cleanup: deduped.removed };
      if (issues.length && !attempt) { repairIssues = issues; previousDraft = JSON.stringify(deduped.result); continue; }
      if (issues.length && body.action === 'hooks') throw new Error('Hook options did not meet the required type/length checks');
      output = { ...deduped.result, ...(body.action === 'hooks' || body.action === 'content' ? { aiGenerated: true, copyEngineVersion: copyEngine.version } : {}) };
      if (body.action === 'content' && bestCopy) { output = { ...bestCopy.draft, aiGenerated: true, copyEngineVersion: copyEngine.version, copyReview: { version: copyEngine.version, issues: bestCopy.issues } }; }
      cleanup = body.action === 'content' && bestCopy ? bestCopy.cleanup : deduped.removed;
      break;
    }
    if (!output) throw new Error('No complete AI response');
    if (body.action === 'feedback' && output.alignment.status !== 'Aligned') output.storyReadiness.status = 'Revise first';
    // Store hashes and timestamps only, never student prose or API credentials.
    let receipt;
    let receiptWarning;
    try {
      const store = records(context.deploy.context);
      if (await validSession(store, body.session)) {
        receipt = token();
        await store.setJSON(`calls/${receipt}`, { sessionHash: hash(body.session!), action: body.action, at: new Date().toISOString(), inputHash: hash(JSON.stringify(payload)), outputHash: hash(JSON.stringify(output)) }, { onlyIfNew: true });
      } else receiptWarning = 'This AI call has no verified session receipt.';
    } catch { receiptWarning = 'AI completed, but server verification could not record this call.'; }
    return response({ ...output, _cleanup: cleanup, _receipt: receipt, _receiptWarning: receiptWarning });
  } catch (error) {
    console.error("StoryLab Gemini request failed", error instanceof Error ? error.name : "error");
    return response({ error: "AI coaching is temporarily unavailable. Please try again." }, 502);
  }
}

export const config: Config = {
  path: "/api/coach",
  method: "POST",
};
