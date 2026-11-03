import { useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useAuth } from '../lib/auth';
import { useMyDocs, newSharedDoc } from '../lib/sharedDocs';
import { gameApi } from './api';
import { GameSession } from './GameSession';
function View({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
    const { user } = useAuth();
    const { mine } = useMyDocs(user?.uid);
    const [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const match = window.location.pathname.match(/^\/class\/([^/]+)/);
    const docMatch = window.location.pathname.match(/^\/doc\/([^/]+)/);
    const target = match ? { type: 'class', id: match[1] } : docMatch ? { type: 'doc', id: docMatch[1] } : null;
    return <NodeViewWrapper contentEditable={false}>{node.attrs.sessionId ? <GameSession id={node.attrs.sessionId}/> : <section className="game-workspace"><h3>Add a game</h3>{error && <p role="alert">{error}</p>}{!target && <p>Save and open this class lesson or document before inserting a game.</p>}{mine?.filter(d => d.kind === 'game').map(d => <button type="button" className="btn" key={d.id} disabled={busy || !target} onClick={async () => { setBusy(true); try {
        const r = await gameApi('publish', { id: d.id, target });
        updateAttributes({ sessionId: r.id });
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }}>{d.title}</button>)}<button type="button" className="btn" disabled={!user || busy} onClick={async () => { if (!user)
        return; setBusy(true); const w = window.open('about:blank', '_blank'); try {
        const id = await newSharedDoc({ uid: user.uid, name: user.displayName || 'Teacher' }, 'game');
        if (w)
            w.location.href = '/doc/' + id;
        else
            window.location.href = '/doc/' + id;
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }}>Create a new game</button><p>Save the game, return here and choose it. Each inserted game uses a saved copy.</p></section>}{editor.isEditable && <button type="button" className="btn" onClick={deleteNode}>Remove game</button>}</NodeViewWrapper>;
}
export const GameNode = Node.create({ name: 'classroomGame', group: 'block', atom: true, draggable: true, addAttributes: () => ({ id: { default: '' }, sessionId: { default: '' } }), parseHTML: () => [{ tag: 'div[data-classroom-game]' }], renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-classroom-game': '' })], addNodeView: () => ReactNodeViewRenderer(View) });
