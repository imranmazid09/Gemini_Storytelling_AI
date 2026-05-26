# StoryLab Pro

StoryLab Pro is an AI-guided storytelling studio for advertising and public relations students.
Students develop a human-centered social media post or ad for a nonprofit or for-profit
organization while retaining authorship of the final creative work.

## Student Flow

1. **Creative Brief**: choose organization-sensitive objectives and tone, add any optional approved claim, then generate and edit a strategy brief.
2. **Story Studio**: draft an arc, receive campaign-aware Socratic feedback, and build a short visual/text/audio hook for the opening moment.
3. **Content Studio**: generate and edit a static post, carousel, short video concept or paid ad.
4. **Final Package**: prepare format-relevant execution directions, accessibility checks and an educator snapshot.

AI feedback first checks whether the student's draft is strategically aligned with the locked
brief, then separately checks whether it works as a connecting story through a focal character,
pressure and meaningful change. Students receive concise beat-by-beat revision guidance for their
selected arc. Hook development remains closed until the story is aligned and story-ready.
The coach differentiates commercial brand, nonprofit/community-service, advocacy/public-policy
and public-service communication instead of forcing every assignment into an advocacy pattern.

## Technology

- Vite and React
- Netlify Functions
- Gemini through the `@google/genai` SDK

Gemini requests are made in `netlify/functions/coach.mts`, never in browser code. Do not expose a
Gemini key through a `VITE_` environment variable.

## Local Development

```bash
npm install
npm run dev
```

The interface includes **Load example inputs** to start with a sample assignment; coaching
responses still come from the live AI service so that revisions receive honest feedback.
To test coaching locally, configure Netlify development environment variables for the site.

## Netlify Deployment

1. Connect this GitHub repository to a new or existing Netlify site.
2. Use the included `netlify.toml`; Netlify runs `npm run build` and publishes `dist`.
3. In the Netlify UI, add secret environment variables:

```txt
GEMINI_API_KEY=your_server_side_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash
```

4. Deploy the site and verify a generated creative brief and coaching response.

The API key is only read by the Netlify Function using `Netlify.env.get("GEMINI_API_KEY")`.

## Source Direction

This application replaces the earlier multi-section AI Storytelling Lab with the StoryLab Pro
approach developed for AdPR coursework: strategy, story, focused revision, social execution and
lightweight educator evidence.
