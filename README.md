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

## Briefs and student learning records

Step 1 offers a six-client dropdown and one-click fictional AI briefs. Browsing unedited briefs is immediate; selecting or generating a brief brings its details into view. Confirmation protects edited, locked or downstream work. Instructor data is versioned in
`src/prebuilt-creative-briefs.json`. Every scenario is fictional; its evidence is supplied for classroom
practice rather than verified real-world advertising claims. The locked structured brief feeds all later
coaching. The student still writes the story and approves creative decisions.

Project state, retained AI drafts and before/after edits autosave in this browser. Clearing browser storage
removes local work. A persistent banner reports storage failure; a local document can be downloaded at
any stage. Starting a new project requires confirmation.

At completion, download a plain-text production handoff or a self-contained HTML learning record.
Open the HTML to review, share, or print/save as PDF. It contains copy, frames/cards, audio directions,
accessibility instructions, UTC timestamps, edit evidence, approvals and optional student reflection.
Actions are described rather than scored; unchanged AI acceptance is explicit.

### Instructor QR verification

`/api/record` creates an opaque session and registers immutable report receipts in Netlify Blobs.
`/api/coach` records only successful-call input/output hashes and server timestamps. Stores are scoped
by deploy context (`storylab-receipts-production`, `storylab-receipts-deploy-preview`, etc.). No extra
API credential is needed on Netlify: Blobs receives its credentials from the Functions runtime.
Creative drafts and names are not stored server-side by this feature. Record hashes and receipt
metadata are accessible to anyone with the random verification link.

The report QR opens `/verify/<receipt-id>`. The instructor can select the original HTML document
locally to check its embedded record digest and retained AI drafts. The file is not uploaded.
A matching receipt verifies tool issuance and the listed successful AI calls. Browser edits and
client timestamps remain self-reported, and the receipt does not authenticate student identity,
prove authorship or grade learning. Printed/PDF versions retain the QR but require the original
HTML for the embedded-record integrity check. Keep the published verification origin available.

If Blobs is unavailable, AI coaching still works and students can download an explicitly unverified
local record. Calls without stored receipts cannot later acquire server confirmation.

See `docs/step1-and-learning-record-plan.md` for the accepted scope and evidence definitions.

## Validation

`npm test` runs deterministic function, duplicate-cleanup, schema and evidence tests with isolated
in-memory storage and a mocked Gemini SDK. `npm run test:browser` uses Playwright with controlled
API responses, testing selection, validation, reload recovery, errors/retry, edit evidence,
downloads, QR digest checking and autosave failure. Install Playwright locally to use that command;
`PLAYWRIGHT_MODULE` and `CHROME_PATH` can point to existing tooling. These tests do not consume AI
credits. `npm run check` checks the production build. Live Gemini behavior still needs a preview
smoke test after deploying with the existing server-side environment variables.
