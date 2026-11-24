import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { IDENTITY_COLOURS, cleanIdentity, newIdentityId, refText, resolveRef, type ActivityIdentity, type RefAttrs, type RefTarget, type RefView } from '../lib/identity';
import { IDENTITY_ICONS, iconOf, iconSvg, searchIcons } from '../lib/identityIcons';
import './identity.css';

// The lesson a reference is read in: the activities it can point at and the versions this
// activity has. Without one (a message, a copy on its own), references show their last label.
// strict: the editor, where a reference whose target has gone is flagged. Elsewhere it shows its
// last label quietly (a learner may simply not see the target yet).
export type RefsValue = { targets: RefTarget[] | null; versions: string[]; here?: string; strict?: boolean };
export const RefsContext = createContext<RefsValue>({ targets: null, versions: [] });
export const useRefs = () => useContext(RefsContext);

export function Svg({ icon, size = '1em', stroke = 1.9 }: { icon: string; size?: string; stroke?: number }) {
  const html = iconSvg(icon, size, stroke);
  return html ? <span className="aid-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} /> : null;
}

// The Learner A / B sign. A is solid, B an outline, others a double outline.
export function VersionSign({ v }: { v: string }) {
  return <span className="vsign" data-v={v} aria-hidden="true">{v}</span>;
}

// The identity above a task heading.
export function IdentityMark({ identity, onClick }: { identity?: ActivityIdentity | null; onClick?: () => void }) {
  if (!identity) return null;
  const body = <>{identity.icon && <Svg icon={identity.icon} size="1.15em" stroke={2} />}<span>{identity.name}</span></>;
  return onClick ? (
    <button type="button" className="aid-mark" style={{ ['--aid' as string]: identity.colour }} onClick={onClick} title="Change the activity type">{body}</button>
  ) : (
    <span className="aid-mark" style={{ ['--aid' as string]: identity.colour }}>{body}</span>
  );
}

// An inline reference, at the size and baseline of a question number.
export function RefChip({ view, onClick, editing }: { view: RefView; onClick?: () => void; editing?: boolean }) {
  const text = refText(view);
  const tip = view.missing ? 'This activity is no longer in the lesson. Choose another or remove the reference.' : view.title ? `${text}: ${view.title}` : text;
  const inner = view.version ? (
    <><VersionSign v={view.version} /><span className="aref-t">{view.label}</span></>
  ) : (
    <>{view.icon && <Svg icon={view.icon} size="1.05em" stroke={2.1} />}<span className="aref-t">{view.label}{view.n ? <> <b>{view.n}</b></> : null}</span></>
  );
  const cls = 'aref' + (view.version ? ' aref-v' : '') + (view.icon ? ' has-icon' : '') + (view.missing ? ' is-missing' : '') + (editing ? ' is-editing' : '');
  const style = view.colour && !view.missing ? { ['--aid' as string]: view.colour } : undefined;
  return onClick ? (
    <button type="button" className={cls} style={style} title={tip} aria-label={view.missing ? `${text}, missing` : text} onClick={onClick}>{inner}</button>
  ) : (
    <span className={cls} style={style} title={tip}>{inner}</span>
  );
}

export function useRefView(attrs: RefAttrs) {
  const { targets, strict } = useRefs();
  return useMemo(() => {
    const v = resolveRef(attrs, targets);
    return v.missing && !strict ? { ...v, missing: false, id: undefined } : v;
  }, [attrs, targets, strict]);
}

// ----------------------------------------------------------------------------- choosing an identity

type DialogProps = {
  value: ActivityIdentity | null | undefined;
  used: ActivityIdentity[]; // identities already in this lesson, to reuse
  onSave: (identity: ActivityIdentity | null, scope: 'here' | 'all') => void;
  onClose: () => void;
};

