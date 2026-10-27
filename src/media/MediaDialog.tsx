import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { archiveAdd, mediaIn, saveLink, youTubeId, type ArchiveItem, type ScriptLine } from '../lib/archive';
import { useAuth } from '../lib/auth';
import { decodeSound } from '../lib/sound';
import { ArchivePicker } from '../editor/Picture';
import { UiIcon } from '../components/UiIcon';
import { SoundEditor, type SoundSource } from './SoundEditor';
import { isVideoUrl } from './Player';

// Adding a sound or video: record it here, upload a sound file, use one from the resources library,
// or link to YouTube or a file on the web.

export type MediaTab = 'record' | 'upload' | 'archive' | 'link';
export type Picked = { mediaId: string; archiveId: string; kind: 'audio' | 'video'; title: string };
const MAX_MIN = 20;

export function MediaDialog({ classId, tab: start = 'record', onPick, onClose, folder = '', noArchive, file: dropped, onPictures }: { classId: string; tab?: MediaTab; onPick: (p: Picked) => void; onClose: () => void; folder?: string; noArchive?: boolean; file?: File; onPictures?: (files: File[]) => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<MediaTab>(start);
  const [source, setSource] = useState<SoundSource | null>(null);
  const [busy, setBusy] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  // In the resources library one window adds everything: pictures go straight in, a sound opens the editor.
  const take2 = (list: FileList | File[]) => {
    const files = Array.from(list);
    const pics = files.filter((f) => f.type.startsWith('image/'));
    if (pics.length && onPictures) {
      onPictures(pics);
      if (pics.length === files.length) return onClose();
    }
    const snd = files.find((f) => !f.type.startsWith('image/'));
    if (snd) void open(snd);
  };
  const open = async (f: File) => {
    setBusy('Opening the sound…');
    try {
      const buffer = await decodeSound(f);
      if (buffer.duration > MAX_MIN * 60) return setBusy(`That is ${Math.round(buffer.duration / 60)} minutes long. Sounds can be up to ${MAX_MIN} minutes: trim it first, or use a link.`);
      setBusy('');
      setSource({ buffer, name: f.name.replace(/\.[a-z0-9]+$/i, '') || 'Sound', file: f });
    } catch {
      setBusy('That file could not be opened as a sound. Try an MP3, M4A or WAV file.');
    }
  };
  // Recording opens the editor straight away, ready to record.
  const blank = (): SoundSource => ({ blank: true, recorded: true, name: 'Recording', buffer: new AudioBuffer({ length: 1, sampleRate: 48000 }) });
  const startedBlank = useRef(false);
  useEffect(() => {
    if (start === 'record' && !dropped) (startedBlank.current = true), setSource(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (dropped) void open(dropped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropped]);
  const fromArchive = async ([it]: ArchiveItem[]) => {
    if (!user || !it) return;
    setBusy('Adding…');
    try {
      const mediaId = await mediaIn(user.uid, it, classId);
      onPick({ mediaId, archiveId: it.id, kind: it.kind === 'video' ? 'video' : 'audio', title: it.name });
    } catch {
      setBusy('That could not be added.');
    }
  };
  const addLink = async () => {
    const u = url.trim();
    if (!user || !/^https:\/\/\S+$/.test(u)) return;
    setBusy('Adding…');
    const video = isVideoUrl(u);
    const name = title.trim() || (youTubeId(u) ? 'YouTube video' : decodeURIComponent(u.split('/').pop()?.split('?')[0] ?? '') || 'Link');
    try {
      const mediaId = await saveLink(classId, u, { title: name, video });
      const archiveId = await archiveAdd(user.uid, { kind: video ? 'video' : 'audio', name, folder, tags: [], size: 0, link: u, home: { classId, mediaId }, script: [] as ScriptLine[] });
      onPick({ mediaId, archiveId, kind: video ? 'video' : 'audio', title: name });
    } catch {
      setBusy('That link could not be added.');
    }
  };

  const TABS: { k: MediaTab; label: string; icon: string }[] = onPictures ? [
    { k: 'upload', label: 'Upload', icon: 'upload' },
    { k: 'record', label: 'Record', icon: 'mic' },
  ] : [
    { k: 'record', label: 'Record', icon: 'mic' },
    { k: 'upload', label: 'Upload', icon: 'upload' },
    { k: 'archive', label: 'Resources library', icon: 'archive' },
    { k: 'link', label: 'YouTube or link', icon: 'link' },
  ];
  const editing = !!source;
  if (source)
    return createPortal(
      <div className="sx-full" role="dialog" aria-label="Sound editor" onKeyDown={(e) => e.stopPropagation()}>
        <SoundEditor
          source={source}
          classId={classId}
          folder={folder}
          backLabel="Cancel"
          onBack={() => (source.blank && startedBlank.current ? onClose() : setSource(null))}
          onSaved={(s) => onPick({ mediaId: s.mediaId, archiveId: s.archiveId, kind: 'audio', title: s.title })}
        />
      </div>,
      document.body,
    );
  return createPortal(
    <div className="scrim" onClick={editing ? undefined : onClose}>
      <div className="dialog md-dialog" role="dialog" aria-label="Add a sound or video" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <div className="pic-dialog-head">
          <h2 style={{ margin: 0 }}>{editing ? 'Edit the sound' : onPictures ? 'Add media' : 'Add a sound or video'}</h2>
          {editing && (
            <button type="button" className="btn link" onClick={onClose}>
              Cancel
            </button>
          )}
        </div>
        {!editing && (
          <span className="md-tabs" role="tablist">
            {TABS.filter((t) => !(noArchive && t.k === 'archive')).map((t) => (
              <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={tab === t.k ? 'on' : ''} onClick={() => (t.k === 'record' ? setSource(blank()) : (setTab(t.k), setBusy('')))}>
                <UiIcon name={t.icon} size={16} />
                {t.label}
              </button>
            ))}
          </span>
        )}
        {tab === 'upload' || tab === 'record' ? (
          <>
            <div
              className={'pic-drop' + (over ? ' over' : '')}
              onDragOver={(e) => (e.preventDefault(), setOver(true))}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                if (e.dataTransfer.files.length) take2(e.dataTransfer.files);
              }}
              onClick={() => file.current?.click()}
              role="button"
              tabIndex={0}
            >
              <strong>{onPictures ? 'Choose pictures or a sound' : 'Choose a sound file'}</strong>
              <span className="hint">{onPictures ? `Pictures (JPG, PNG) go straight in. Sounds (MP3, M4A, WAV, up to ${MAX_MIN} minutes) open in the editor to trim and clean up. Or drop files here.` : `MP3, M4A, WAV or OGG, up to ${MAX_MIN} minutes. You can trim it, clean it up and make it smaller next.`}</span>
              <input ref={file} type="file" accept={onPictures ? 'image/*,audio/*,video/*' : 'audio/*,video/*'} multiple={!!onPictures} hidden onChange={(e) => (e.target.files && take2(e.target.files), (e.target.value = ''))} />
            </div>
            <span className="hint">A video file works too: its sound is kept. To show the video itself, put it on YouTube and use a link. Uploading video files needs file storage, which comes with the paid plan.</span>
          </>
        ) : tab === 'archive' ? (
          <ArchivePicker uid={user?.uid} kind="sound" onPick={fromArchive} busy={!!busy} />
        ) : (
          <>
            <label className="field">
              <span>Address</span>
              <input value={url} autoFocus placeholder="https://www.youtube.com/watch?v=…  or a link to an MP3 or MP4 file" onChange={(e) => setUrl(e.target.value)} />
            </label>
            {youTubeId(url) && <img className="md-yt" src={`https://img.youtube.com/vi/${youTubeId(url)}/mqdefault.jpg`} alt="" />}
            <label className="field">
              <span>Name</span>
              <input value={title} placeholder="For example: Unit 4 video" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <span className="hint">You can add a karaoke script after adding it. Nothing is uploaded, so links take no space.</span>
            <span className="pe-actions">
              <span style={{ flex: 1 }} />
              <button type="button" className="btn primary" disabled={!/^https:\/\/\S+$/.test(url.trim()) || !!busy} onClick={addLink}>
                Add
              </button>
            </span>
          </>
        )}
        {busy && !source && <span className="hint">{busy}</span>}
      </div>
    </div>,
    document.body,
  );
}
