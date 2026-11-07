import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseEnv } from 'node:util';

const PROJECT_ID = 'personal-website-7d04c';
const PROJECT_NUMBER = '199095231244';
const SECRET_ID = 'GEMINI_API_KEY';
const REPO_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const SERVICE_RESOURCE = `https://serviceusage.googleapis.com/v1/projects/${PROJECT_NUMBER}/services/secretmanager.googleapis.com`;
const SECRET_COLLECTION = `https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets`;
const SECRET_RESOURCE = `${SECRET_COLLECTION}/${SECRET_ID}`;

export class SecretSyncError extends Error {
  constructor(code, status) {
    const safeStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
    super(`Chat secret sync failed: ${code}${safeStatus ? ` (HTTP ${safeStatus})` : ''}.`);
    this.name = 'SecretSyncError';
    this.code = code;
    if (safeStatus) this.status = safeStatus;
  }
}

// This function has no console, filesystem, Firebase SDK, or environment access.
// Google response/error bodies are never included in an error or return value.
export async function syncChatSecret({
  apiKey,
  accessToken,
  projectId = PROJECT_ID,
  secretId = SECRET_ID,
  fetchImpl = globalThis.fetch,
  wait = sleep,
} = {}) {
  if (projectId !== PROJECT_ID || secretId !== SECRET_ID) throw new SecretSyncError('target_not_allowed');
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n\0]/.test(apiKey)) throw new SecretSyncError('missing_or_invalid_api_key');
  if (typeof accessToken !== 'string' || !accessToken.trim() || /[\r\n\0]/.test(accessToken)) throw new SecretSyncError('firebase_auth_required');

  async function request(url, method, body, allowed = [200]) {
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${accessToken.trim()}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new SecretSyncError('google_request_failed');
    }
    if (!allowed.includes(response.status)) {
      await response.body?.cancel();
      throw new SecretSyncError('google_request_rejected', response.status);
    }
    return response;
  }

  async function serviceState() {
    const response = await request(SERVICE_RESOURCE, 'GET');
    let state;
    try { state = (await response.json())?.state; }
    catch { throw new SecretSyncError('invalid_service_status'); }
    if (state !== 'ENABLED' && state !== 'DISABLED') throw new SecretSyncError('invalid_service_status');
    return state;
  }

  if (await serviceState() !== 'ENABLED') {
    // Do not follow operation URLs returned in JSON; only poll this fixed service.
    const enabling = await request(`${SERVICE_RESOURCE}:enable`, 'POST', {});
    await enabling.body?.cancel();
    let enabled = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await serviceState() === 'ENABLED') { enabled = true; break; }
      if (attempt < 59) await wait(1_000);
    }
    if (!enabled) throw new SecretSyncError('secret_manager_enable_pending');
  }

  const existing = await request(SECRET_RESOURCE, 'GET', undefined, [200, 404]);
  await existing.body?.cancel();
  if (existing.status === 404) {
    // A simultaneous creator may win the race. In that case, add our version.
    const created = await request(`${SECRET_COLLECTION}?secretId=${SECRET_ID}`, 'POST', { replication: { automatic: {} } }, [200, 201, 409]);
    await created.body?.cancel();
  }
  const version = await request(`${SECRET_RESOURCE}:addVersion`, 'POST', {
    payload: { data: Buffer.from(apiKey.trim(), 'utf8').toString('base64') },
  }, [200, 201]);
  await version.body?.cancel();
  return { projectId: PROJECT_ID, secretId: SECRET_ID, synced: true };
}

function firebaseToolsRequire() {
  const require = createRequire(import.meta.url);
  const searchPaths = [
    REPO_ROOT,
    ...(process.env.APPDATA ? [join(process.env.APPDATA, 'npm')] : []),
    dirname(process.execPath),
    resolve(dirname(process.execPath), '../lib'),
    ...(process.env.NODE_PATH ? process.env.NODE_PATH.split(process.platform === 'win32' ? ';' : ':') : []),
  ];
  try {
    const packagePath = require.resolve('firebase-tools/package.json', { paths: searchPaths });
    return createRequire(packagePath);
  } catch {
    throw new SecretSyncError('firebase_cli_not_installed');
  }
}

async function firebaseAccessToken() {
  const require = firebaseToolsRequire();
  // Silence all transports before loading auth. Firebase debug logs can contain
  // OAuth responses; native fetch below also avoids CLI secret payload logging.
  const { logger } = require('./lib/logger.js');
  logger.silent = true;
  try {
    const auth = require('./lib/auth.js');
    const { requireAuth } = require('./lib/requireAuth.js');
    const { getAccessToken } = require('./lib/apiv2.js');
    const account = auth.getProjectDefaultAccount(REPO_ROOT) || auth.getGlobalDefaultAccount();
    if (!account?.user || !account?.tokens) throw new SecretSyncError('firebase_auth_required');
    // Use the selected cached account, never an inherited legacy token or ADC.
    const inheritedToken = process.env.FIREBASE_TOKEN;
    try {
      delete process.env.FIREBASE_TOKEN;
      await requireAuth({ ...account, project: PROJECT_ID, nonInteractive: true }, true);
      const token = await getAccessToken();
      if (typeof token !== 'string' || !token.trim()) throw new SecretSyncError('firebase_auth_required');
      return token;
    } finally {
      if (inheritedToken === undefined) delete process.env.FIREBASE_TOKEN;
      else process.env.FIREBASE_TOKEN = inheritedToken;
    }
  } catch {
    throw new SecretSyncError('firebase_auth_required');
  }
}

export async function readProjectApiKey({ readFileImpl = readFile } = {}) {
  let values;
  try { values = parseEnv(await readFileImpl(join(REPO_ROOT, '.env.local'), 'utf8')); }
  catch { throw new SecretSyncError('local_env_unavailable'); }
  // Transfer only the project's local credential, never an inherited system key.
  const apiKey = values.GEMINI_API_KEY?.trim();
  if (!apiKey || /[\r\n\0]/.test(apiKey)) throw new SecretSyncError('missing_or_invalid_api_key');
  return apiKey;
}

export async function main() {
  if (process.argv.length > 2) throw new SecretSyncError('unexpected_arguments');
  const apiKey = await readProjectApiKey();
  const accessToken = await firebaseAccessToken();
  await syncChatSecret({ apiKey, accessToken });
  console.log(`Stored ${SECRET_ID} securely for ${PROJECT_ID}. Deploy the chat function to use this secret version.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    // Never print arbitrary errors or their causes, request objects, or bodies.
    console.error(error instanceof SecretSyncError ? error.message : 'Chat secret sync failed.');
    process.exitCode = 1;
  });
}
