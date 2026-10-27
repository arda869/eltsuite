import type { Chat } from '../lib/chat';
import type { CallKind } from '../lib/calls';
import { UiIcon } from '../components/UiIcon';
import { PersonFace } from '../components/avatars';

// Small parts shared by Rooms and its call history.

const otherIn = (c: Chat, me: string) => c.members.find((k) => k !== me) ?? '';

// A chat's face: the other person, or the group.
export function Face({ c, me }: { c: Chat; me: string }) {
  if (c.kind === 'group')
    return (
      <span className="rm-face rm-group" aria-hidden="true">
        <UiIcon name="groups" size={18} />
      </span>
    );
  const o = otherIn(c, me);
  return <PersonFace id={o} name={c.names[o]} size={38} status={c.roles?.[o] === 'teacher'} className="rm-face" />;
}

// Audio and video buttons, side by side.
export function CallPair({ name, busy, onCall, again }: { name: string; busy: boolean; onCall: (k: CallKind) => void; again?: boolean }) {
  const who = again ? `${name} again` : `with ${name}`;
  return (
    <span className="rm-pair">
      <button type="button" className="rm-ic" disabled={busy} onClick={() => onCall('audio')} aria-label={`Audio call ${who}`} data-tip="Audio call">
        <UiIcon name="phone" size={17} />
      </button>
      <button type="button" className="rm-ic" disabled={busy} onClick={() => onCall('video')} aria-label={`Video call ${who}`} data-tip="Video call">
        <UiIcon name="video" size={18} />
      </button>
    </span>
  );
}

