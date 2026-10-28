// Plain-language messages for Firebase Auth error codes.
export function friendlyAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password don’t match. Try again, or use “Forgot?”.';
    case 'auth/invalid-email':
      return 'That doesn’t look like an email address.';
    case 'auth/email-already-in-use':
      return 'There’s already an account with this email. Sign in instead.';
    case 'auth/weak-password':
      return 'Your password needs at least 8 characters.';
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a minute and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google window. Allow pop-ups for this site and try again.';
    case 'auth/quota-exceeded':
      return 'We’ve sent today’s limit of sign-in links. Use Google or your password for now.';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.';
    case 'auth/invalid-action-code':
    case 'auth/expired-action-code':
      return 'This sign-in link has expired or was already used. Ask for a new one.';
    case 'auth/operation-not-allowed':
      return 'This way of signing in is switched off for now. Try another one.';
    default:
      return 'That didn’t work. Try again in a moment.';
  }
}
