import { Children, type ButtonHTMLAttributes, type ReactNode } from "react";
import { UiIcon } from "../components/UiIcon";
const textOf = (children: ReactNode): string =>
  Children.toArray(children)
    .filter((c) => typeof c === "string" || typeof c === "number")
    .join("");
const tools: [RegExp, string, string?][] = [
  [/^Save project$/, "videoSave", "⌘/Ctrl S"],
  [/^Save/, "videoSave"],
  [/^Export/, "export", "⌘/Ctrl E"],
  [/^Upload/, "upload"],
  [/^Record voice/, "mic"],
  [/^Stop recording/, "videoStop"],
  [/^Play$/, "videoPlay", "Space"],
  [/^Pause$/, "videoPause", "Space"],
  [/^Start$/, "prev", "Home"],
  [/^Undo$/, "videoUndo", "⌘/Ctrl Z"],
  [/^Redo$/, "videoRedo", "⌘/Ctrl Shift Z"],
  [/^Split/, "videoSplit", "⌘/Ctrl B"],
  [/^Ripple/, "videoRipple", "Shift Delete"],
  [/^Duplicate/, "copyall", "⌘/Ctrl D"],
  [/^Detach/, "videoDetach"],
  [/^Add caption$/, "videoCaptions", "C"],
  [/caption/i, "videoCaptions"],
  [/^Remove clip/, "trash", "Delete"],
  [/^Remove/, "trash"],
  [/^Pause for/, "videoPause"],
  [/^Share/, "groups"],
  [/^Make|^Generate/, "videoSparkles"],
  [/^Add|^Use script/, "plus"],
  [/^Cancel|^Close|^×$/, "videoClose"],
  [/^Back|^Move scene earlier/, "prev"],
  [/^Start a new/, "plus"],
  [/^Media$/, "archive"],
  [/^Characters$/, "person"],
  [/^Describe/, "videoSparkles"],
  [/^Script/, "videoCaptions"],
  [/^Keyboard/, "videoKeyboard"],
  [/^↑$/, "videoUp"],
  [/^Hide$/, "videoEye"],
  [/^M$/, "beep"],
];
export function VideoButton({
  children,
  icon,
  shortcut,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: string;
  shortcut?: string;
}) {
  const label = textOf(children),
    item = tools.find(([re]) => re.test(label)),
    name = icon || item?.[1] || "videoAction",
    hint = shortcut || item?.[2];
  if (
    props.className?.includes("vx-clip") ||
    props.className?.includes("vx-card")
  )
    return (
      <button type="button" {...props}>
        {children}
      </button>
    );
  return (
    <button
      type="button"
      {...props}
      className={["vx-button", props.className].filter(Boolean).join(" ")}
      title={
        props.title ||
        `${props["aria-label"] || label}${hint ? ` · ${hint}` : ""}`
      }
    >
      <UiIcon name={name} size={16} />
      <span>{children}</span>
    </button>
  );
}
export const VIDEO_SHORTCUTS = [
  ["Space", "Play / pause"],
  ["Home / End", "Go to start / end"],
  ["← / →", "Move 0.1 second"],
  ["Shift ← / →", "Move 1 second"],
  ["⌘/Ctrl S", "Save project"],
  ["⌘/Ctrl E", "Export video"],
  ["⌘/Ctrl B", "Split at playhead"],
  ["⌘/Ctrl D", "Duplicate selected clip"],
  ["⌘/Ctrl C / X / V", "Copy / cut / paste a clip"],
  ["⌘/Ctrl Z", "Undo"],
  ["⌘/Ctrl Shift Z", "Redo"],
  ["Delete / Backspace", "Remove selected clip"],
  ["Shift Delete", "Remove and close the gap on this track"],
  ["C", "Add a caption"],
  ["M", "Mute / unmute selected track"],
  ["V", "Open media library"],
  ["G", "Open character library"],
  ["A", "Open AI creation"],
  ["+ / −", "Zoom timeline"],
  ["?", "Show keyboard shortcuts"],
  ["Escape", "Close a menu or dialog"],
];
