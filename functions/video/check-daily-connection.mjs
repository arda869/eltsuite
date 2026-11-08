import { pathToFileURL } from 'node:url';

// Read-only verification. Never print the key, provider response, or account data.
export async function inspectDailyKey(key, request = fetch) {
  if (!key.trim()) return { accepted: false, providerHttpStatus: null };
  try {
    const response = await request('https://api.daily.co/v1/rooms?limit=1', {
      headers: { Authorization: `Bearer ${key.trim()}` },
      signal: AbortSignal.timeout(30_000),
    });
    return { accepted: response.ok, providerHttpStatus: response.status };
  } catch {
    return { accepted: false, providerHttpStatus: null, connectionUnavailable: true };
  }
}

async function main() {
  const { applicationDefault } = await import('firebase-admin/app');
  const { access_token } = await applicationDefault().getAccessToken();
  const google = async url => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw Error('Cloud metadata check failed');
    return response.json();
  };
  const secret = 'https://secretmanager.googleapis.com/v1/projects/lesson-lit/secrets/DAILY_API_KEY/versions/latest';
  const metadata = await google(secret);
  const version = metadata.name.split('/').at(-1);
  const names = ['classVideoToken', 'maintainVideoRooms'];
  const bindings = await Promise.all(names.map(async name => {
    const fn = await google(`https://cloudfunctions.googleapis.com/v2/projects/lesson-lit/locations/us-central1/functions/${name}`);
    const bound = fn.serviceConfig?.secretEnvironmentVariables?.find(s => s.key === 'DAILY_API_KEY');
    return { name, deployedVersion: bound?.version ?? null, versionMatches: bound?.version === 'latest' || bound?.version === version };
  }));
  const report = { secretVersion: version, enabled: metadata.state === 'ENABLED', bindings };
  if (report.enabled) {
    const payload = await google(secret + ':access');
    const key = Buffer.from(payload.payload.data, 'base64').toString('utf8');
    Object.assign(report, await inspectDailyKey(key));
  }
  console.log(JSON.stringify(report, null, 2));
  console.log('Read-only connection check. No room or meeting token was created. Secret values and account details were not printed.');
  if (!report.enabled || !bindings.every(b => b.versionMatches) || !report.accepted) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => { console.error('The private Daily connection check could not complete. No secret values were printed.'); process.exitCode = 1; });
