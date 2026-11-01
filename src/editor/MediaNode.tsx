import { NSelect } from '../components/Select';
import { MediaBlockSchema, InlineMediaSchema } from './mediaSchema';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useState } from 'react';
import { Grip } from './nodes';
import { useEditorClass } from './context';
import { archiveGet, archiveUpdate, setManifestScript, type ScriptLine } from '../lib/archive';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MediaPlayer, SCRIPT_MODES, type ScriptMode } from '../media/Player';
import { MediaDialog, type MediaTab } from '../media/MediaDialog';
import { recordingEditorUrl } from '../lib/recordingScript';
import { useAuth } from '../lib/auth';
import { UiIcon } from '../components/UiIcon';

// A sound or a video in a task, with an optional karaoke script. The media itself lives with the
// class ("media" is its id there); the script lives with it, and with the archive entry, so it is
// the same in every lesson that uses it.

export type MediaAttrs = { media: string; archiveId: string; kind: 'audio' | 'video'; title: string; scriptMode: ScriptMode; plays: number; mute?: string[]; space?: string; size?: string };

// A new script for media in a class: through the archive when the teacher has it there, so
// every class that uses it gets the new script.
export async function saveScript(uid: string | undefined, classId: string, mediaId: string, archiveId: string, lines: ScriptLine[]) {
  const item = uid && archiveId ? await archiveGet(uid, archiveId).catch(() => null) : null;
  if (!item || !uid) return setManifestScript(classId, mediaId, lines);
  const here = (item.home?.classId === classId && item.home.mediaId === mediaId) || item.copies?.[classId] === mediaId;
  const it = here ? item : { ...item, copies: { ...(item.copies ?? {}), [classId]: mediaId } };
  if (!here) await updateDoc(doc(db, 'users', uid, 'archive', item.id), { copies: it.copies });
  await archiveUpdate(uid, it, { script: lines });
}

function MediaView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  const { classId } = useEditorClass();
  const { user, profile } = useAuth();
  const a = node.attrs as MediaAttrs;
  const inline = node.type.name === 'inlineMedia';
  const space = classId || a.space || (user ? `user:${user.uid}` : '');
  const [dialog, setDialog] = useState<MediaTab | null>(null);
  const label = a.kind === 'video' ? 'Video' : 'Recording';
  if (!editor.isEditable) return <NodeViewWrapper as={inline?'span':'div'} className={inline?'inline-media im-'+(a.size||'m'):'task-media'} contentEditable={false}><MediaPlayer inline={inline} classId={space} mediaId={a.media} title={a.title} scriptMode={a.scriptMode} plays={a.plays} teaching={profile?.role==='teacher'} mute={a.mute??[]}/></NodeViewWrapper>;

  return (
    <NodeViewWrapper as={inline ? 'span' : 'div'} className={(inline ? 'inline-media im-' + (a.size || 'm') : 'block-node') + ' md-node' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <div className="mcq-tools">
        <Grip editor={editor} getPos={getPos} />
        <span className="block-label">{a.media ? label : 'Sound or video'}</span>
        <button type="button" className="remove" style={{ marginLeft: 'auto' }} onClick={deleteNode}>
          Remove
        </button>
      </div>
      {!a.media ? (
        <div className="md-start">
          {(
            [
              ['record', 'mic', 'Record'],
              ['upload', 'upload', 'Upload sound or video'],
              ['archive', 'archive', 'Resources library'],
              ['link', 'link', 'YouTube or link'],
            ] as const
          ).map(([k, icon, l]) => (
            <button key={k} type="button" className="md-start-btn" onClick={() => setDialog(k)} disabled={!space}>
              <UiIcon name={icon} size={20} />
              {l}
            </button>
          ))}
          {!space && <span className="hint">Sounds and videos can be added inside a class.</span>}
        </div>
      ) : (
        <>
          <MediaPlayer inline={inline} classId={space} mediaId={a.media} title={a.title} scriptMode={a.scriptMode} plays={a.plays} teacher mute={a.mute ?? []} onMute={(m) => updateAttributes({ mute: m })} />
          <div className="md-settings">
            {inline && <label className="md-set"><span>Size</span><NSelect aria-label="Video size" value={a.size || 'm'} onChange={e => updateAttributes({size:e.target.value})}><option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option><option value="full">Full width</option></NSelect></label>}
            <label className="md-set">
              <span>Name</span>
              <input value={a.title} onChange={(e) => updateAttributes({ title: e.target.value })} onKeyDown={(e) => e.stopPropagation()} placeholder={label} />
            </label>
            <label className="md-set">
              <span>Script</span>
              <NSelect value={a.scriptMode} onChange={(e) => updateAttributes({ scriptMode: e.target.value })}>
                {SCRIPT_MODES.map((m) => (
                  <option key={m.k} value={m.k}>
                    {m.label}
                  </option>
                ))}
              </NSelect>
            </label>
            <label className="md-set">
              <span>Learners can play it</span>
              <NSelect value={a.plays} onChange={(e) => updateAttributes({ plays: Number(e.target.value) })}>
                <option value={0}>As often as they like</option>
                <option value={1}>Once</option>
                <option value={2}>Twice</option>
                <option value={3}>Three times</option>
              </NSelect>
            </label>
            <label className="check-row up-shrink">
              <input type="checkbox" checked={!!(a as MediaAttrs & { notes?: boolean }).notes} onChange={(e) => updateAttributes({ notes: e.target.checked })} />
              Comments at moments in it: for lesson observation and feedback
            </label>
            <span className="md-btns">
              <button type="button" className="btn small-btn" onClick={() => window.open(a.kind === 'video' ? `/studio/video/new?archive=${encodeURIComponent(a.archiveId)}` : recordingEditorUrl(space, a.media, a.archiveId), '_blank')}>
                <UiIcon name={a.kind === 'video' ? 'video' : 'script'} size={14} /> {a.kind === 'video' ? 'Edit video' : 'Edit in Recordings'}
              </button>
              <button type="button" className="btn small-btn" onClick={() => setDialog('record')}>
                Replace
              </button>
            </span>
          </div>
        </>
      )}
      {dialog && (
        <MediaDialog
          classId={space}
          tab={dialog}
          onClose={() => setDialog(null)}
          onPick={(p) => {
            updateAttributes({ media: p.mediaId, archiveId: p.archiveId, kind: p.kind, title: p.title, space: classId ? '' : space });
            setDialog(null);
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

export const MediaBlock = MediaBlockSchema.extend({addNodeView:()=>ReactNodeViewRenderer(MediaView)});

export const newMedia = () => ({ type: 'media', attrs: { media: '', archiveId: '', kind: 'audio', title: '', scriptMode: 'karaoke', plays: 0 } });

// Atomic inline node: can be placed inside any rich paragraph, including nested elements.
export const InlineMedia = InlineMediaSchema.extend({addNodeView:()=>ReactNodeViewRenderer(MediaView,{as:'span'})});
export const newInlineMedia = () => ({ type: 'inlineMedia', attrs: { ...newMedia().attrs, kind: 'video', scriptMode: 'none', size: 'm' } });
