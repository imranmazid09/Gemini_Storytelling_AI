import type { Config, Context } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";

type Action = "brief" | "feedback" | "hooks" | "content" | "production";

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

function normalizeResult(action: Action, result: Record<string, unknown>) {
  if (action !== "feedback") {
    return result;
  }

  const alignment = result.alignment as Record<string, unknown> | undefined;
  const validStatuses = ["Aligned", "Needs connection", "Off brief"];
  if (!alignment || !validStatuses.includes(String(alignment.status))) {
    return {
      ...result,
      alignment: {
        status: "Needs connection",
        summary: "The coach could not confirm that this story serves the locked brief yet.",
        missingLink: "Revise the draft to show how its central human moment supports the organization and objective.",
      },
    };
  }

  return result;
}

function promptFor(action: Action, payload: Record<string, unknown>) {
  const context = JSON.stringify(payload, null, 2);
  const shared = `You are StoryLab Pro, an attentive AdPR storytelling coach. Students create social media
posts or ads for nonprofit or for-profit organizations. Help them make strategic content more human,
specific, persuasive and respectful. Do not pressure disclosure, invent client claims, exploit hardship,
or replace student authorship. Return only valid JSON.`;

  switch (action) {
    case "brief":
      return {
        systemInstruction: `${shared}
Create an editable creative strategy brief between 120 and 180 words. Keep the student's stated facts and
make an unverified claim explicit as a constraint rather than presenting it as true.`,
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
the student's own draft. Give compact Socratic coaching rather than rewriting the story. Evaluate character
depth, emotional clarity, concrete detail, transformation, perspective-taking and ethical storytelling.
Do not reward emotional vividness as strategic success when the story is off brief.`,
        prompt: `Review the student's story-arc draft in relation to its locked brief.
${context}
Return JSON exactly shaped as:
{
  "alignment": {
    "status": "Aligned|Needs connection|Off brief",
    "summary": "direct verdict naming how the draft does or does not serve the locked brief",
    "missingLink": "the strategic connection the student must establish, or an empty string when aligned"
  },
  "connection": "one concise strength or priority about human connection",
  "craft": "one concise actionable craft observation",
  "responsibility": "one concise accuracy/dignity/agency observation",
  "questions": ["revision question one", "revision question two"],
  "rubric": [
    {"label": "Brief alignment", "level": "Off brief|Needs connection|Aligned"},
    {"label": "Character depth", "level": "Emerging|Developing|Strong|Exceptional"},
    {"label": "Emotional clarity", "level": "Emerging|Developing|Strong|Exceptional"},
    {"label": "Ethical storytelling", "level": "Emerging|Developing|Strong|Exceptional"}
  ]
}.`,
      };
    case "hooks":
      return {
        systemInstruction: `${shared}
Create openings that earn attention through truthful human detail, not exaggeration, pity or empty clickbait.
Only develop hooks from a story whose recorded alignment status is "Aligned" with its locked brief.`,
        prompt: `Develop three distinct hook options from the approved story direction.
${context}
Return JSON shaped as:
{ "options": [{ "hook": "one or two sentence hook", "rationale": "brief reason it is truthful and effective" }] }.`,
      };
    case "content":
      return {
        systemInstruction: `${shared}
Translate the student's approved story and hook into platform-ready social content. Adapt the output to the
selected static post, carousel, short video or paid ad. For a paid ad, keep claims supportable and the CTA appropriate.`,
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
  "frames": [{"title": "optional frame/card/beat title", "copy": "short copy", "visual": "direction"}]
}.`,
      };
    case "production":
      return {
        systemInstruction: `${shared}
Create only the execution material needed for the selected deliverable. Static posts need a frame plan, not
a video storyboard. Carousels need card sequencing. Videos need timed shots and caption guidance. Paid ads
need execution directions and a clear claim/CTA review.`,
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

  const model = Netlify.env.get("GEMINI_MODEL") || "gemini-3.5-flash";
  const { systemInstruction, prompt } = promptFor(body.action, payload);

  try {
    const ai = new GoogleGenAI({ apiKey });
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
    return response(normalizeResult(body.action, parsed));
  } catch (error) {
    console.error("StoryLab Gemini request failed", error);
    return response({ error: "AI coaching is temporarily unavailable. Please try again." }, 502);
  }
}

export const config: Config = {
  path: "/api/coach",
  method: "POST",
};
