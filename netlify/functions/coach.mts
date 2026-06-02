import type { Config, Context } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";

type TextAction = "brief" | "feedback" | "hooks" | "content" | "production";
type Action = TextAction | "image";

type CoachRequest = {
  action?: Action;
  payload?: Record<string, unknown>;
};

const jsonHeaders = { "Content-Type": "application/json" };

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function cleanJson(text: string) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function normalizeResult(action: TextAction, result: Record<string, unknown>, payload: Record<string, unknown>) {
  if (action === "hooks") {
    const options = Array.isArray(result.options) ? result.options : [];
    return {
      ...result,
      options: options.map((item) => {
        const option = item as Record<string, unknown>;
        return {
          tactic: String(option.tactic || "Best fit"),
          trigger: String(option.trigger || "Pattern interrupt"),
          hook: String(option.hook || ""),
          visual: String(option.visual || "Show the central moment immediately."),
          onScreenText: String(option.onScreenText || option.hook || ""),
          audio: String(option.audio || "Use audio only when the format supports it."),
          whyItWorks: String(option.whyItWorks || option.rationale || ""),
          claimCheck: String(option.claimCheck || ""),
        };
      }),
    };
  }

  if (action === "content") {
    const deliverable = String(payload.deliverable || "");
    if (!["Static Post", "Carousel", "Paid Ad"].includes(deliverable)) {
      return { ...result, visuals: [] };
    }
    const hookExecution = payload.hookExecution as Record<string, unknown> | undefined;
    const overlayText = String(hookExecution?.onScreenText || payload.hook || result.headline || "");
    const suppliedVisuals = Array.isArray(result.visuals) ? result.visuals : [];
    const frames = Array.isArray(result.frames) ? result.frames : [];
    const requestedCards = Number.parseInt(String(payload.length || "3"), 10);
    const expectedCount = deliverable === "Carousel"
      ? Math.min(Math.max(Number.isNaN(requestedCards) ? (suppliedVisuals.length || frames.length || 3) : requestedCards, 1), 10)
      : 1;
    const fallbackVisual = {
      label: deliverable === "Carousel" ? "Card 1" : "Primary image",
      prompt: String(result.visualDirection || hookExecution?.visual || "A respectful, platform-ready social image."),
      overlayText,
      altText: String(result.altText || ""),
    };
    const visualSource = Array.from({ length: expectedCount }, (_unused, index) => {
      const frame = frames[index] as Record<string, unknown> | undefined;
      return suppliedVisuals[index] || {
        ...fallbackVisual,
        label: deliverable === "Carousel" ? `Card ${index + 1}` : fallbackVisual.label,
        prompt: String(frame?.visual || fallbackVisual.prompt),
        overlayText: String(frame?.copy || (index === 0 ? overlayText : "")),
      };
    });
    return {
      ...result,
      visuals: visualSource.map((item, index) => {
        const visual = item as Record<string, unknown>;
        return {
          label: String(visual.label || (deliverable === "Carousel" ? `Card ${index + 1}` : "Primary image")),
          prompt: String(visual.prompt || visual.visual || fallbackVisual.prompt),
          overlayText: String(visual.overlayText || (index === 0 ? overlayText : "")),
          altText: String(visual.altText || result.altText || ""),
        };
      }),
    };
  }

  if (action === "production") {
    const deliverable = String(payload.deliverable || "");
    if (!["Static Post", "Carousel", "Paid Ad"].includes(deliverable)) {
      return result;
    }
    const content = payload.content as Record<string, unknown> | undefined;
    const rawScenes = Array.isArray(result.scenes) ? result.scenes : [];
    const fallbackScene = {
      stage: deliverable === "Carousel" ? "Card 1" : "Image + caption",
      visual: String(content?.visualDirection || "Use the approved still image asset."),
      onScreen: String(content?.headline || ""),
    };
    const stillScenes = (rawScenes.length ? rawScenes : [fallbackScene])
      .slice(0, deliverable === "Carousel" ? undefined : 1)
      .map((item, index) => {
        const scene = item as Record<string, unknown>;
        return {
          stage: String(scene.stage || (deliverable === "Carousel" ? `Card ${index + 1}` : "Image + caption")),
          time: deliverable === "Carousel" ? `Card ${index + 1}` : "Image 1",
          visual: String(scene.visual || fallbackScene.visual),
          audio: "Not applicable",
          onScreen: String(scene.onScreen || fallbackScene.onScreen),
        };
      });
    return { ...result, scenes: stillScenes };
  }

  if (action !== "feedback") {
    return result;
  }

  const normalized = { ...result };
  const alignment = result.alignment as Record<string, unknown> | undefined;
  const validStatuses = ["Aligned", "Needs connection", "Off brief"];
  if (!alignment || !validStatuses.includes(String(alignment.status))) {
    normalized.alignment = {
      status: "Needs connection",
      summary: "The coach could not confirm that this story serves the locked brief yet.",
      missingLink: "Revise the draft to show how its central human moment supports the organization and objective.",
    };
  }

  const normalizedAlignment = normalized.alignment as Record<string, unknown>;
  const readiness = result.storyReadiness as Record<string, unknown> | undefined;
  const validReadiness = ["Ready for hooks", "Revise first"];
  if (!readiness || !validReadiness.includes(String(readiness.status))) {
    normalized.storyReadiness = {
      status: "Revise first",
      summary: "The story needs a visible focal person, pressure and meaningful change before hook development.",
      priority: "Center one ethical, specific viewpoint and show what changes for that person.",
    };
  } else if (normalizedAlignment.status !== "Aligned") {
    normalized.storyReadiness = {
      ...readiness,
      status: "Revise first",
    };
  }

  return normalized;
}

