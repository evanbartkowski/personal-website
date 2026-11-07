import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { versionBuiltAssets } from './version-assets.mjs';

const fixture = {
  'index.html': '<html lang="en"><head><link href="/style.css" rel="stylesheet"><script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script><script type="module" src="/settings.js"></script><script type="module">import "./app.js";</script></head></html>',
  'posts/hello/index.html': '<html><head><script src="/app.js" type="module"></script><link href="/style.css" rel="stylesheet"></head></html>',
  'app.js': `import {x} from './settings.js';
import './settings.js';
export {x} from './settings.js';
const module = import('./settings.js');
const withQuery = import('/settings.js?old=1#part');
const filename = './settings.js';
const sample = './not-a-module.js';
import('https://example.com/external.js');`,
  'settings.js': 'export const x = 1;',
  'vendor/three.module.js': "import {three} from './three.core.js'; export {three};",
  'vendor/three.core.js': 'export const three = 3;',
  'style.css': ':root {color: green;}',
};

async function prepare(t) {
  const root = await mkdtemp(join(tmpdir(), 'portfolio-version-assets-'));
  const output = join(root, 'dist');
  t.after(() => rm(root, {recursive: true, force: true}));
  const reset = async () => {
    await rm(output, {recursive: true, force: true});
    for (const [name, source] of Object.entries(fixture)) {
      await mkdir(dirname(join(output, name)), {recursive: true});
      await writeFile(join(output, name), source);
    }
  };
  await reset();
  return {root, output, reset, read: name => readFile(join(output, name), 'utf8')};
}

test('build versions the complete client import graph and preserves the settings singleton', async t => {
  const {root, output, read} = await prepare(t);
  await writeFile(join(root, 'app.js'), fixture['app.js']);
  const {version, files} = await versionBuiltAssets({root, output});
  assert.match(version, /^[a-f0-9]{12}$/);
  assert.equal(files, Object.keys(fixture).length);
  const app = await read('app.js');
  assert.equal((app.match(new RegExp(`settings\\.js\\?v=${version}`, 'g')) || []).length, 4,
    'Named, side-effect, re-export, and dynamic imports use one version');
  assert.ok(app.includes(`'/settings.js?old=1&v=${version}#part'`));
  assert.ok(app.includes("const filename = './settings.js'"), 'Virtual filenames are not rewritten');
  assert.ok(app.includes("const sample = './not-a-module.js'"));
  assert.ok(app.includes("import('https://example.com/external.js')"));
  const html = await read('index.html');
  assert.ok(html.includes(`/settings.js?v=${version}`));
  assert.ok(html.includes(`/vendor/three.module.js?v=${version}`));
  assert.ok(html.includes(`./app.js?v=${version}`));
  assert.ok((await read('vendor/three.module.js')).includes(`./three.core.js?v=${version}`));
  const base = 'https://portfolio.example';
  assert.equal(new URL(`/settings.js?v=${version}`, base).href,
    new URL(`./settings.js?v=${version}`, `${base}/app.js?v=${version}`).href);
  for (const name of ['index.html', 'posts/hello/index.html']) {
    const page = await read(name);
    assert.ok(page.includes(`data-build-version="${version}"`));
    assert.ok(page.includes(`/style.css?v=${version}`));
  }
  assert.ok((await read('posts/hello/index.html')).includes(`/app.js?v=${version}`));
  assert.deepEqual(JSON.parse(await read('asset-version.json')), {version});
  assert.equal(await readFile(join(root, 'app.js'), 'utf8'), fixture['app.js'], 'Source files stay untouched');
});

test('identical fresh exports produce identical versions and output', async t => {
  const {root, output, read, reset} = await prepare(t);
  const first = await versionBuiltAssets({root, output});
  const firstHTML = await read('index.html');
  const firstJS = await read('app.js');
  await reset();
  const second = await versionBuiltAssets({root, output});
  assert.deepEqual(second, first);
  assert.equal(await read('index.html'), firstHTML);
  assert.equal(await read('app.js'), firstJS);
});

test('changing vendor or page content invalidates the client graph', async t => {
  const {root, output, read, reset} = await prepare(t);
  const first = await versionBuiltAssets({root, output});
  await reset();
  await writeFile(join(output, 'vendor/three.core.js'), 'export const three = 4;');
  const vendorChange = await versionBuiltAssets({root, output});
  assert.notEqual(vendorChange.version, first.version);
  assert.ok((await read('app.js')).includes(`?v=${vendorChange.version}`));
  await reset();
  await writeFile(join(output, 'posts/hello/index.html'), '<html><body>Updated public article</body></html>');
  const pageChange = await versionBuiltAssets({root, output});
  assert.notEqual(pageChange.version, first.version);
  assert.notEqual(pageChange.version, vendorChange.version);
});

test('asset versioning rejects destinations outside the project dist directory', async t => {
  const {root, output, read} = await prepare(t);
  for (const invalid of [root, join(root, 'outside'), join(output, 'nested'), join(root, '..', 'dist')]) {
    await assert.rejects(versionBuiltAssets({root, output: invalid}), /dist directory/);
  }
  assert.equal(await read('index.html'), fixture['index.html']);
});
