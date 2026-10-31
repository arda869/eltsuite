import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { generate } from '../ai/provider.js';
import { checkModel, reserveBudget, settleBudget } from '../ai/budget.js';
import { canUseHelp, helpInstructions, library, questionInput, selectedArticles, selectionSchema } from './core.js';
const key = defineSecret('OPENAI_API_KEY');
const model = defineString('ELT_AI_MODEL', { default: '' });

// Help uses its own budget and counters. It never reads class data or teaching AI allowances.
export const helpAssistant = onCall({ region: 'us-central1', secrets: [key], maxInstances: 2, concurrency: 4, timeoutSeconds: 210 }, async req => {
  if (!req.auth || req.auth.token.proxyBy) throw new HttpsError('unauthenticated', 'Sign in with your own teacher account.');
  const db = getFirestore(), uid = req.auth.uid, d = req.data ?? {};
  const [p, a] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`accounts/${uid}`).get()]);
  if (!canUseHelp(p.data(), a.data(), req.auth)) throw new HttpsError('permission-denied', 'Help is available to active teacher accounts.');
  if (d.action !== undefined && d.action !== 'feedback') throw new HttpsError('invalid-argument', 'Choose a help action.');
  if (d.action !== 'feedback') { try { checkModel(model.value()); } catch { throw new HttpsError('unavailable', 'AI help is unavailable. Browse the help topics or contact support.'); } }
  const input = d.action === 'feedback' ? null : (() => { try { return questionInput(d); } catch (e) { throw new HttpsError('invalid-argument', e.message); } })();
  if (d.action === 'feedback' && (!['yes', 'no', 'unresolved'].includes(d.rating) || !Array.isArray(d.articleIds) || d.articleIds.length > 2 || d.articleIds.some(id => !library.articles.some(a => a.id === id)))) throw new HttpsError('invalid-argument', 'Choose a feedback option.');
  const day = new Date().toISOString().slice(0, 10);
  const usage = db.doc(`helpPrivate/${uid}/usage/${day}`), budget = db.doc(`helpBudgets/${day.slice(0, 7)}`);
  const reservation = await db.runTransaction(async tx => {
    const [u, b] = await Promise.all([tx.get(usage), tx.get(budget)]);
    // Pilot abuse protection, separate from paid teaching allowances. No raw question is logged.
    const field = d.action === 'feedback' ? 'feedback' : 'requests';
    if ((u.get(field) ?? 0) >= 30) throw new HttpsError('resource-exhausted', 'Help has reached today’s fair-use limit. You can still browse help topics or contact support.');
    const r = input ? reserveBudget(b.get('committedMicroUsd') ?? 0, 1) : null;
    tx.set(usage, { [field]: (u.get(field) ?? 0) + 1, expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86400000) }, { merge: true });
    if (r) tx.set(budget, { committedMicroUsd: r.balance }, { merge: true });
    return r;
  }).catch(e => { if (e instanceof HttpsError) throw e; throw new HttpsError('resource-exhausted', 'AI help is unavailable just now. You can still browse help topics or contact support.'); });
  if (!input) {
    // Sharing the question is explicit. Otherwise retain only article IDs and the rating.
    let question;
    if (d.shareQuestion === true) { try { question = questionInput(d).question; } catch (e) { throw new HttpsError('invalid-argument', e.message); } }
    await db.collection('helpFeedback').add({ rating: d.rating, articleIds: d.articleIds, version: library.version, ...(question ? { question } : {}), at: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86400000) });
    return { saved: true };
  }
  try {
    checkModel(model.value());
    const result = await generate({ apiKey: key.value(), model: model.value(), schema: selectionSchema, name: 'help_selection', input: { ...input, approvedArticles: library.articles }, instructions: helpInstructions });
    const articles = selectedArticles(result.value.articleIds);
    await db.runTransaction(async tx => {
      const b = await tx.get(budget);
      tx.update(budget, { committedMicroUsd: settleBudget(b.get('committedMicroUsd'), reservation.reserved, [result.usage]).balance });
    });
    return { articleIds: articles.map(a => a.id), version: library.version };
  } catch {
    // Keep reservations on unknown failures so retries cannot bypass the spending cap.
    throw new HttpsError('unavailable', 'AI help couldn’t answer just now. Browse the help topics or contact support.');
  }
});
