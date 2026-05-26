# StoryLab Pro

StoryLab Pro is an AI-guided storytelling studio for advertising and public relations students.
Students develop a human-centered social media post or ad for a nonprofit or for-profit
organization while retaining authorship of the final creative work.

## Student Flow

1. **Creative Brief**: enter client, audience, objective and platform inputs; generate and edit a strategy brief.
2. **Story Studio**: draft an arc, receive concise Socratic feedback, and select or revise an emotional hook.
3. **Content Studio**: generate and edit a static post, carousel, short video concept or paid ad.
4. **Final Package**: prepare format-relevant execution directions, accessibility checks and an educator snapshot.

AI feedback emphasizes human connection, craft and responsible persuasion instead of presenting
constant grades or writing the student's final story for them.

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

The interface includes **Preview sample** mode for testing the workflow without making AI calls.
To test live coaching locally, configure Netlify development environment variables for the site.

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
