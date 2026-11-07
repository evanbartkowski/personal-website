import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createPortfolioServer } from './serve.mjs';

test('local audio serves metadata and seekable byte ranges without changing access controls', async t => {
  const fixturePrefix = join(resolve(tmpdir()), 'portfolio-audio-');
  const fixture = await mkdtemp(fixturePrefix);
  const directory = join(fixture, 'assets', 'music');
  const bytes = Buffer.from(Array.from({ length: 256 }, (_, index) => index));
  const formats = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac' };
  let server;
  try {
    await mkdir(directory, { recursive: true });
    await Promise.all(Object.keys(formats).map(extension => writeFile(join(directory, `track.${extension}`), bytes)));
    await Promise.all([writeFile(join(directory, 'empty.mp3'), ''), writeFile(join(fixture, 'index.html'), '<!doctype html><title>Audio fixture</title>')]);
    server = createPortfolioServer({ staticDirectory: fixture, chatOptions: { env: {}, fetchImpl: async () => assert.fail('Audio requests must not call OpenAI') } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const url = `${base}/assets/music/track.mp3`;

    await t.test('all five formats support complete GET and bodyless HEAD with the correct metadata', async () => {
      for (const [extension, mime] of Object.entries(formats)) {
        const full = await fetch(`${base}/assets/music/track.${extension}`);
        assert.equal(full.status, 200);
        assert.equal(full.headers.get('content-type'), mime);
        assert.equal(full.headers.get('content-length'), String(bytes.length));
        assert.equal(full.headers.get('accept-ranges'), 'bytes');
        assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);
        const head = await fetch(`${base}/assets/music/track.${extension}`, { method: 'HEAD' });
        assert.equal(head.status, 200);
        assert.equal(head.headers.get('content-type'), mime);
        assert.equal(head.headers.get('content-length'), String(bytes.length));
        assert.equal(head.headers.get('accept-ranges'), 'bytes');
        assert.equal((await head.arrayBuffer()).byteLength, 0);
      }
      const rangedHead = await fetch(url, { method: 'HEAD', headers: { Range: 'bytes=10-19' } });
      assert.equal(rangedHead.status, 200, 'Range applies to GET; HEAD describes the complete resource');
      assert.equal(rangedHead.headers.get('content-length'), String(bytes.length));
      assert.equal(rangedHead.headers.get('content-range'), null);
      assert.equal((await rangedHead.arrayBuffer()).byteLength, 0);
    });

    await t.test('bounded, open-ended, suffix, oversized-end, and oversized-suffix ranges return exact slices', async () => {
      for (const [header, start, end] of [['bytes=0-0', 0, 0], ['bytes=10-39', 10, 39], ['bytes=250-', 250, 255], ['bytes=-9', 247, 255], ['bytes=250-999', 250, 255], ['bytes=-999', 0, 255], ['BYTES=12-15', 12, 15]]) {
        const response = await fetch(url, { headers: { Range: header } });
        assert.equal(response.status, 206, header);
        assert.equal(response.headers.get('content-type'), 'audio/mpeg');
        assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${bytes.length}`);
        assert.equal(response.headers.get('content-length'), String(end - start + 1));
        assert.equal(response.headers.get('accept-ranges'), 'bytes');
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(start, end + 1));
      }
    });

    await t.test('invalid and unsatisfiable ranges return bodyless 416 with the full resource length', async () => {
      for (const header of ['bytes=256-', 'bytes=30-12', 'bytes=-0', 'bytes=-', 'bytes=1-2,4-5', 'bytes=1.5-3', 'bytes=9007199254740993-', 'items=0-2', 'garbage']) {
        const response = await fetch(url, { headers: { Range: header } });
        assert.equal(response.status, 416, header);
        assert.equal(response.headers.get('content-range'), `bytes */${bytes.length}`);
        assert.equal(response.headers.get('content-length'), '0');
        assert.equal((await response.arrayBuffer()).byteLength, 0);
      }
      const empty = await fetch(`${base}/assets/music/empty.mp3`);
      assert.equal(empty.status, 200);
      assert.equal(empty.headers.get('content-length'), '0');
      assert.equal((await empty.arrayBuffer()).byteLength, 0);
      const emptyRange = await fetch(`${base}/assets/music/empty.mp3`, { headers: { Range: 'bytes=0-' } });
      assert.equal(emptyRange.status, 416);
      assert.equal(emptyRange.headers.get('content-range'), 'bytes */0');
    });

    await t.test('static pages, missing assets, localhost guards, protected paths, and method restrictions still work', async () => {
      const home = await fetch(base);
      assert.equal(home.status, 200);
      assert.match(home.headers.get('content-type'), /^text\/html/);
      assert.match(await home.text(), /Audio fixture/);
      assert.equal((await fetch(`${base}/assets/music/missing.mp3`)).status, 404);
      assert.equal((await fetch(`${base}/assets/music/`)).status, 404);
      assert.equal((await fetch(`${base}/.env.local`)).status, 403);
      assert.equal((await fetch(url, { method: 'POST' })).status, 405);
      assert.equal((await fetch(url, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
      assert.equal((await fetch(url, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
      const rebinding = await new Promise((resolve, reject) => {
        request(url, { headers: { Host: 'untrusted.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject).end();
      });
      assert.equal(rebinding, 403);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    assert(fixture.startsWith(fixturePrefix), 'cleanup must stay inside the explicitly created audio fixture');
    await rm(fixture, { recursive: true, force: true });
  }
});