export function IdentityDialog({ value, used, onSave, onClose }: DialogProps) {
  const [name, setName] = useState(value?.name ?? '');
  const [colour, setColour] = useState(value?.colour ?? IDENTITY_COLOURS[4].v);
  const [icon, setIcon] = useState(value?.icon ?? '');
  const [q, setQ] = useState('');
  const [id, setId] = useState(value?.id ?? '');
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
  }, []);
  const list = searchIcons(q);
  const groups = [...new Set(list.map((i) => i.group))];
  const preview = cleanIdentity({ id: id || 'preview', name: name || 'Activity type', colour, icon });
  const shared = !!(value && used.some((u) => u.id === value.id));
  const pick = (u: ActivityIdentity) => (setId(u.id), setName(u.name), setColour(u.colour), setIcon(u.icon));
  const save = (scope: 'here' | 'all') => {
    // "This activity only" makes a new type, so the others keep theirs.
    const v = cleanIdentity({ id: scope === 'here' && shared && id === value?.id ? newIdentityId() : id || newIdentityId(), name, colour, icon });
    if (v) onSave(v, scope);
  };
  return (
    <dialog ref={ref} className="aid-dialog" aria-labelledby={titleId} onCancel={(e) => (e.preventDefault(), onClose())} onClick={(e) => e.target === ref.current && onClose()}>
      <form method="dialog" className="aid-form" onSubmit={(e) => (e.preventDefault(), save('all'))}>
        <header className="aid-head">
          <h2 id={titleId}>Activity type</h2>
          <p>Give this activity a name, a colour and an icon. It shows above the activity, in links to it, on screen and on paper.</p>
        </header>
        {used.length > 0 && (
          <div className="aid-used">
            <span className="aid-cap">In this lesson</span>
            <div className="aid-used-row">
              {used.map((u) => (
                <button key={u.id} type="button" className={'aid-used-btn' + (u.id === id ? ' on' : '')} aria-pressed={u.id === id} onClick={() => pick(u)}>
                  <IdentityMark identity={u} />
                </button>
              ))}
              <button type="button" className={'aid-used-btn new' + (!id ? ' on' : '')} aria-pressed={!id} onClick={() => (setId(''), setName(''), setIcon(''))}>
                New type
              </button>
            </div>
          </div>
        )}
        <label className="aid-field">
          <span className="aid-cap">Name</span>
          <input className="input" value={name} maxLength={40} autoFocus placeholder="Activation, Pronunciation, Grammar…" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="aid-field">
          <span className="aid-cap" id={titleId + 'c'}>Colour</span>
          <div className="aid-colours" role="radiogroup" aria-labelledby={titleId + 'c'}>
            {IDENTITY_COLOURS.map((c) => (
              <button key={c.v} type="button" role="radio" aria-checked={colour === c.v} aria-label={c.label} title={c.label} className={'aid-swatch' + (colour === c.v ? ' on' : '')} style={{ ['--aid' as string]: c.v }} onClick={() => setColour(c.v)} />
            ))}
          </div>
        </div>
        <div className="aid-field aid-icons-field">
          <div className="aid-icons-top">
            <span className="aid-cap">Icon <small>{IDENTITY_ICONS.length} to choose from</small></span>
            <input className="input aid-search" type="search" value={q} placeholder="Find an icon: speaking, game, sound…" aria-label="Find an icon" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
          </div>
          <div className="aid-icons" style={{ ['--aid' as string]: colour }}>
            <button type="button" className={'aid-icon none' + (!icon ? ' on' : '')} aria-pressed={!icon} onClick={() => setIcon('')}>
              <span>No icon</span>
            </button>
            {groups.map((g) => (
              <div key={g} className="aid-icon-group" role="group" aria-label={g}>
                <span className="aid-group-cap">{g}</span>
                <div className="aid-icon-row">
                  {list.filter((i) => i.group === g).map((i) => (
                    <button key={i.key} type="button" className={'aid-icon' + (icon === i.key ? ' on' : '')} aria-pressed={icon === i.key} title={i.label} onClick={() => setIcon(i.key)}>
                      <Svg icon={i.key} size="22px" stroke={1.8} />
                      <span className="aid-icon-l">{i.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!list.length && <p className="hint">No icons match “{q}”. Try a shorter word.</p>}
          </div>
        </div>
        <div className="aid-preview" aria-label="Preview">
          <span className="aid-cap">Preview</span>
          <div className="aid-preview-card">
            {preview && <IdentityMark identity={preview} />}
            <p className="aid-preview-line">
              Work with your partner. Use the words from <RefChip view={{ label: preview?.name ?? 'Activity type', icon: preview?.icon, colour: preview?.colour, missing: false }} /> and take turns. <RefChip view={{ label: 'Learner A', version: 'A', missing: false }} /> starts.
            </p>
            {iconOf(icon) === undefined && !icon && <p className="aid-note">Without an icon, the name and colour show the type.</p>}
          </div>
        </div>
        <footer className="aid-foot">
          {value && <button type="button" className="btn link small" onClick={() => onSave(null, 'here')}>Remove from this activity</button>}
          <span className="aid-foot-r">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            {shared && id === value?.id && <button type="button" className="btn" disabled={!name.trim()} onClick={() => save('here')}>Save for this activity only</button>}
            <button type="submit" className="btn primary" disabled={!name.trim()}>{shared && id === value?.id ? 'Save for all activities of this type' : 'Save'}</button>
          </span>
        </footer>
      </form>
    </dialog>
  );
}
