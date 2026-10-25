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
      return 'There is already an account with this email. Sign in instead.';
    case 'auth/weak-password':
      return 'Please use a password of at least 8 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google window. Allow pop-ups for this site and try again.';
    case 'auth/quota-exceeded':
      return 'Sign-in links have reached today’s limit. Please use Google or your password for now.';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.';
    case 'auth/invalid-action-code':
    case 'auth/expired-action-code':
      return 'This sign-in link has expired or was already used. Ask for a new one.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is switched off in Firebase.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
