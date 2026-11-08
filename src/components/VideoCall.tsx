import { UiIcon } from './UiIcon';
import type { ClassDoc } from '../lib/classes';
import { openCall, useOpenCall } from '../lib/calls';
import { getClassVideoToken } from '../lib/classVideo';
import { tell } from '../lib/ask';

// The class's own video room (made by scripts/video.mjs). Teachers join as hosts: mute, remove,
// share the screen. It opens in the Rooms call window, beside the lesson or the whole screen.
export async function joinClassVideo(c: Pick<ClassDoc, 'id' | 'name' | 'video'>, _teacher?: boolean, room?: { url: string; title: string }) {
  if (!room && !c.video?.url) return;
  try {
    const token = room ? undefined : await getClassVideoToken(c.id);
    openCall({ url: room?.url ?? c.video!.url, title: room?.title ?? c.name, sub: room ? c.name : 'Class video room', kind: 'video', token, classId: c.id, classMain: !room, tokenIssuedAt: token ? Date.now() : undefined });
  } catch {
    void tell('We couldn’t open this class video room. Please try again.');
  }
}

// The button that opens it: shown once the class has its room.
export function VideoButton({ c, teacher }: { c: ClassDoc; name?: string; teacher?: boolean }) {
  const open = useOpenCall();
  if (!c.video?.url) return teacher ? <span className="hint vc-soon" data-tip="Each class gets its own video room within a few minutes of being set up." aria-label="Video room on its way"><UiIcon name="video" size={16}/><span className="vc-pending-label">Video room on its way</span></span> : null;
  // The organisation has used its call minutes for this month: the room opens again on the 1st.
  if (c.video?.paused)
    return (
      <span className="hint vc-soon" data-tip="Your organisation has used its call minutes for this month. The room opens again on the 1st, or when the limit is raised.">
        Video paused until next month
      </span>
    );
  const here = open?.classId === c.id;
  return (
    <button type="button" className={'btn small-btn vc-join' + (here ? ' on' : '')} disabled={here} onClick={() => void joinClassVideo(c, teacher)}>
      <UiIcon name="video" size={15} /> {here ? 'In the video room' : teacher ? 'Start video' : 'Join video'}
    </button>
  );
}
