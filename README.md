# StoryLab Pro

StoryLab Pro is an AI-guided storytelling studio for advertising and public relations students.
Students develop a human-centered social media post or ad for a nonprofit or for-profit
organization while retaining authorship of the final creative work.

## Student Flow

1. **Creative Brief**: the existing six comparison cards, fictional AI brief generation, structured fields, read confirmation and locking behavior are preserved.
2. **Story Workshop**: draft an arc, receive campaign-aware Socratic feedback and approve the story. There is no separate hook workshop or approval requirement.
3. **Instagram Content Studio**: create an image post with a full Instagram mockup, or a video script with an illustrated storyboard. Choose caption length, optional hashtags/emojis, and video duration and scene count. Generate or upload images, then edit captions, scene copy, sound directions, overlays and alt text.
4. **Review + Submit**: review the approved output, write a reflection and download a Blackboard ZIP with creative PNGs, caption/script and the instructor learning record. Video storyboards include a self-contained illustrated HTML document that can be printed or saved as PDF; they are not rendered videos.

AI feedback first checks whether the student's draft is strategically aligned with the locked
brief, then separately checks whether it works as a connecting story through a focal character,
pressure and meaningful change. Students receive concise beat-by-beat revision guidance for their
selected arc. Content Studio opens after the story is aligned and ready for content.
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
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
```

4. Deploy the site and verify a generated creative brief and coaching response.

The API key is only read by the Netlify Function using `Netlify.env.get("GEMINI_API_KEY")`.

## Source Direction

This application replaces the earlier multi-section AI Storytelling Lab with the StoryLab Pro
approach developed for AdPR coursework: strategy, story, focused revision, social execution and
lightweight educator evidence.

## Briefs and student learning records

Step 1 offers six comparison cards and one-click fictional AI briefs. Browsing unedited briefs is immediate; selecting or generating a brief brings its details into view. Confirmation protects edited, locked or downstream work. Instructor data is versioned in
`src/prebuilt-creative-briefs.json`. Every scenario is fictional; its evidence is supplied for classroom
practice rather than verified real-world advertising claims. The locked structured brief feeds all later
coaching. The student still writes the story and approves creative decisions.

Project state, retained AI drafts and before/after edits autosave in this browser. Images are stored separately in IndexedDB, so large image data does not fill the text autosave. Clearing browser storage
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

### Request recovery and browser compatibility

AI requests show a spinner/action label and a sticky status with Cancel request. The entire workspace is
not disabled. Browser deadlines are 45 seconds for coaching, 60 seconds for images and 70 seconds for
content with editorial review, using regular timers and AbortController rather than
AbortSignal.timeout. Failed requests show a plain-language error and Try again. Draft edits cancel
older requests. Reset and unlock use accessible in-page confirmation dialogs; confirming either
can abort pending work. Late responses cannot overwrite a canceled or reset project.

`npm run test:requests` checks unresponsive fetches/body reads, late responses and cancellation.
`npm run test:reliability` exercises every AI action against stalled requests, failure/retry, reset,
unlock and every structure selector, including browsers without native dialogs or AbortSignal.timeout.

### Evidence-supported copy engine

`copy-engine/v1.json` versions the prompt, safe examples, banned language and Instagram format guidance.

Copy engine 2.4 adds three complete caption treatments for explicit student comparison and, for image posts,
two distinct still-image concepts. All alternatives receive literal claim/presentation checks and the same
batch editorial review. Students select before approval, may edit freely, and can explain their choice in
their own words. The instructor record retains alternatives, selections, revisions and optional explanation;
these records do not certify authorship or grade learning. Existing saved single-draft projects remain usable.
An image failure preserves choices and prose for retry. The number checker excludes the high-five greeting
while still checking measured compounds such as five-minute training; numerical warnings identify text to inspect.
Run `npm run test:choices` for comparison and export regressions.

For a different assignment or a shared browser, download the current work and choose New project;
revisions within one assignment stay together. Image failures record a safe category and explanation
(review rejected, review unavailable, generation unavailable, timeout, or other service/connection error),
not raw provider diagnostics or rejected images. Successful internal review retries retain attempt counts
in AI response metadata and a learning-record event. Older records cannot retroactively identify failure causes.
Version 2.3 passes the student's selected framework into generation and editorial review. An internal
creative guide selects the focal experience, pressure, pivotal moment and demonstrated change;
it is not extra student work or a generated student rationale. Captions omit nonessential background,
give the turn space and land on a supplied action before logistics. Framework-specific guidance
preserves Three-Act, StoryBrand and Freytag differences. Video review checks scene progression,
not just timing or caption copy. Source stories without a concrete turn are flagged for revision,
not completed by inventing events. Existing drafts remain untouched until students replace them.
Video timing accepts explicit second ranges and minute:second ranges; the selected studio format
takes precedence over a brief's original format label during editorial review.
Content develops directly from the approved story and preserves mandatory details and constraints.
Version 2.2 keeps the existing studio and adds a standalone attention-grabbing opening, a
five-word optional complementary overlay, and an editorial review of the actual caption/image
pair, not just matching source words. The review checks story carry-through, account-swap
genericness, invented details and repetitive overlays. One targeted repair is allowed; unresolved
issues or unavailable editorial review leave an editable, flagged draft. Students still make the
creative judgment, supported by a short optional self-check in the editor. Content generation has
a longer browser deadline to accommodate this review; cancellation remains available.
Repetitive optional image overlays are omitted with an explanatory note, rather than passing
duplicate text along to the student. Students can add and edit a complementary overlay themselves.
The server bounds content generation, review and repair to a shared 50-second model-call budget,
retaining a complete flagged draft if repair fails or times out.
Source-quote mapping errors are retained as diagnostic metadata, not a submission gate:
editorial review compares the actual caption and image direction with the approved story.
Version 2.1 added creative-energy and image-treatment choices, story-moment/turn source mapping,
and narrative examples instead of benefit-list captions. Source mapping supports review; it does
not certify semantic quality, authorship or learning. Existing drafts are preserved until replaced.
Generated images undergo a multimodal constraint review with at most one retry. Readable prop
text, fabricated records and prohibited child faces are rejected, but students must still inspect
every image. Overlays are added separately and remain editable.
Checks cover caption settings and consecutive scene timing. One repair attempt names failed checks;
the best complete draft is retained with any remaining issues for student editing. These checks support
review, not grading or factual certification. Copy-engine versions remain in the learning record.

### Instagram asset exports

The image-post mockup includes a profile image or initial, username, optional location, post image,
caption, action icons, timestamp and optional explicitly simulated engagement. It exports as a PNG
with a classroom-concept label. The separate design PNG omits Instagram interface elements.
Every video scene pairs a portrait image with exact script, action, time, on-screen text and sound.
Only metadata and an image hash are retained in AI records; base image bytes stay in browser storage.
Both verified and explicitly unverified local ZIPs are available. Verification does not prove authorship.

Image generation uses the existing server-side Gemini key. Retired Imagen model settings fall back to
`gemini-3.1-flash-image`. An image-generation failure leaves the content intact and students can upload
an image instead. Uploaded PNG, JPEG and WebP files are resized locally before saving.

Run `npm run test:browser` with Playwright and an installed Chrome browser for both output paths,
image reload recovery, custom duration/length, PNG exports, ZIP contents and narrow-screen checks.
`node tests/live-preview.mjs` is an opt-in live text and image smoke test and consumes provider usage.
`node tests/storytelling-live.mjs` checks live captions and image concepts against six explicitly
fictional test stories. It does not render all six images or substitute AI review for human judgment.
Set `STORYLAB_EXTENDED=1` to include a deliberately weak source and a timed video storyboard.