function promptFor(action: TextAction, payload: Record<string, unknown>) {
  const context = JSON.stringify(payload, null, 2);
  const shared = `You are StoryLab Pro, an attentive AdPR storytelling coach. Students create social media
posts or ads for nonprofit or for-profit organizations. Help them make strategic content more human,
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
A nonprofit can run advocacy and a brand can support a cause. Infer the mode from the objective and brief;
do not impose advocacy standards on ordinary brand work. Return only valid JSON.`;

  switch (action) {
    case "brief":
      return {
        systemInstruction: `${shared}
Create an editable creative strategy brief between 120 and 180 words. Keep the student's stated facts and
make an unverified claim explicit as a constraint rather than presenting it as true. Resolve an "Other"
organization, objective or tone through its accompanying custom text. Tailor strategy and CTA standards to
the campaign mode rather than treating brands, nonprofits and advocacy campaigns as interchangeable.`,
        prompt: `Using these assignment inputs, write the brief.
${context}
Return JSON in this shape: { "brief": "editable brief text" }.`,
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
The hook is the first three seconds, not a caption paragraph. It must stop the scroll, help the intended
audience recognize relevance and earn the next five seconds. Create extremely concise openings: the hook
line must be no longer than 12 words and on-screen text no longer than 8 words. Coordinate three modes:
what the audience sees immediately, reads immediately and hears immediately when audio is used.
Use the requested tactic when supplied: Confession, Bold claim, Relatability, Contrast or Curiosity. For
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
  "tactic": "Confession|Bold claim|Relatability|Contrast|Curiosity",
  "trigger": "Pattern interrupt|Identity call-out|Credible tension",
  "hook": "hook line, maximum 12 words",
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
Translate the student's approved story and hook into platform-ready social content. Adapt the output to the
selected static post, carousel, short video or paid ad. Preserve the selected hook execution's visual,
text and audio logic where it fits the final format. Honor the requested length. Apply the campaign-mode
standards rather than making every post sound like advocacy.

Format requirements:
- A Static Post is one still image with one concise on-image text overlay plus a caption, CTA and alt text.
- A Carousel is a sequence of still-image cards matching the requested card count; include one image
  direction and short overlay for each card.
- A Paid Ad is one still image with on-image text, primary/caption text, headline and CTA. It is never a
  video, moving scene, shot list or storyboard.
- A Short Video may use scenes and audio; do not return still-image asset directions for it.
For the first image, carry forward the approved hook workshop on-screen text exactly when it is provided.
Describe images without requesting printed words, brand logos or watermarks; the app adds approved text
overlays after image generation. Keep claims supportable and the CTA appropriate.`,
        prompt: `Create an editable social content draft.
${context}
Return JSON shaped as:
{
  "primaryText": "caption, primary copy, or brief script",
  "headline": "short headline",
  "cta": "appropriate CTA",
  "visualDirection": "respectful visual concept",
  "altText": "accessible alt text for the primary visual",
  "ethicalCheck": "one responsibility or claim check",
  "frames": [{"title": "optional frame/card/beat title", "copy": "short copy", "visual": "direction"}],
  "visuals": [{"label": "Primary image or Card number; empty array only for Short Video", "prompt": "still-image direction without written text", "overlayText": "exact approved on-image wording", "altText": "asset alt text"}]
}.`,
      };
    case "production":
      return {
        systemInstruction: `${shared}
Create only the execution material needed for the selected deliverable. Static posts need a single-image
layout, not a video storyboard. Carousels need static card sequencing. Videos need timed shots and caption guidance.
Paid ads are a still image plus caption/primary text, headline and CTA, with a clear claim/CTA review.
Never give a Paid Ad video direction, motion direction, audio strategy, shot list or timed scene.
For a Static Post or Paid Ad, return exactly one execution item with time "Image 1" and audio
"Not applicable". For a Carousel, use "Card 1", "Card 2" and so on as the time values and audio
"Not applicable". Only a Short Video may include timestamps and audio.`,
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

async function createImageAsset(ai: GoogleGenAI, payload: Record<string, unknown>) {
  const direction = String(payload.prompt || "").trim();
  if (!direction) {
    return response({ error: "An image direction is required." }, 400);
  }
  const platform = String(payload.platform || "social media");
  const deliverable = String(payload.deliverable || "still-image post");
  const label = String(payload.label || "Primary image");
  const overlayText = String(payload.overlayText || "").trim();
  const imageModel = Netlify.env.get("GEMINI_IMAGE_MODEL") || "imagen-4.0-generate-001";
  const prompt = `Create a polished square still image asset for a ${platform} ${deliverable}.
Asset role: ${label}.
Creative direction: ${direction}
This is a respectful, realistic student campaign visual. Do not add words, typography, logos, UI,
watermarks or caption boxes to the image. The application will add the approved overlay text separately:
"${overlayText}".`;
  const result = await ai.models.generateImages({
    model: imageModel,
    prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: "1:1",
      outputMimeType: "image/png",
      includeRaiReason: true,
    },
  });
  const generated = result.generatedImages?.[0];
  const data = generated?.image?.imageBytes;
  if (!data) {
    const reason = generated?.raiFilteredReason
      ? ` Image safety review: ${generated.raiFilteredReason}.`
      : "";
    return response({ error: `No usable image was generated.${reason}` }, 422);
  }
  const mimeType = generated.image?.mimeType || "image/png";
  return response({ dataUrl: `data:${mimeType};base64,${data}` });
}

export default async function coach(req: Request, _context: Context) {
  if (req.method !== "POST") {
    return response({ error: "Only POST requests are supported." }, 405);
  }

  let body: CoachRequest;
  try {
    body = (await req.json()) as CoachRequest;
  } catch {
    return response({ error: "Request body must be valid JSON." }, 400);
  }

  if (!body.action || !["brief", "feedback", "hooks", "content", "production", "image"].includes(body.action)) {
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

  try {
    const ai = new GoogleGenAI({ apiKey });
    if (body.action === "image") {
      return await createImageAsset(ai, payload);
    }
    const model = Netlify.env.get("GEMINI_MODEL") || "gemini-3.5-flash";
    const { systemInstruction, prompt } = promptFor(body.action, payload);
    const result = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: body.action === "feedback" ? 0.2 : 0.6,
        responseMimeType: "application/json",
      },
    });

    const text = result.text || "";
    const parsed = JSON.parse(cleanJson(text)) as Record<string, unknown>;
    return response(normalizeResult(body.action, parsed, payload));
  } catch (error) {
    console.error("StoryLab Gemini request failed", error);
    return response({ error: "AI coaching is temporarily unavailable. Please try again." }, 502);
  }
}

export const config: Config = {
  path: "/api/coach",
  method: "POST",
};
