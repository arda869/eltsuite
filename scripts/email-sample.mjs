// A sample email showing every piece of the ELT Suite email look, for the owner to review.
import { frame, pad, kicker, h1, h2, p, small, hero, button, textLink, callout, code, list, chips, card, reveal, rule, SITE } from './email-layout.mjs';

const A = `${SITE}/email`;
export const sample = {
  subject: 'A sample of how ELT Suite emails look',
  text: 'This is a sample of the ELT Suite email look: a header picture, a button, an invitation code, a class card, a short quiz and a listening task. Open it in an email app that shows pictures to see the full design.',
  html: frame({
    title: 'A sample of how ELT Suite emails look',
    preview: 'Pictures, buttons, an invitation code, a class card and a short quiz, all in one place.',
    footer: 'You’re getting this because you asked for a sample of ELT Suite’s emails.',
    body:
      hero(`${A}/hero.jpg`, 'A bright classroom') +
      pad(
        kicker('Sample email') +
        h1('This is how ELT Suite emails will look') +
        p('Every email we send uses this frame: the logo at the top, a calm white card, your accent colour, and a short footer. Below is each piece an email can use.') +
        button(SITE, 'Open ELT Suite') +
        small('Buttons say what happens when you press them. In some email apps they gently pulse and darken when you point at them.') +
        rule() +
        kicker('An invitation') +
        h2('You’ve been invited to teach on ELT Suite') +
        p('Use this code on the sign-in page, or press the button. The code works once.') +
        code('K7Q-4M2') +
        button(`${SITE}/?code=K7Q-4M2`, 'Make your account') +
        rule() +
        kicker('A class') +
        h2('Your class has a new lesson') +
        card({ img: `${A}/class.jpg`, title: 'Upper-intermediate · Monday', meta: 'Lesson 6: Talking about plans · 14 learners', href: SITE }) +
        callout('<b>Due Friday.</b> Learners can start as soon as they open the lesson. Their answers come straight to you.') +
        rule() +
        kicker('Steps') +
        h2('Getting started takes three steps') +
        list(['Make a class and give it a name.', 'Share the class code with your learners.', 'Add your first lesson from Studio.']) +
        rule() +
        kicker('A listening task') +
        h2('Listen, then answer one question') +
        `<img src="${A}/listen.gif" alt="A moving sound wave" width="360" height="120" style="display:block;width:100%;max-width:360px;height:auto;border-radius:10px;margin:6px 0 14px">` +
        p(`Moving pictures (like the sound wave above) play in most email apps. ${textLink(SITE, 'Play the recording in ELT Suite')}`) +
        reveal('What time does the train leave?', 'At quarter past eight. In Apple Mail you can open this here; in other apps the answer is shown straight away.') +
        rule() +
        kicker('A quick answer') +
        h2('How did today’s lesson go?') +
        p('Tap one. It opens ELT Suite with your answer already chosen.') +
        chips([['It went well', `${SITE}/?mood=good`], ['Mostly fine', `${SITE}/?mood=ok`], ['It was hard', `${SITE}/?mood=hard`]]) +
        small('Emails can’t run forms or games, so answers and activities always open in ELT Suite.'),
      ),
  }),
};
