// JSON is data, never executable markup. Prevent closing the script element even in
// a teacher's pasted text, and retain a CSP that blocks all network use after download.
export function offlineHtml(title:string,data:unknown,js:string,css:string){
 const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; worker-src blob:"><title>${esc(title)} · ELT Suite</title><style>${css.replace(/<\/style/gi,'<\\/style')}</style></head><body><div id="root"></div><noscript>Enable JavaScript to teach this ELT Suite offline file.</noscript><script id="offline-data" type="application/json">${JSON.stringify(data).replace(/</g,'\\u003c')}</script><script>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
}
