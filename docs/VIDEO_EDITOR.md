# Video editor

The desktop Video editor lives at `/studio/video/new` and `/studio/video/:projectId`.
Open it from Personal Files → New → Video editor, double-click an uploaded video in
Personal Files, or upload a video while adding lesson media. Video uploads retain their
pictures; they no longer go through the audio-only recording import.

The workspace uses the Recording editor's SuiteMark, studio palette, title styling,
compact action strip, transport and shared icon set. Library/preview/settings widths
and timeline height have pointer- and keyboard-operable separators. Layout preferences
stay in this browser; double-click a separator or use More tools → Reset panel layout.

## Editing

- Multiple video, audio and caption tracks. Upper video/caption tracks appear in front.
- Originals remain unchanged. Clip edits are project records pointing to source assets.
- Drag or enter clip timing; trim either edge; split, duplicate, copy/cut/paste, remove,
  or ripple-delete on the selected track. Ripple deletion deliberately retains the
  timing of other tracks.
- Playback speed, fit/crop, position, scale, opacity, volume and fades. Overlap clips
  on different video tracks and fade the upper clip for a dissolve.
- Detach a video's audio to an independent track, record voice-over, or upload music.
- Add/edit timed captions. Auto captions use the existing server transcription service
  and the selected source range, with timestamps mapped back onto the timeline.
- Pause for a question inserts a captured frame and an editable question for three
  seconds, splitting and shifting every existing track so it stays synchronised.
- Save/reopen projects. Export uses the same compositor/audio graph as preview.
  Finished exports can be downloaded or saved to Personal Files and lesson media.

Uploads are limited to 100 MB and one hour. Projects support up to 30 tracks and one
hour, with bounded edit metadata. Browser export runs in real time while the tab stays
visible. It chooses WebM with VP9/Opus or VP8/Opus where supported; MP4 is used only when
MediaRecorder supports it. MP4 output is not promised on every browser. Large exports
can be downloaded; library output must fit its 100 MB asset limit. Originals and exports
count towards storage, including explicit duplicate copies.

## AI and reusable media

Teachers can upload character artwork or generate a character through OpenAI's image
API. Each asset keeps its name, appearance notes, preferred voice notes, visual style
and generation provenance. Another view creates a new asset and preserves the original.

Six shared presets: 3D cartoon, 2D cartoon, illustrated storybook, clay animation,
paper cut-out, realistic video. Presets are prompting directions; exact appearance and
character consistency must be reviewed by the teacher before use.

Both prompt-only and script/scene workflows are available. Script paragraphs become
editable scene drafts, not an automatic AI storyboard. For several characters and/or a
background, make and review a composite scene image first, then animate that image.
Runway Gen-4.5 accepts a single starting image. Optional dialogue uses a separate
voice-over track; this does not guarantee lip synchronisation. Generated scenes and
references are saved to the private library for reuse.

Video creation runs server-side through the official Runway API. Character/scene images
use the official OpenAI Images API (`gpt-image-2.5-sunburst`). Provider keys never enter
browser code. No paid generations were run during implementation.

## Access and operational setup

Assets are private by default. Only the owner changes sharing. Sharing can target the
owner's organisation and/or connected colleagues. Recipients can reuse assets, but
cannot overwrite them or change sharing. Server checks and Firestore rules both enforce
these boundaries; learners and anonymous visitors cannot read source assets or projects.
Projects remain private; finished outputs can be shared independently.

Set server secrets `RUNWAYML_API_SECRET` and `OPENAI_API_KEY`. Set `VIDEO_AI_ENABLED=true`
only after checking provider access and billing. Without that flag, upload and editing
work and AI generation is disabled. No credentials are stored in this repository.

Deployment includes `videoStudio`, `refreshVideoJobs`, and the updated Firestore rules.
The scheduled finaliser saves completed video outputs even when the editor is closed.
Request IDs prevent repeated submissions from starting duplicate billed tasks. Defaults
are 120 generated video seconds and 10 images per teacher per UTC day; the platform cap
is 1,200 video seconds and 100 images per day. Override video seconds with
`VIDEO_DAILY_SECONDS` and `VIDEO_GLOBAL_DAILY_SECONDS`. Estimates currently use the
configured Gen-4.5 list rate of US$0.12/second; image and speech usage is additional.
Provider account balances and provider limits still apply.

