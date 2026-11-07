import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readProjectApiKey, syncChatSecret, SecretSyncError } from './sync-chat-secret.mjs';

const apiKey = 'test-only-private-gemini-key';
const accessToken = 'test-only-private-google-token';
const serviceUrl = 'https://serviceusage.googleapis.com/v1/projects/199095231244/services/secretmanager.googleapis.com';
const collectionUrl = 'https://secretmanager.googleapis.com/v1/projects/personal-website-7d04c/secrets';
const secretUrl = `${collectionUrl}/GEMINI_API_KEY`;

function fixture(steps) {
  const requests = [];
  return {
    requests,
    fetchImpl: async (url, options) => {
      const step = steps[requests.length];
      requests.push({ url, ...options });
      assert.ok(step, 'Unexpected Google API request.');
      assert.equal(url, step.url);
      assert.equal(options.method, step.method || 'GET');
      return Response.json(step.body ?? {}, { status: step.status || 200 });
    },
  };
}

test('existing secret uploads only to the allowlisted resource, without exposing credentials', async () => {
  const mock = fixture([
    { url: serviceUrl, body: { state: 'ENABLED' } },
    { url: secretUrl },
    { url: `${secretUrl}:addVersion`, method: 'POST', body: { payload: { data: 'not returned to caller' } } },
  ]);
  const result = await syncChatSecret({ apiKey, accessToken, fetchImpl: mock.fetchImpl });
  assert.deepEqual(result, { projectId: 'personal-website-7d04c', secretId: 'GEMINI_API_KEY', synced: true });
  assert.equal(mock.requests.length, 3);
  const encoded = Buffer.from(apiKey).toString('base64');
  for (const request of mock.requests) {
    assert.equal(request.redirect, 'error');
    assert.equal(request.headers.Authorization, `Bearer ${accessToken}`);
    assert.equal(request.url.includes(apiKey), false);
    assert.equal(request.url.includes(encoded), false);
    assert.equal(request.url.includes(accessToken), false);
    assert.equal(request.body?.includes(accessToken) ?? false, false);
  }
  assert.deepEqual(JSON.parse(mock.requests[2].body), { payload: { data: encoded } });
  assert.equal(JSON.stringify(result).includes(apiKey), false);
  assert.equal(JSON.stringify(result).includes(accessToken), false);
});

test('disabled Secret Manager is enabled and polled at the fixed service URL', async () => {
  const waits = [];
  const mock = fixture([
    { url: serviceUrl, body: { state: 'DISABLED' } },
    { url: `${serviceUrl}:enable`, method: 'POST', body: { name: 'https://foreign.example/never-follow-this' } },
    { url: serviceUrl, body: { state: 'DISABLED' } },
    { url: serviceUrl, body: { state: 'ENABLED' } },
    { url: secretUrl, status: 404 },
    { url: `${collectionUrl}?secretId=GEMINI_API_KEY`, method: 'POST' },
    { url: `${secretUrl}:addVersion`, method: 'POST' },
  ]);
  await syncChatSecret({ apiKey, accessToken, fetchImpl: mock.fetchImpl, wait: async ms => waits.push(ms) });
  assert.deepEqual(waits, [1_000]);
  assert.deepEqual(JSON.parse(mock.requests[5].body), { replication: { automatic: {} } });
});

test('a concurrent secret creation conflict still uploads the version', async () => {
  const mock = fixture([
    { url: serviceUrl, body: { state: 'ENABLED' } },
    { url: secretUrl, status: 404 },
    { url: `${collectionUrl}?secretId=GEMINI_API_KEY`, method: 'POST', status: 409 },
    { url: `${secretUrl}:addVersion`, method: 'POST' },
  ]);
  assert.equal((await syncChatSecret({ apiKey, accessToken, fetchImpl: mock.fetchImpl })).synced, true);
  assert.equal(mock.requests.length, 4);
});

test('alternate resources and malformed credentials are rejected before network access', async () => {
  const invalid = [
    { projectId: 'another-project' },
    { secretId: 'ANOTHER_SECRET' },
    { apiKey: '' },
    { apiKey: `${apiKey}\nextra` },
    { accessToken: '' },
    { accessToken: `${accessToken}\r\nextra` },
  ];
  for (const options of invalid) {
    await assert.rejects(syncChatSecret({ apiKey, accessToken, ...options, fetchImpl: () => assert.fail('Invalid arguments reached Google.') }), SecretSyncError);
  }
});

test('network and Google errors never expose credentials or provider response details', async () => {
  const sensitive = `${apiKey} ${accessToken} ${Buffer.from(apiKey).toString('base64')}`;
  for (const status of [400, 401, 403, 429, 500]) {
    let bodyRead = false;
    await assert.rejects(syncChatSecret({ apiKey, accessToken, fetchImpl: async () => ({
      status,
      async json() { bodyRead = true; throw new Error(sensitive); },
    }) }), error => {
      assert.equal(error.status, status);
      assert.equal(error.code, 'google_request_rejected');
      assert.equal(error.cause, undefined);
      assert.equal(error.message.includes(apiKey), false);
      assert.equal(error.message.includes(accessToken), false);
      return true;
    });
    assert.equal(bodyRead, false);
  }
  await assert.rejects(syncChatSecret({ apiKey, accessToken, fetchImpl: async () => { throw new Error(sensitive); } }), error => {
    assert.equal(error.message, 'Chat secret sync failed: google_request_failed.');
    assert.equal(error.cause, undefined);
    return true;
  });
});

test('unsuccessful API enablement is bounded and never proceeds to secret writes', async () => {
  let calls = 0;
  let waits = 0;
  await assert.rejects(syncChatSecret({ apiKey, accessToken, wait: async () => { waits++; }, fetchImpl: async (url, options) => {
    calls++;
    assert.ok(url === serviceUrl || url === `${serviceUrl}:enable`);
    return Response.json(options.method === 'POST' ? {} : { state: 'DISABLED' });
  } }), error => error.code === 'secret_manager_enable_pending');
  assert.equal(calls, 62);
  assert.equal(waits, 59);
});

test('the project file supplies the key even when a different system key is inherited', async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'unrelated-system-key-must-never-transfer';
  try {
    const key = await readProjectApiKey({ readFileImpl: async (path, encoding) => {
      assert.ok(path.endsWith('vault-portfolio\\.env.local') || path.endsWith('vault-portfolio/.env.local'));
      assert.equal(encoding, 'utf8');
      return `GEMINI_API_KEY=" ${apiKey} "\nGEMINI_MODEL=test-model\n`;
    } });
    assert.equal(key, apiKey);
    await assert.rejects(readProjectApiKey({ readFileImpl: async () => 'GEMINI_MODEL=irrelevant\n' }), error => error.code === 'missing_or_invalid_api_key');
    await assert.rejects(readProjectApiKey({ readFileImpl: async () => { throw new Error(apiKey); } }), error => error.code === 'local_env_unavailable' && !error.message.includes(apiKey));
    assert.equal(process.env.GEMINI_API_KEY, 'unrelated-system-key-must-never-transfer');
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});

test('importing the utility does not read environment files, authenticate, or call APIs', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    fs.readFile = () => { throw new Error('Environment files must not be read on import'); };
    syncBuiltinESMExports();
    globalThis.fetch = () => { throw new Error('Network must not run on import'); };
    await import(${JSON.stringify(new URL('./sync-chat-secret.mjs', import.meta.url).href)});
    console.log('import-only');
  `], { encoding: 'utf8', timeout: 5_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'import-only');
  assert.equal(result.stderr, '');
});
