import { useEffect, useState } from 'react';
import { callOn, openCall, type ChatCall } from '../lib/calls';
import { chatTitle, type Chat, type Msg, type Person } from '../lib/chat';
import { KIND_LABEL, useSharedDoc, type DocKind } from '../lib/sharedDocs';
import { filePdfInfo, type PageSize } from '../pdf/pdfData';
import { PdfThumb } from '../pdf/PdfStack';
import { FileIcon, type FileKind } from './FileIcon';
import { UiIcon } from './UiIcon';
import { extOf, fileKindName, sizeText } from '../lib/fileStore';

// Messages that are more than words: a call (on now, or how long it was) and a file from Files
// (a preview of it, to open with one tap).

// A call in the chat. Older messages only say "Started a video call".
export function callOf(m: Msg): { kind: 'audio' | 'video'; at: number } | null {
  if (m.call) return m.call;
  if (m.text === 'Started a video call') return { kind: 'video', at: m.at };
  if (m.text === 'Started an audio call') return { kind: 'audio', at: m.at };
  return null;
}
const mins = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m < 1 ? 'less than a minute' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
};
export function CallCard({ m, c, me, mine }: { m: Msg; c: Chat; me: Person; mine: boolean }) {
  const k = callOf(m)!;
  const call = (c as Chat & { call?: ChatCall }).call;
  // The chat keeps its latest call: this one, if they started together.
  const same = !!call && Math.abs(call.at - k.at) < 60000;
  const on = same && !!callOn(c);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => tick((n) => n + 1), 30000);
    return () => window.clearInterval(id);
  }, [on]);
  const who = mine ? 'You' : (c.names[m.by] ?? m.name).split(' ')[0];
  const ended = same && call?.ended ? call.ended : null;
  const missed = same && !on && !mine && (call?.declined ?? []).includes(me.key);
  const status = on ? `On now · ${mins(Date.now() - k.at)}` : ended ? mins(ended - k.at) : missed ? 'You didn’t answer' : 'Ended';
  return (
    <div className={'msg-call' + (on ? ' on' : '')}>
      <span className="msg-call-ic" aria-hidden="true">
        <UiIcon name={k.kind === 'video' ? 'video' : 'phone'} size={20} />
      </span>
      <span className="msg-call-t">
        <b>{k.kind === 'video' ? 'Video call' : 'Audio call'}</b>
        <span>
          {who} started it · {status}
        </span>
      </span>
      {on && call && (
        <button type="button" className="btn small-btn primary" onClick={() => openCall({ url: call.url, title: chatTitle(c, me.key), kind: call.kind, chatId: c.id, code: call.code })}>
          Join
        </button>
      )}
    </div>
  );
}

// A file from Files. Older messages only have its link (…/doc/<id>) in the text.
export function fileOf(m: Msg): string | null {
  if (m.file?.id) return m.file.id;
  const x = /\/doc\/([A-Za-z0-9_-]{8,})(?![\w/])/.exec(m.text ?? '');
  return x ? x[1] : null;
}
export function FileCard({ id, hint }: { id: string; hint?: Msg['file'] }) {
  const d = useSharedDoc(id);
  const kind = (d?.kind ?? hint?.kind ?? 'doc') as DocKind;
  const title = d?.title || hint?.title || 'A file';
  const owner = d?.ownerName || hint?.ownerName || '';
  const [page, setPage] = useState<PageSize | null>(null);
  useEffect(() => {
    if (kind !== 'pdf') return;
    let live = true;
    filePdfInfo(id).then((i) => live && setPage(i?.pages?.[0] ?? null), () => {});
    return () => void (live = false);
  }, [id, kind]);
  const what = kind === 'file' && d?.file ? `${fileKindName(d.file.name)} · ${sizeText(d.file.bytes)}` : KIND_LABEL[kind] ?? 'File';
  const sub = kind === 'file' && d?.file ? extOf(d.file.name) : undefined;
  return (
    <a className={'msg-file k-' + kind} href={`/doc/${id}`} target="_blank" rel="noopener">
      <span className="msg-file-prev" aria-hidden="true">
        {kind === 'pdf' && page ? <PdfThumb src={'file:' + id} n={0} size={page} /> : <FileIcon kind={kind as FileKind} size={54} sub={sub} />}
      </span>
      <span className="msg-file-t">
        <b>{title}</b>
        <span>
          {what}
          {owner ? ` · ${owner}` : ''}
        </span>
      </span>
      <span className="msg-file-open">
        Open <UiIcon name="next" size={13} />
      </span>
    </a>
  );
}
