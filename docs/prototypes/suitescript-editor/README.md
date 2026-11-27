# SuiteScript editor interaction concept

Open [suitescript-editor-concept.html](./suitescript-editor-concept.html) locally in a browser. The adjacent `suitescript-spell.js` file is required for spelling suggestions. The screenshots show the Classes lesson editor in rich text, the right-click menu, and the in-place SuiteScript view.

## Approved interaction

- Start in the existing rich text task field. Right-click inside its content and choose **Edit as SuiteScript**. The source editor replaces that field in the same pane; it is not a modal or an extra tab. The learner preview remains beside it.
- Valid changes update the preview immediately. In production, they should update only the current content field of the current learner version. There is no Apply button or persistent success banner. An incomplete command keeps the last valid content in the preview. Closing with an incomplete command asks whether to discard it.
- The source toolbar groups **Undo**, **Paste**, and **Copy all**. Spelling and Find are compact icon controls; Find is last before the close button. The close button returns to rich text.
- Typing `@` offers compact command suggestions. Choosing a command inserts its full template. **Tab** advances through placeholders; **Shift+Tab** goes back. With selected source text, Ctrl/Cmd+B, I, or U wraps it in `@bold`, `@italic`, or `@underline`.
- **Find and replace** opens by button or Ctrl/Cmd+F; Ctrl/Cmd+H focuses Replace. The spelling panel underlines prose mistakes and offers replacements. Errors show an exclamation beside the source line number and details in the bottom status tooltip.
- Media templates use `@image("reference", alt: "description")`, `@audio("reference")`, and `@video("reference")`. Their first placeholder offers **Browse My Files**, **Browse Organisation Files**, or **Type a reference**. Browsing is designed to use the existing `AddWindow` and `FileBrowser` pattern; choosing a file inserts its permanent reference, then selects the next placeholder.

## Implementation boundaries

This is an interactive **design prototype**, not a production editor. It uses example content and file references. The local HTML does not save to ELT Suite, authenticate, inspect file permissions, or connect to the real file library. The production integration must use the existing SuiteScript parser and reference resolver, and keep teacher-only keys out of learner projections.

The current `AddWindow` supports My Files. Organisation Files browsing and SuiteScript reference resolution require additional access-aware work before that choice can function in production. A typed reference must be validated against the user's permission to use it; knowing an ID must not grant access.

The bundled spelling demo uses `nspell` and `dictionary-en`; notices are in [licenses](./licenses). Its suggestions illustrate the intended interaction. Product integration should use the app's chosen English variants and ignore commands and file IDs.

The newer user direction for edits to take effect as they are made supersedes the older Friday Wishes draft/Apply wording. Confirm persistence, undo, and error recovery against the actual Classes, standalone lesson, Resource Hub, and Collab editors when implementing.
