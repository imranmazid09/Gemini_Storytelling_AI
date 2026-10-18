import type { Config, Context } from "@netlify/functions";
import copyEngine from '../../copy-engine/v1.json' with { type: 'json' };
import { copyTask, copyIssues } from '../../shared/copy.mjs';
import { choiceIssues } from '../../shared/choices.mjs';
import { campaignTypeIssues, narrativeIssues, presentationIssues, repeatsCaption, imagePrompt, normalizeGeneratedTypography } from '../../shared/creative.mjs';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { BRIEF_FIELDS, missingBrief, missingContent } from "../../shared/brief.mjs";
import { removeDuplicateSections } from "../../shared/response.mjs";
import { hash, token, records, validSession } from "../lib/records.mts";

type Action = "brief" | "feedback" | "content" | "production" | "image";

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
    result.client.toLowerCase() !== String(payload.previousClient || "").toLowerCase() && campaignTypeIssues(result).length === 0 &&
    !Object.keys(BRIEF_FIELDS).some(key => /^(tbd|n\/a)$/i.test(String(key.includes('.') ? result.thinkFeelDo?.[key.split('.')[1]] : result[key]).trim()));
  if (action === "feedback") return fields(result.alignment, ['status', 'summary']) &&
    ['Aligned', 'Needs connection', 'Off brief'].includes(result.alignment.status) &&
    fields(result.storyReadiness, ['status', 'summary']) && ['Ready for content', 'Revise first'].includes(result.storyReadiness.status) &&
    fields(result, ['connection', 'responsibility']) && Array.isArray(result.beats) && result.beats.length > 0 && result.beats.every((beat: any) => fields(beat, ['stage', 'sharpen'])) &&
    Array.isArray(result.questions) && result.questions.length > 0 && result.questions.every(text) &&
    Array.isArray(result.rubric) && result.rubric.length > 0 && result.rubric.every((entry: any) => fields(entry, ['label', 'level']));
  if (action === "content") {
    const video = payload.deliverable === 'Instagram Video Storyboard';
    if (missingContent(result, video ? 'video' : 'static').length) return false;
    if (result.frames.length !== (video ? Number(payload.sceneCount || 4) : 1)) return false;
    return !video || result.frames.every((frame: any) => fields(frame, ['time', 'audio']) && typeof frame.onScreen === 'string');
  }
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
Invent a fictional client with a different name from previousClient. Prefer an industry other than Food and Beverage, Retail, Technology, Local Services, Entertainment or Nonprofit. Fill every field; no empty fields or TBD. Use plain language readable in under two minutes. singleMessage is one single-minded plain-language advertising message. mandatory names a concrete place, date or action. reasonToBelieve must begin "Supplied fictional scenario facts:". Include only modest concrete scenario facts; no statistics, performance promises, superlatives or unverified comparisons. constraints explicitly name prohibited claims and creative choices. deliverable must be exactly Instagram static post, Instagram carousel, Short video or Paid ad. cardIndustry names the sector. cardObjective MUST name the campaign's communication task: e.g. Volunteer Recruitment, Fundraising, Program Participation, Product Launch, Ticket Sales, Public Education or Brand Awareness. Never put Commercial Brand, Nonprofit or another organization category in cardObjective. For a nonprofit recruiting volunteers, use Volunteer Recruitment. Fill thinkFeelDo.do with the precise action the audience should take. Do not use em dashes.`,
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
an explanation, proposal or list of claims. For nonprofit and advocacy stories, "Ready for content" requires
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
    "status": "Ready for content|Revise first",
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
    case "content":
      return {
        systemInstruction: `${shared}
${copyEngine.systemPrompt}
${copyEngine.storyAdaptation}
Selected framework: ${payload.storyFramework || 'not specified; infer only from the supplied beats'}.
Framework guidance: ${copyEngine.frameworks[String(payload.storyFramework) as keyof typeof copyEngine.frameworks] || 'Honor the supplied structure without assuming a three-act template.'}
Banned phrases: ${copyEngine.bannedPhrases.join(", ")}.
Format guidance: ${copyEngine.formats[String(payload.deliverable) as keyof typeof copyEngine.formats] || copyEngine.formats["Instagram Image Post"]}
Craft examples (sourceStory is an example only; never borrow its events or names when absent from this student's story): ${JSON.stringify(copyEngine.examples)}
Opening approaches, used inside the caption generation, not a separate workshop: ${JSON.stringify(copyEngine.openingApproaches)}
Translate the student's approved story directly into the selected Instagram format. The creative brief is unchanged; the selected studio format determines this output. Apply campaign-mode standards. Preserve approved facts, mandatory details and the CTA without embellishment. Do not invent student rationale.
Use the internal guide to select, compress and stage the moment, not to summarize every beat. Do not reduce it to benefits or props. Prioritize this story over sample wording. Preserve supplied third-person fictional events without presenting them as a real testimonial. The requested creative energy is ${payload.creativeEnergy || 'Lively and relatable'}; fit it to the brief's tone and context, without making serious situations frivolous.
For Instagram Image Post, return exactly one still-image frame centered on a decisive action or surprising juxtaposition grounded in the story. Describe viewpoint, subject action, composition and focal point. No video motion, shot sequence, timestamps or audio. Caption length must be no more than the requested word limit. Optional text overlay is at most 5 words and must add a different thought, not repeat or paraphrase the caption or CTA; leave it empty if it adds nothing. Do not default to the mandatory logistics or an oversized recruitment banner on the image. Image treatment: ${payload.visualStyle || 'candid'}. Put all required factual details in the caption even when the overlay is empty.
For Instagram Video Storyboard, return exactly the requested sceneCount. Every scene has title, copy (the exact script or voiceover), visual (concrete action and image direction), time (consecutive start-end seconds), audio (sound direction), onScreen (optional text) and altText. The last scene ends at duration seconds. Keep speech feasible at about 2 words per second or fewer. This is a production plan, not a rendered video.
When hashtags is false, do not add hashtags. When true, add a few relevant hashtags after the CTA on a separate line. Include emojis only when emojis is true. Never invent engagement statistics.`,
        prompt: `${copyTask(payload)}
Create an editable social content draft.
${payload.requireChoices ? `Also return captionVariants: exactly three objects {"label":"short treatment name","primaryText":"complete caption"}. Each must carry the SAME approved story, required facts and final CTA within the word limit, but use a meaningfully different opening, emphasis or narrative distance, not synonym swaps. Keep framework and tone. primaryText at top level must equal the first variant. Never invent student rationale or select an option for them.
${payload.deliverable === 'Instagram Image Post' ? 'Also return imageConcepts: exactly two objects {"label":"short concept name","visual":"complete still-image direction","altText":"accessible description","onScreen":"optional overlay or empty string"}. Show different story-grounded actions, viewpoints or compositions, not unrelated props or different filters. Each must complement all three captions and honor privacy. Leave overlays empty unless they add a genuinely different thought. The first concept must match the top-level frame.' : 'Keep one coherent timed storyboard; caption alternatives must match its actual scenes.'}` : ''}
${context}
Return JSON shaped as:
{
  "primaryText": "standalone attention-grabbing opening line of at most 80 characters, then a line break, the story moment and turn, required details and one final CTA",
  "headline": "short headline",
  "cta": "appropriate CTA",
  "visualDirection": "respectful visual concept",
  "altText": "accessible alt text for the primary visual",
  "ethicalCheck": "one responsibility or claim check",
  "frames": [{"title": "image or scene title", "copy": "short image message or exact scene script", "visual": "still image direction or scene action", "time": "Image 1 for a still; consecutive start-end seconds for video", "audio": "Not applicable for still; sound direction for video", "onScreen": "optional exact text overlay or empty string", "altText": "image description"}]
}.`,
      };
    case "production":
      return {
        systemInstruction: `${shared}
Prepare concise final guidance for the selected Instagram output. An Instagram Image Post has exactly one still-image item and its caption. An Instagram Video Storyboard uses the student's approved scene count and exact script, time, visual, audio and onScreen fields. Do not rewrite approved content or add scenes. Accessibility includes usable alt text and video caption instructions when applicable. educatorSummary describes the package; never invent student effort or learning.`,
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

  if (!body.action || !["brief", "feedback", "content", "production", "image"].includes(body.action)) {
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

  const model = Netlify.env.get("GEMINI_MODEL") || "gemini-3.5-flash";
  const { systemInstruction, prompt } = body.action === 'image' ? { systemInstruction: '', prompt: '' } : promptFor(body.action, payload)!;

  let imageStage = 'generation';
  let imageDeadline = 0;
  try {
    const ai = new GoogleGenAI({ apiKey });
    let output: Record<string, any> | undefined;
    if (body.action === 'image') {
      if (typeof payload.prompt !== 'string' || !payload.prompt.trim()) return response({ error: 'An approved image direction is required.', code: 'IMAGE_DIRECTION_REQUIRED' }, 400);
      const configuredModel = Netlify.env.get('GEMINI_IMAGE_MODEL');
      const imageModel = configuredModel && !configuredModel.startsWith('imagen-') ? configuredModel : 'gemini-3.1-flash-image';
      imageDeadline = Date.now() + 50000;
      const checkImageDeadline = () => {
        if (Date.now() < imageDeadline) return;
        const error = new Error('Image request timed out'); error.name = 'TimeoutError'; throw error;
      };
      const imageSignal = () => { checkImageDeadline(); return AbortSignal.timeout(Math.max(1, imageDeadline - Date.now())); };
      let imageProblems = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        imageStage = 'generation';
        const generated = await ai.models.generateContent({ model: imageModel, contents: imagePrompt(payload) + (imageProblems ? `\nPrevious attempt failed review: ${imageProblems}. Use a simpler composition and completely blank surfaces.` : ''), config: { abortSignal: imageSignal(), responseModalities: ['IMAGE'], imageConfig: { aspectRatio: payload.aspectRatio === '9:16' ? '9:16' : '1:1', imageSize: '1K' } } });
        checkImageDeadline();
        const image = generated.candidates?.flatMap(candidate => candidate.content?.parts || []).find(part => part.inlineData?.data && part.inlineData?.mimeType?.startsWith('image/'))?.inlineData;
        if (!image?.data) return response({ error: 'The image service did not return an image. Your work is safe; try again or upload an image.', code: 'IMAGE_GENERATION_UNAVAILABLE' }, 422);
        if (image.data.length > 5_000_000) return response({ error: 'The generated image is too large. Try again or upload an image.', code: 'IMAGE_TOO_LARGE' }, 413);
        imageStage = 'review';
        const review = await ai.models.generateContent({ model, contents: [{ role: 'user', parts: [{ text: `Review this generated classroom campaign image against the approved direction and constraints. Direction: ${payload.prompt}. Story: ${payload.context || ''}. Brief: ${payload.brief || ''}. Fail if there are readable words or numbers on props, fabricated journals/training records/dates/named beneficiaries, unsupported claims, or child faces when prohibited. Abstract unrecognizable marks are acceptable. Also fail if it substitutes a static unrelated desk flat lay for an approved action or ignores the selected treatment ${payload.visualStyle || 'candid'}. Do not invent violations. Return JSON: {"usable":true,"issues":[]} with short specific issues when false.` }, { inlineData: { data: image.data, mimeType: image.mimeType } }] }], config: { abortSignal: imageSignal(), responseMimeType: 'application/json', temperature: 0.1 } });
        checkImageDeadline();
        const imageReview = JSON.parse(cleanJson(review.text || '{}'));
        if (typeof imageReview.usable !== 'boolean' || !Array.isArray(imageReview.issues) || imageReview.issues.some((issue: unknown) => typeof issue !== 'string')) throw new Error('Invalid image review');
        if (imageReview.usable === true && Array.isArray(imageReview.issues) && !imageReview.issues.length) {
          output = { dataUrl: `data:${image.mimeType};base64,${image.data}`, source: 'AI-generated', model: imageModel, imageHash: hash(image.data), imageReview: { checked: true, issues: [], attempts: attempt + 1, rejectedAttempts: attempt } };
          break;
        }
        imageProblems = Array.isArray(imageReview.issues) ? imageReview.issues.join('; ') : 'Image review could not confirm the constraints.';
      }
      if (!output) return response({ error: 'The generated images did not pass the brief and image-safety review. Try a simpler direction or upload an image. Your work is safe.', code: 'IMAGE_REVIEW_REJECTED' }, 422);
    }
    let cleanup = 0;
    let repairIssues: string[] = [];
    let previousDraft = "";
    let bestCopy: { draft: Record<string, any>; issues: string[]; cleanup: number } | undefined;
    const contentDeadline = Date.now() + 50000;
    const remaining = () => Math.max(1, contentDeadline - Date.now());
    for (let attempt = 0; !output && attempt < 2; attempt++) {
      let result;
      try {
        const contentSignal = body.action === 'content' ? AbortSignal.timeout(remaining()) : undefined;
        result = await ai.models.generateContent({
          model,
          contents: prompt + (attempt ? `\nRepair these failed checks without inventing facts: ${repairIssues.join(" ") || "Return complete, clean JSON with no duplicate blocks."}. Correct only failed checks and preserve the rest. Previous draft: ${previousDraft}` : ""),
          config: { systemInstruction, temperature: attempt ? copyEngine.temperatures.repair : body.action === "content" ? copyEngine.temperatures.content : body.action === "feedback" ? 0.2 : 0.6, responseMimeType: "application/json", ...(contentSignal ? { abortSignal: contentSignal } : {}), ...(body.action === 'content' && model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}) },
        });
      } catch (error) {
        if (!bestCopy) throw error;
        output = { ...bestCopy.draft, aiGenerated: true, copyEngineVersion: copyEngine.version, copyReview: { version: copyEngine.version, issues: bestCopy.issues } };
        cleanup = bestCopy.cleanup;
        break;
      }
      let parsed;
      try { parsed = JSON.parse(cleanJson(result.text || "")); } catch { if (!attempt) continue; if (bestCopy) { output = { ...bestCopy.draft, aiGenerated: true, copyEngineVersion: copyEngine.version, copyReview: { version: copyEngine.version, issues: bestCopy.issues } }; cleanup = bestCopy.cleanup; break; } throw new Error('Invalid JSON'); }
      const deduped = removeDuplicateSections(normalizeGeneratedTypography(parsed));
      if (deduped.removed && !attempt) { repairIssues = ['Remove repeated labeled sections.']; continue; }
      if (!validateResult(body.action, deduped.result, payload)) { if (!attempt) { repairIssues = body.action === 'brief' && campaignTypeIssues(deduped.result).length ? campaignTypeIssues(deduped.result) : ['Complete all required fields and structured frames/cards.']; previousDraft = JSON.stringify(deduped.result); continue; } if (bestCopy) { output = { ...bestCopy.draft, aiGenerated: true, copyEngineVersion: copyEngine.version, copyReview: { version: copyEngine.version, issues: bestCopy.issues } }; cleanup = bestCopy.cleanup; break; } throw new Error('Incomplete AI response'); }
      if (body.action === 'content' && String(payload.deliverable || '').startsWith('Instagram ')) {
        deduped.result.cta = deduped.result.primaryText.split('\n').map((line: string) => line.trim()).filter((line: string) => line && !line.startsWith('#')).at(-1);
        if (payload.deliverable === 'Instagram Image Post') deduped.result.frames[0].copy = deduped.result.headline;
      }
      if (body.action === 'content' && payload.deliverable === 'Instagram Image Post' && repeatsCaption(deduped.result.frames[0].onScreen, deduped.result)) {
        deduped.result.frames[0].onScreen = '';
        deduped.result.creativeNotes = ['A repetitive image overlay was omitted. The image can carry the moment without extra text.'];
      }
      if (body.action === 'content' && payload.requireChoices) {
        deduped.result.choicesRequired = true;
        delete deduped.result.selectedCaption;
        delete deduped.result.selectedConcept;
        delete deduped.result.choiceRationale;
      }
      const issues = body.action === 'content' ? [...copyIssues(deduped.result, payload), ...presentationIssues(deduped.result, payload), ...choiceIssues(deduped.result, payload)] : [];
      if (body.action === 'content' && deduped.result.storyTrace) {
        const mappingIssues = narrativeIssues(deduped.result, payload);
        if (mappingIssues.length) deduped.result.sourceMappingIssues = mappingIssues;
      }
      // Literal source matches cannot tell whether a draft actually carries the story.
      if (body.action === 'content' && !issues.length && String(payload.deliverable || '').startsWith('Instagram ')) {
        try {
          const review = await ai.models.generateContent({
            model,
            contents: JSON.stringify({ brief: payload.briefFields || payload.brief, story: payload.story, storyFramework: payload.storyFramework, frameworkGuidance: copyEngine.frameworks[String(payload.storyFramework) as keyof typeof copyEngine.frameworks], format: payload.deliverable, creativeEnergy: payload.creativeEnergy, ...(payload.requireChoices ? { comparisonReview: 'Review ALL three captionVariants and ' + (payload.deliverable === 'Instagram Image Post' ? 'both imageConcepts. Concepts must be meaningfully different story-grounded compositions.' : 'the actual timed storyboard scenes. Video does not require alternative image concepts.') + ' Flag generic or interchangeable variants, invented events, unsupported claims or privacy violations in any option. All options must preserve the same approved story and serve the audience. Do not demand different events when the source supplies only one moment. Optional overlays may be omitted when pairing options; do not fail on simple caption repetition that can be omitted.' } : {}), candidate: deduped.result }),
            config: { systemInstruction: copyEngine.editorialReview, temperature: 0.1, responseMimeType: 'application/json', abortSignal: AbortSignal.timeout(remaining()), ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: model.startsWith('gemini-3.5-flash') ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW } } : {}), responseJsonSchema: { type: 'object', properties: { issues: { type: 'array', items: { type: 'string' }, maxItems: 4 }, omitOverlay: { type: 'boolean' } }, required: ['issues', 'omitOverlay'], additionalProperties: false } },
          });
          const checked = JSON.parse(cleanJson(review.text || '{}'));
          if (!Array.isArray(checked.issues) || checked.issues.some((issue: unknown) => typeof issue !== 'string' || !issue.trim())) throw new Error('Invalid editorial review');
          if (payload.deliverable === 'Instagram Image Post' && checked.omitOverlay === true) {
            deduped.result.frames[0].onScreen = '';
            deduped.result.creativeNotes = ['A repetitive image overlay was omitted. The image can carry the moment without extra text.'];
          }
          issues.push(...checked.issues.slice(0, 4).map((issue: string) => normalizeGeneratedTypography(issue)));
        } catch {
          issues.push('The AI storytelling check could not finish. Review the opening, story moment, image and overlay yourself before approval.');
        }
      }
      if (body.action === 'content' && (!bestCopy || issues.length < bestCopy.issues.length)) bestCopy = { draft: deduped.result, issues, cleanup: deduped.removed };
      if (issues.length && !attempt) { repairIssues = issues; previousDraft = JSON.stringify(deduped.result); continue; }
      output = { ...deduped.result, ...(body.action === 'content' ? { aiGenerated: true, copyEngineVersion: copyEngine.version } : {}) };
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
        const { dataUrl: _image, ...metadata } = output;
        await store.setJSON(`calls/${receipt}`, { sessionHash: hash(body.session!), action: body.action, at: new Date().toISOString(), inputHash: hash(JSON.stringify(payload)), outputHash: hash(JSON.stringify(body.action === 'image' ? metadata : output)) }, { onlyIfNew: true });
      } else receiptWarning = 'This AI call has no verified session receipt.';
    } catch { receiptWarning = 'AI completed, but server verification could not record this call.'; }
    return response({ ...output, _cleanup: cleanup, _receipt: receipt, _receiptWarning: receiptWarning });
  } catch (error) {
    const safeDiagnostics = ['Invalid editorial review', 'Incomplete AI response', 'Invalid JSON', 'No complete AI response'];
    console.error("StoryLab Gemini request failed", error instanceof Error && safeDiagnostics.includes(error.message) ? error.message : error instanceof Error ? error.name : "error");
    if (body.action === 'image' && ((imageDeadline > 0 && Date.now() >= imageDeadline) || (error instanceof Error && error.name === 'TimeoutError'))) return response({ error: 'The image request timed out. Your work is safe; try again.', code: 'REQUEST_TIMEOUT' }, 504);
    if (body.action === 'image') return response(imageStage === 'review'
      ? { error: 'Image review is temporarily unavailable. No image-safety violation was confirmed. Your work is safe; try again.', code: 'IMAGE_REVIEW_UNAVAILABLE' }
      : { error: 'The image service is temporarily unavailable. Your work is safe; try again.', code: 'IMAGE_GENERATION_UNAVAILABLE' }, 502);
    return response({ error: "AI coaching is temporarily unavailable. Please try again." }, 502);
  }
}

export const config: Config = {
  path: "/api/coach",
  method: "POST",
};
