/** Inline parenthetical directions retain their position in the performed script. */
export function performanceText(text: string): string { return text.replace(/\(([^()]*)\)/g, '[$1]'); }
export function spokenText(text: string): string { return text.replace(/\[[^\]]*\]|\([^()]*\)/g, '').replace(/ {2,}/g, ' ').trim(); }
