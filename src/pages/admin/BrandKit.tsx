import { useState } from 'react';
import { PageHead, Panel } from './ui';

// Super Admin → Brand kit: the ELT Suite logos, colours, fonts and rules, each file ready to
// download. The files live in public/brand, so they are also what emails and partners link to.

const B = '/brand/';
type Logo = { file: string; name: string; use: string; ground: string; svg?: string };
const LOGOS: Logo[] = [
  { file: 'elt-suite-logo.png', name: 'Logo', use: 'The default, on white or light grounds.', ground: '#ffffff' },
  { file: 'elt-suite-logo-on-dark.png', name: 'Logo on dark', use: 'On dark grounds or the dark part of a photo.', ground: '#22211e' },
  { file: 'elt-suite-logo-on-accent.png', name: 'Logo on terracotta', use: 'On a solid terracotta ground.', ground: '#d98f63' },
  { file: 'elt-suite-logo-stacked.png', name: 'Stacked logo', use: 'Square spaces: posters, title slides.', ground: '#ffffff' },
];
const MARKS: Logo[] = [
  { file: 'elt-suite-mark.png', svg: 'elt-suite-mark.svg', name: 'Mark', use: 'App icon, favicon, avatars, email signature.', ground: '#f4f4f3' },
  { file: 'elt-suite-mark-mono-ink.png', svg: 'elt-suite-mark-mono-ink.svg', name: 'Mark in ink', use: 'One-colour print and stamps.', ground: '#ffffff' },
  { file: 'elt-suite-mark-outline-accent.png', name: 'Mark in terracotta', use: 'Watermarks and light touches.', ground: '#ffffff' },
  { file: 'elt-suite-mark-mono-white.png', name: 'Mark in white', use: 'On photos and dark grounds.', ground: '#33302c' },
];
const SOCIAL: Logo[] = [
  { file: 'elt-suite-social-avatar.png', name: 'Profile picture', use: '800 × 800. For social media and directories.', ground: '#f4f4f3' },
  { file: 'elt-suite-social-share.png', name: 'Share image', use: '1200 × 630. Shown when a link is shared.', ground: '#f4f4f3' },
];
const COLOURS = [
  { name: 'Terracotta', hex: '#d98f63', use: 'The brand colour. Logo, main buttons, rules. Use sparingly.' },
  { name: 'Terracotta text', hex: '#975f40', use: 'Links and small coloured text on white.' },
  { name: 'Ink', hex: '#33302c', use: 'Text. Never pure black.' },
  { name: 'Grey', hex: '#696969', use: 'Secondary text, captions, footers.' },
  { name: 'Surface', hex: '#f4f4f3', use: 'Quiet panels and email backgrounds.' },
  { name: 'Hairline', hex: '#e4e2df', use: 'Borders and dividers.' },
  { name: 'Right', hex: '#4e6b55', use: 'Correct answers only.' },
  { name: 'Wrong', hex: '#9a5148', use: 'Wrong answers and errors only.' },
];
const light = (hex: string) => ['#ffffff', '#f4f4f3', '#e4e2df'].includes(hex);

function Tile({ l, tall }: { l: Logo; tall?: boolean }) {
  return (
    <figure className="bk-tile">
      <div className="bk-art" style={{ background: l.ground, height: tall ? 200 : 140 }}>
        <img src={B + l.file} alt={l.name} />
      </div>
      <figcaption>
        <b>{l.name}</b>
        <span>{l.use}</span>
        <span className="bk-dl">
          <a href={B + l.file} download>
            PNG
          </a>
          {l.svg && (
            <a href={B + l.svg} download>
              SVG
            </a>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

export function BrandKit() {
  const [copied, setCopied] = useState('');
  const copy = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(hex);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      setCopied('');
    }
  };
  return (
    <>
      <PageHead
        title="Brand kit"
        lede="ELT Suite’s logos, colours and fonts. Download what you need, or everything at once."
        actions={
          <a className="btn primary" href={B + 'elt-suite-brand-kit.zip'} download>
            Download everything
          </a>
        }
      />
      <div className="bk">
        <Panel title="Logos">
          <p className="hint">Leave space around the logo equal to half the mark’s height. Don’t recolour, stretch or outline it.</p>
          <div className="bk-grid">{LOGOS.map((l) => <Tile key={l.file} l={l} />)}</div>
        </Panel>
        <Panel title="The mark">
          <p className="hint">The mark on its own, for small spaces. SVG files scale to any size, so send those to printers.</p>
          <div className="bk-grid">{MARKS.map((l) => <Tile key={l.file} l={l} />)}</div>
        </Panel>
        <Panel title="Colours">
          <p className="hint">Press a colour to copy its code.</p>
          <div className="bk-cols">
            {COLOURS.map((c) => (
              <button key={c.hex} type="button" className="bk-col" onClick={() => copy(c.hex)} aria-label={`Copy ${c.name}, ${c.hex}`}>
                <span className="bk-sw" style={{ background: c.hex, boxShadow: light(c.hex) ? 'inset 0 0 0 1px #e4e2df' : undefined }} />
                <b>{c.name}</b>
                <code>{copied === c.hex ? 'Copied' : c.hex}</code>
                <span>{c.use}</span>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Fonts">
          <div className="bk-fonts">
            <div className="bk-font">
              <p style={{ fontFamily: 'var(--serif)', fontSize: 34, margin: 0 }}>Fraunces</p>
              <p className="hint">For everything people read: headings, lessons, worksheets.</p>
              <a href={B + 'Fraunces.ttf'} download>
                Download Fraunces
              </a>
            </div>
            <div className="bk-font">
              <p style={{ fontFamily: 'var(--sans)', fontSize: 34, fontWeight: 800, margin: 0 }}>Karla</p>
              <p className="hint">For everything people press or scan: buttons, labels, menus.</p>
              <a href={B + 'Karla.ttf'} download>
                Download Karla
              </a>
            </div>
          </div>
        </Panel>
        <Panel title="Social">
          <div className="bk-grid">{SOCIAL.map((l) => <Tile key={l.file} l={l} tall />)}</div>
        </Panel>
        <Panel title="How we write">
          <ul className="bk-rules">
            <li>“You” for the reader. Teachers and learners, never students or users.</li>
            <li>Short sentences and everyday words, in British English.</li>
            <li>Sentence case. Buttons say what happens: “Make a class”.</li>
            <li>No exclamation marks, emoji or hype.</li>
          </ul>
          <a href={B + 'brand-guide.md'} download>
            Download the full brand guide
          </a>
        </Panel>
      </div>
    </>
  );
}
