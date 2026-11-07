import { mkdir, copyFile, readdir, rm, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const runtime = resolve(root, 'functions/runtime');
if (relative(root, runtime).replaceAll('\\', '/') !== 'functions/runtime') throw new Error('Invalid function runtime directory');
const firebase = JSON.parse(await readFile(resolve(root, 'firebase.json'), 'utf8'));
if (firebase.hosting?.site !== 'personal-website-7d04c') throw new Error('Unexpected Firebase project');
await rm(runtime, {recursive: true, force: true});
await mkdir(resolve(runtime, 'server'), {recursive: true});
const files = ['server/chat.mjs', 'server/cloud-chat.mjs', 'server/visitors.mjs', 'server/arcade-scores.mjs', 'arcade-model.js', 'content.js', 'credential-data.js'];
for (const file of files) await copyFile(resolve(root, file), resolve(runtime, file));
// An explicit allowlist keeps environment files, user data and other servers
// outside the uploaded function package.
const top = await readdir(runtime);
if (top.some(name => !['server', 'arcade-model.js', 'content.js', 'credential-data.js'].includes(name))) throw new Error('Unexpected runtime content');
console.log('Prepared the chat function with public portfolio facts and server handlers only.');
