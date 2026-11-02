import { mkdir, copyFile, cp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
await mkdir(resolve(root, 'dist/vendor'), {recursive: true});
for (const file of ['index.html', 'style.css', 'app.js', 'reactor.js', 'content.js', 'favicon.svg']) {
  await copyFile(resolve(root, file), resolve(root, 'dist', file));
}
await cp(resolve(root, 'assets'), resolve(root, 'dist/assets'), {recursive: true});
for (const file of ['three.module.js', 'three.core.js']) {
  await copyFile(resolve(root, 'node_modules/three/build', file), resolve(root, 'dist/vendor', file));
}
const config = JSON.parse(await readFile(resolve(root, '.openai/hosting.json'), 'utf8'));
if (!config.project_id || config.static?.directory !== 'dist') throw new Error('Invalid hosting manifest');
console.log('Built personal vault to dist/ with local assets and Three.js.');
