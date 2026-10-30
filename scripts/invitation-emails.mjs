// Invitation copy approved from the user's Drive document. Pure builders: no mail is sent here.
import { frame, pad, h1, h2, p, small, button, list, rule, code as codeBlock, esc, SITE } from './email-layout.mjs';
const intro = 'ELT Suite is made by English teachers, for English teachers. The board, the coursebook, the worksheets and your marking pen are all in one place, online:';
const benefits = (full = true) => [
  'Plan in minutes. Write a lesson like a document, with questions that mark themselves, sound and pronunciation inside.',
  `Teach it live. Every learner’s screen follows yours, in class or online${full ? ', and you see their answers as they come in' : ''}.`,
  'Print it beautifully. Any lesson becomes a worksheet that looks like a coursebook page.',
  `See who needs help. Answers, marking and attendance in one place${full ? ', with a recap for learners afterwards' : ''}.`,
];
const greeting = (name) => name?.trim() ? `Hello ${name.trim().split(/\s+/)[0]},` : 'Hello,';
const about = (org) => `Your lessons, files and messages stay yours. ${org}’s admins see your name, email, job title and your class lists, and they can choose some settings for you, such as which apps you have and how much space. The teachers at ${org} become your colleagues.`;
const subject = (s) => String(s).replace(/[\r\n]+/g, ' ');
export function organisationInvitation(d, id, existing) {
  const org = d.orgName || 'your organisation';
  const title = existing ? `Join your colleagues at ${org}` : 'Your whole job in one account';
  const preview = existing ? 'Share lessons and folders with your colleagues there. Your own work stays yours.' : `Plan, teach live and follow every learner, in one place. ${(d.byName || 'An admin').split(' ')[0]} has set it up for you.`;
  const sentence = `${d.byName || 'An admin'} ${existing ? 'would like you to join' : 'has made you a place at'} ${org} in ELT Suite${d.admin ? ', as one of its admins' : ''}.`;
  const features = existing ? [
    `The teachers at ${org} become your colleagues, so sharing lessons and folders with them takes one step.`,
    `You get ${org}’s shared folders and its look on your worksheets.`,
    'Your account, classes, lessons and files stay yours.',
  ] : benefits();
  const link = `${SITE}/invite/${encodeURIComponent(id)}`;
  const label = existing ? 'See the invitation' : 'Create my account';
  const note = existing ? 'You can say yes or no there.' : `It takes a minute: choose a password, or use Google with ${d.email}.`;
  const foot = `You get this because an admin of ${org} added ${d.email}. Not expecting it? Ignore this email.`;
  return {
    subject: subject(existing ? `${org} would like you to join them in ELT Suite` : `Your whole job in one account: your place at ${org} is ready`),
    html: frame({ title, preview, body: pad(h1(title) + p(esc(greeting(d.name))) + p(esc(sentence)) + (existing ? '' : p(esc(intro))) + list(features.map(esc)) + button(link, label) + small(esc(note)) + rule() + h2(`About ${org}`) + small(esc(about(org)))), footer: esc(foot) }),
    text: [title, greeting(d.name), sentence, ...(!existing ? [intro] : []), ...features, `${label}: ${link}`, note, `About ${org}`, about(org), foot].join('\n\n'),
  };
}
export function codeInvitation(d, code) {
  const title = 'Your whole job in one account';
  const by = d.byName || 'The ELT Suite team';
  const sentence = `${by} has invited you to ELT Suite${d.orgName ? ` at ${d.orgName}` : ''}.`;
  const expires = d.expires ? ` The code works until ${new Date(d.expires).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Hong_Kong' })}.` : '';
  const note = `ELT Suite is by invitation for now. Your code is ${code}. The button fills it in for you. Use ${d.email}, with a password or Google.${expires}`;
  const foot = `You get this because ${by} invited ${d.email}. Not expecting it? Ignore this email.`;
  const link = `${SITE}/?code=${encodeURIComponent(code)}`;
  return {
    subject: subject(`${title}: your invitation to ELT Suite${d.orgName ? ` at ${d.orgName}` : ''}`),
    html: frame({ title, preview: 'Plan, teach live and follow every learner, in one place. Your code is inside.', body: pad(h1(title) + p(esc(greeting(d.name))) + p(esc(sentence)) + p(esc(intro)) + list(benefits(false).map(esc)) + button(link, 'Create my account') + codeBlock(code) + small(esc(note))), footer: esc(foot) }),
    text: [title, greeting(d.name), sentence, intro, ...benefits(false), `Create my account: ${link}`, note, foot].join('\n\n'),
  };
}
