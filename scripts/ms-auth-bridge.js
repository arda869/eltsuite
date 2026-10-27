// The page Microsoft's sign-in window comes back to (public/ms-auth.html). It hands the answer to
// the ELT Suite tab that opened the window, which closes it. Built into public/ms-auth.js with:
//   npx esbuild scripts/ms-auth-bridge.js --bundle --minify --format=iife --outfile=public/ms-auth.js
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

broadcastResponseToMainFrame().catch(() => {
  document.body.textContent = 'You can close this window and go back to ELT Suite.';
});
