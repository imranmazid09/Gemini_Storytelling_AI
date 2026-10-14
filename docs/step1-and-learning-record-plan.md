# StoryLab Pro: agreed surgical update

Purpose: train students in advertising storytelling, from a specific audience tension through a credible brand role to executable social content. Preserve the four stages and existing visual system.

## Step 1

Two equal routes: six comparison cards for prebuilt fictional briefs, or one-click AI generation. Selecting a client loads its complete editable brief. Each card shows client, industry, campaign type, advertising objective and single message before selection. Browsing unedited briefs is immediate. Changing clients or regenerating requires confirmation only when brief edits, a locked brief or downstream work would be discarded. Selecting or generating a brief brings the full editable review pane into view. All fields must be filled; the student checks “I have read this brief” before locking. Edits clear that checkbox. Locked briefs are read-only in every downstream stage. Unlocking requires confirmation and clears dependent work while preserving its revision evidence.

Versioned classroom data lives in `src/prebuilt-creative-briefs.json`. Match the established brief schema without adding instructional fields. Label AI-generated briefs everywhere they appear. All supplied client facts are fictional classroom scenario facts. Do not present them as researched real-world evidence. Remove unsupported comparisons, superlatives, guaranteed performance, invented statistics and outcome promises. Deliverable suggestions use existing formats: static post, carousel, short video or paid ad.

## Existing stages

Story Studio remains student-authored with focused AI feedback, alignment and readiness checks, and hook selection. Content Studio retains the four formats; make frames/cards editable and preserve the existing platform choices. Final Package provides exact approved copy, frame/card or timed-shot composition, audio/voiceover cues where appropriate, alt text and accessibility instructions. AI production directions must preserve approved copy, claims and mandatory details; do not invent student decisions.

## Reliability

Every failed AI request surfaces a plain-language error and a Try again button. Validate complete response shapes; regenerate an invalid response once, then show an error instead of partial output. Keep the workspace navigable and drafts editable. Each request shows a button spinner, a visible action label, and a sticky status panel with Cancel request. Enforce a 45-second overall deadline with browser-compatible timers; slow session registration is limited to 5 seconds and AI calls to 40 seconds. Editing the relevant draft cancels the older request. Ignore late responses after cancellation or reset.

Save full project state, revision history, retained AI drafts and receipt references to localStorage after changes. Restore on reload. The dirty flag clears only after a successful write. Warn before unload only for a pending or failed write. If storage fails, show a persistent autosave-unavailable banner and treat the project as unsaved until a new project is explicitly started. Allow a local learning-record download at any stage.

Use accessible in-page confirmation dialogs; do not rely on native window.confirm. New project and unlocking stay available during requests, and confirmed changes abort pending work. New project, unlocking, switching a populated story arc, replacing a brief/content draft and clearing generated content for a different format/platform require confirmation.

A duplicated section is a top-level labeled block with the same heading (case-insensitive) and body identical after case/whitespace normalization or at least 90% identical. For structured responses, equivalent labeled array entries (stage/title/label) count as blocks. Do not remove intentionally shared copy from differently labeled fields. Discard a duplicate response and regenerate once. If repeats remain on the retry, remove later repeats, retain the first and log the cleanup. Validate the cleaned result before rendering.

Approve/build controls require complete relevant fields and show a missing-fields hint.

## Learning record and downloads

Offer a ready-to-use content text download and a self-contained HTML learning-record document, printable as PDF. Include project start/export timestamps, full ISO UTC event times, selected/locked brief with source label, student story, chosen hook execution, final copy and production plan, AI drafts and feedback rounds, before/after edit episodes, approvals and an optional student reflection.

Coalesce consecutive typing in the same field into one edit episode, retaining its initial value, final value and start/end timestamps. Record edits, selections, feedback delivery, approvals and failures. State explicitly when AI output was approved unchanged. Describe recorded actions and feedback verdicts; do not assign an unsupported engagement grade or infer attention, effort, authorship or understanding.

## QR verification

Generate opaque tool-session receipts. Store only hashed session credentials, successful AI input/output hashes, action names and server timestamps. At verified export, register the learning-record digest and its confirmed call references, not the creative drafts. QR links to a public verification page by unguessable report identifier. Records are immutable and stores are separated by Netlify deploy context.

The verification page reports server-confirmed AI calls and can locally check the original HTML document’s embedded record against the registered SHA-256 digest and retained AI input/output hashes. Files are not uploaded for checking. Anyone with the receipt link can view receipt metadata. Browser edits and browser timestamps remain self-reported; this verifies issuance and recorded AI calls, not student identity or authorship. A modified printed document cannot be checked byte-for-byte; retain the original HTML.

When verification is unavailable, keep local work intact and offer an explicitly unverified local record. Never label an unissued receipt verified.

## Copy engine

Version the generation prompt, taxonomy, examples and format rules in copy-engine/v1.json. Preserve
client tone rather than forcing a casual student voice on every assignment. Hooks use three different
types; confession and number hooks must be supported by the approved story/brief. The selected hook
is the exact opening line of generated content. Keep mandatory details, one CTA and clear short
blocks, using only supplied facts. Remove examples that invent queues, brew duration, waitlists,
performance advantages or outcomes.

Run transparent copy checks and one repair with named failures. A remaining complete draft is marked
Needs a human edit, never presented as finished copy. Student edits recheck the draft, with the
approved hook visible for comparison. Record the engine version alongside generated drafts and in
the learning document. These rules do not grade understanding or replace evidence-based judgment.