Pending or failed requests are not silently restarted with new charges. A lost connection
before the provider task ID is saved may require manual review. No provider key or payment
settings are changed by the editor. Publication is verified through the production deployment workflow.

## Verification

```
node --test test/video-model.test.mjs test/video-provider.test.mjs
node test/video-access.mjs
```

The access test requires a real Firestore emulator on `127.0.0.1:8091`, loaded with the
repository rules and project `demo-video-editor`. It resets only that emulator project's
fixtures. Provider HTTP requests are intercepted in this test, never sent to paid services.

The browser harness uses `test/vite.config.ts`, the existing Firebase stand-ins and
`test/video-fixture.html` to make synthetic video/audio and reference artwork. Its AI
responses are marked Test preview and are simulated. This is not proof of live provider
quality or live billing access.

Verified in the browser: placement, playback, caption editing, duplication, project
save/reopen, real video export, re-upload of exported WebM, six presets, saved-reference
reuse, shortcut help/focus, typing guards, duplicate/undo shortcuts, pointer and keyboard
panel resizing, and panel layout persistence. Export inspection confirmed a
1280×720 VP9 stream and 48 kHz Opus audio. Live Runway/OpenAI generation, physical microphone
recording and cross-browser export have not been exercised.

Official integration references:
- https://docs.dev.runwayml.com/guides/using-the-api/
- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/reference/resources/images/methods/edit

## Publication additions

Video editor has a dedicated teal film/play icon in Apps, its own header and the browser
favicon. `/studio/video` opens a new project; saved projects retain their existing routes.

Use **Video in line** in the lesson/document insert menu, or **Embed a video** in an
instruction. Inline videos can sit wherever rich inline content is accepted, including
text, table cells, dialogue lines, text/email frames, reveal boxes and diagram cells.
The shared player keeps play limits, live teacher playback, volume, speed and script
visibility. Inline markup uses phrasing elements; videos keep their pictures and sound.
Worksheet exports retain inline media markers and QR media references.

**Brief → video** is the default AI flow. A teacher gives the audience, level, visual
style, length, optional saved characters and brief. OpenAI drafts complete original scene
scripts, actions, questions, suggested answers and teaching notes. The teacher can edit
all of these before selecting **Generate video from this script**. This final action
makes narration and reference scene images, submits/retrieves each video scene, and
appends the approved sequence to the timeline in a single undo step. Questions appear
on separate silent three-second still cards. Answers and teaching notes stay in the
review draft; they are not burnt into learner video. Narration is separate from mouth
movements. Scripts are bounded to fit 5- or 10-second scenes; overlong audio stops the
remaining generation so the teacher can shorten it or select a longer scene.

Completed media and stable job IDs are retained for continuing an interrupted generation.
Drafts are stored in this browser under the teacher's ID. Source media and edit projects
are stored on the server. Returning to the brief keeps the current script until a new
draft succeeds. Manual single-scene and script workflows remain available.

The deployment preflight reads only Runway secret metadata. When an enabled
`RUNWAYML_API_SECRET` exists, video generation is connected. If it is absent, the editor,
embeds and OpenAI planning still publish; the interface explains that Runway generation
needs connecting. This does not create credentials or change billing. Plan drafting has
separate limits of ten per teacher and one hundred across the platform per UTC day.

Additional verification: 17 editing/provider/schema/deployment tests and 13 real-emulator access and
service checks; browser verification of script editing before a single simulated
brief-to-timeline generation, plus decoded/playable teacher and learner inline videos in
text, a table, dialogue, an email frame and a reveal box. No paid generation was used.

The publisher declares the Runway secret only when video generation is connected. A disconnected Runway account does not block editing or OpenAI script planning. Cloud Scheduler must be enabled in the Google Cloud project for the background video finaliser; the deployment account cannot enable that API itself.
