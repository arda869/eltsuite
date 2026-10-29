// The look of every ELT Suite email. One frame, and small pieces to build an email from.
// Emails can't run scripts, so "interactive" here means links, buttons and a few touches that only
// some apps show (hover, a reveal, a gentle pulse). Every email still reads well without them.
export const SITE = 'https://eltsuite.com';
const ASSETS = `${SITE}/email`;

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const C = { ink: '#33302c', muted: '#696969', hair: '#e7e5e1', bg: '#f4f3f1', paper: '#ffffff', soft: '#faf5f1', accent: '#d98f63', accentText: '#975f40' };
const SERIF = "'Fraunces',Georgia,'Times New Roman',serif";
const SANS = "'Karla','Segoe UI',Arial,sans-serif";

// brand: { color, logo, name } for an organisation's own look. Leave it out for ELT Suite's.
export function frame({ title, preview = '', body, footer = '', brand = {} }) {
  const accent = brand.color || C.accent;
  const logo = brand.logo
    ? `<img src="${esc(brand.logo)}" alt="${esc(brand.name)}" height="40" style="height:40px;width:auto;border:0;display:block">`
    : `<img src="${ASSETS}/logo.png" alt="ELT Suite" width="170" height="40" style="width:170px;height:40px;border:0;display:block">`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Karla:wght@400;700;800&display=swap" rel="stylesheet">
<style>
  body{margin:0;padding:0;background:${C.bg}}
  a.btn:hover{filter:brightness(.92)}
  a.chip:hover{background:${accent}!important;color:#fff!important}
  .pulse{animation:pulse 2.4s ease-in-out infinite}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
  details summary{cursor:pointer;list-style:none}
  @media (max-width:620px){.card{border-radius:0!important}.pad{padding:24px 20px!important}.two td{display:block!important;width:100%!important}}
  @media (prefers-color-scheme:dark){
    body,.outer{background:#1f1d1b!important}.card{background:#2a2826!important}
    .ink{color:#ece7df!important}.muted{color:#b1aba2!important}.soft{background:#34302d!important}
  }
</style></head>
<body>
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preview)}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" class="outer" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
    <tr><td style="padding:0 4px 18px">${logo}</td></tr>
    <tr><td class="card" style="background:${C.paper};border-radius:16px;overflow:hidden;border:1px solid ${C.hair}">
      <div style="height:4px;background:${accent}"></div>
      ${body}
    </td></tr>
    <tr><td class="muted" style="padding:20px 8px 0;font:13px/1.6 ${SANS};color:${C.muted}">
      ${footer}<br>
      <a href="${SITE}" style="color:${C.muted}">ELT Suite</a> · tools for English language teachers
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

// The pieces. Each returns HTML for inside frame().
export const pad = (html) => `<div class="pad" style="padding:30px 36px">${html}</div>`;
export const kicker = (t, accent = C.accentText) => `<p style="margin:0 0 8px;font:800 12px/1 ${SANS};letter-spacing:.12em;text-transform:uppercase;color:${accent}">${esc(t)}</p>`;
export const h1 = (t) => `<h1 class="ink" style="margin:0 0 14px;font:600 26px/1.25 ${SERIF};color:${C.ink}">${esc(t)}</h1>`;
export const h2 = (t) => `<h2 class="ink" style="margin:26px 0 10px;font:600 19px/1.3 ${SERIF};color:${C.ink}">${esc(t)}</h2>`;
export const p = (html) => `<p class="ink" style="margin:0 0 14px;font:16px/1.65 ${SERIF};color:${C.ink}">${html}</p>`;
export const small = (html) => `<p class="muted" style="margin:0 0 12px;font:14px/1.6 ${SANS};color:${C.muted}">${html}</p>`;
export const hero = (src, alt) => `<img src="${esc(src)}" alt="${esc(alt)}" width="600" style="width:100%;max-width:600px;height:auto;display:block;border:0">`;
export const button = (href, label, color = C.accent) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr><td class="pulse" style="border-radius:10px;background:${color}"><a class="btn" href="${esc(href)}" style="display:inline-block;padding:13px 24px;font:700 16px/1 ${SANS};color:#fff;text-decoration:none;border-radius:10px">${esc(label)}</a></td></tr></table>`;
export const textLink = (href, label) => `<a href="${esc(href)}" style="color:${C.accentText};font:700 15px ${SANS};text-decoration:underline">${esc(label)}</a>`;
export const callout = (html, accent = C.accent) =>
  `<div class="soft" style="margin:18px 0;padding:16px 18px;background:${C.soft};border-left:4px solid ${accent};border-radius:8px;font:15px/1.6 ${SANS};color:${C.ink}">${html}</div>`;
export const code = (c) =>
  `<div style="margin:18px 0;text-align:center"><span style="display:inline-block;padding:14px 26px;border:2px dashed ${C.accent};border-radius:12px;font:800 28px/1 ${SANS};letter-spacing:.18em;color:${C.ink}">${esc(c)}</span></div>`;
export const list = (items) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 16px">${items
    .map((t, i) => `<tr><td valign="top" style="padding:4px 12px 4px 0"><span style="display:inline-block;width:24px;height:24px;border-radius:12px;background:${C.accent};color:#fff;font:800 13px/24px ${SANS};text-align:center">${i + 1}</span></td><td class="ink" style="padding:4px 0;font:16px/1.55 ${SERIF};color:${C.ink}">${t}</td></tr>`)
    .join('')}</table>`;
export const chips = (opts) =>
  `<div style="margin:10px 0 18px">${opts.map(([label, href]) => `<a class="chip" href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:9px 16px;border:1.5px solid ${C.accent};border-radius:20px;font:700 14px ${SANS};color:${C.accentText};text-decoration:none">${esc(label)}</a>`).join('')}</div>`;
export const card = ({ img, title, meta, href }) =>
  `<table role="presentation" class="two soft" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:${C.soft};border-radius:12px;overflow:hidden"><tr>
    <td width="170" style="width:170px"><img src="${esc(img)}" alt="" width="170" style="width:100%;height:auto;display:block;border:0"></td>
    <td style="padding:16px 18px"><p class="ink" style="margin:0 0 4px;font:600 18px/1.3 ${SERIF};color:${C.ink}">${esc(title)}</p><p class="muted" style="margin:0 0 10px;font:14px/1.5 ${SANS};color:${C.muted}">${esc(meta)}</p>${textLink(href, 'Open the class')}</td>
  </tr></table>`;
export const reveal = (q, a) =>
  `<details style="margin:14px 0;padding:14px 18px;border:1px solid ${C.hair};border-radius:10px"><summary class="ink" style="font:700 15px ${SANS};color:${C.ink}">${esc(q)} <span style="color:${C.accentText}">Show the answer</span></summary><p class="ink" style="margin:10px 0 0;font:16px/1.6 ${SERIF};color:${C.ink}">${a}</p></details>`;
export const rule = () => `<div style="height:1px;background:${C.hair};margin:26px 0"></div>`;
