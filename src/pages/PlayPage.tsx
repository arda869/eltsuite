import { useParams, useSearchParams } from 'react-router-dom';
import { Wordmark } from '../components/Wordmark';
import { useManifest } from '../lib/archive';
import { MediaPlayer, type ScriptMode } from '../media/Player';

// The page a worksheet's QR code opens: the sound or video with its script, on any phone,
// without signing in.
export function PlayPage() {
  const { classId = '', mediaId = '' } = useParams();
  const [q] = useSearchParams();
  const c = (q.get('c') ?? '').replace(/[^0-9a-f]/gi, '');
  const s = q.get('s') as ScriptMode | null;
  const m = useManifest(classId, mediaId);
  return (
    <div className="play-page" style={c.length === 6 ? ({ ['--accent' as string]: '#' + c, ['--accent-text' as string]: `color-mix(in srgb, #${c} 80%, #2b2a28)` } as React.CSSProperties) : undefined}>
      <header className="play-top">
        <Wordmark />
      </header>
      <main className="play-main">
        {m === null ? (
          <p className="placeholder">This sound or video isn’t here any more. Ask your teacher.</p>
        ) : (
          <>
            {m?.title && <h1 className="play-title">{m.title}</h1>}
            <MediaPlayer bare classId={classId} mediaId={mediaId} manifest={m} scriptMode={s && ['karaoke', 'after', 'button', 'none'].includes(s) ? s : 'karaoke'} />
          </>
        )}
      </main>
    </div>
  );
}
