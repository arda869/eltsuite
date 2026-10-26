import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { archiveAdd, mediaIn, saveLink, youTubeId, type ArchiveItem, type ScriptLine } from '../lib/archive';
import { useAuth } from '../lib/auth';
import { decodeSound } from '../lib/sound';
import { ArchivePicker } from '../editor/Picture';
import { UiIcon } from '../components/UiIcon';
import { Recorder, type Take } from './Recorder';
import { SoundEditor, type SoundSource } from './SoundEditor';
import { isVideoUrl } from './Player';

// Adding a sound or video: record it here, upload a sound file, use one from the media archive,
// or link to YouTube or a file on the web.

export type MediaTab = 'record' | 'upload' | 'archive' | 'link';
export type Picked = { mediaId: string; archiveId: string; kind: 'audio' | 'video'; title: string };
const MAX_MIN = 20;

export function MediaDialog({ classId, tab: start = 'record', onPick, onClose }: { classId: string; tab?: MediaTab; onPick: (p: Picked) => void; onClose: () => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<MediaTab>(start);
  const [source, setSource] = useState<SoundSource | null>(null);
  const [take, setTake] = useState<Take | null>(null); // kept so "Record again" goes back to it
  const [busy, setBusy] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const open = async (f: File) => {
    setBusy('Opening the sound…');
    try {
      const buffer = await decodeSound(f);
      if (buffer.duration > MAX_MIN * 60) return setBusy(`That is ${Math.round(buffer.duration / 60)} minutes long. Sounds can be up to ${MAX_MIN} minutes: trim it first, or use a link.`);
      setBusy('');
      setSource({ buffer, name: f.name.replace(/\.[a-z0-9]+$/i, '') || 'Sound' });
    } catch {
      setBusy('That file could not be opened as a sound. Try an MP3, M4A or WAV file.');
    }
  };
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
      const archiveId = await archiveAdd(user.uid, { kind: video ? 'video' : 'audio', name, folder: '', tags: [], size: 0, link: u, home: { classId, mediaId }, script: [] as ScriptLine[] });
      onPick({ mediaId, archiveId, kind: video ? 'video' : 'audio', title: name });
    } catch {
      setBusy('That link could not be added.');
    }
  };

  const TABS: { k: MediaTab; label: string; icon: string }[] = [
    { k: 'record', label: 'Record', icon: 'mic' },
    { k: 'upload', label: 'Upload', icon: 'upload' },
    { k: 'archive', label: 'Media archive', icon: 'archive' },
    { k: 'link', label: 'YouTube or link', icon: 'link' },
  ];
  const editing = !!source;
  return createPortal(
    <div className="scrim" onClick={editing ? undefined : onClose}>
      <div className="dialog md-dialog" role="dialog" aria-label="Add a sound or video" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <div className="pic-dialog-head">
          <h2 style={{ margin: 0 }}>{editing ? 'Edit the sound' : 'Add a sound or video'}</h2>
          {editing && (
            <button type="button" className="btn link" onClick={onClose}>
              Cancel
            </button>
          )}
        </div>
        {!editing && (
          <span className="md-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={tab === t.k ? 'on' : ''} onClick={() => (setTab(t.k), setBusy(''))}>
                <UiIcon name={t.icon} size={16} />
                {t.label}
              </button>
            ))}
          </span>
        )}
        {source ? (
          <SoundEditor
            source={source}
            classId={classId}
            backLabel={source.recorded ? 'Record again' : 'Choose another file'}
            onBack={() => setSource(null)}
            onSaved={(s) => onPick({ mediaId: s.mediaId, archiveId: s.archiveId, kind: 'audio', title: s.title })}
          />
        ) : tab === 'record' ? (
          <Recorder
            initial={take}
            onDone={(s, t) => {
              setTake(t);
              setSource(s);
            }}
            onCancel={onClose}
          />
        ) : tab === 'upload' ? (
          <>
            <div
              className={'pic-drop' + (over ? ' over' : '')}
              onDragOver={(e) => (e.preventDefault(), setOver(true))}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                const f = e.dataTransfer.files[0];
                if (f) open(f);
              }}
              onClick={() => file.current?.click()}
              role="button"
              tabIndex={0}
            >
              <strong>Choose a sound file</strong>
              <span className="hint">MP3, M4A, WAV or OGG, up to {MAX_MIN} minutes. You can trim it, clean it up and make it smaller next.</span>
              <input ref={file} type="file" accept="audio/*,video/*" hidden onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} />
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
