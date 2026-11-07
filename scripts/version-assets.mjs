import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';

const clientExtensions = new Set(['.html', '.js', '.css']);
const localURL = /^(?:\.{1,2}\/|\/(?!\/))/;

async function collectClientFiles(directory, output, files = []) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Client export must not contain symbolic links');
    if (entry.isDirectory()) await collectClientFiles(path, output, files);
    else if (entry.isFile() && clientExtensions.has(extname(entry.name))) {
      files.push({path, name: relative(output, path).split(sep).join('/'), bytes: await readFile(path)});
    }
  }
  return files;
}

function versionURL(value, version, file, output, assets) {
  if (!localURL.test(value)) return value;
  const [beforeHash, ...fragments] = value.split('#');
  const [pathname, ...queries] = beforeHash.split('?');
  if (!/\.(?:js|css)$/.test(pathname)) return value;
  const target = pathname.startsWith('/') ? resolve(output, `.${pathname}`) : resolve(dirname(file), pathname);
  const name = relative(output, target).split(sep).join('/');
  // Restrict rewriting to exported client assets; sample paths in content stay intact.
  if (!assets.has(name)) return value;
  const query = new URLSearchParams(queries.join('?'));
  query.set('v', version);
  return `${pathname}?${query}${fragments.length ? `#${fragments.join('#')}` : ''}`;
}

function rewriteJS(source, stamp) {
  // Match module syntax rather than every quoted .js string (the virtual shell
  // deliberately contains example filenames that are not module dependencies).
  return source.replace(/(\bfrom\s+|\bimport\s*(?:\(\s*)?)(['"])((?:\.{1,2}\/|\/(?!\/))[^'"\r\n]+)\2/g,
    (match, prefix, quote, url) => `${prefix}${quote}${stamp(url)}${quote}`);
}

function rewriteHTML(source, stamp, version) {
  let html = source.replace(/<(?:script|link)\b[^>]*>/gi, tag => tag.replace(/(\b(?:src|href)\s*=\s*)(['"])([^'"]+)\2/gi,
    (match, prefix, quote, url) => `${prefix}${quote}${stamp(url)}${quote}`));
  html = html.replace(/(<script\b[^>]*\btype\s*=\s*['"]importmap['"][^>]*>)([\s\S]*?)(<\/script\s*>)/gi,
    (match, opening, body, closing) => {
      const map = JSON.parse(body);
      const update = object => Object.fromEntries(Object.entries(object).map(([key, value]) => [key,
        typeof value === 'string' ? stamp(value) : value && typeof value === 'object' ? update(value) : value]));
      return `${opening}${JSON.stringify(update(map))}${closing}`;
    });
  html = html.replace(/(<script\b[^>]*\btype\s*=\s*['"]module['"][^>]*>)([\s\S]*?)(<\/script\s*>)/gi,
    (match, opening, body, closing) => `${opening}${rewriteJS(body, stamp)}${closing}`);
  return html.replace(/<html\b[^>]*>/i, tag => `${tag.replace(/\sdata-build-version\s*=\s*(['"])[^'"]*\1/i, '').slice(0, -1)} data-build-version="${version}">`);
}

// Run after every generated page and vendor module has been exported. All
// imports use the same version so persistent settings remains one ESM instance.
export async function versionBuiltAssets({root, output}) {
  root = resolve(root);
  output = resolve(output);
  if (relative(root, output) !== 'dist') throw new Error('Asset versioning must stay inside the project dist directory');
  const files = (await collectClientFiles(output, output)).sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const digest = createHash('sha256');
  for (const file of files) digest.update(file.name).update('\0').update(String(file.bytes.length)).update('\0').update(file.bytes);
  const version = digest.digest('hex').slice(0, 12);
  const assets = new Set(files.map(file => file.name));
  for (const file of files) {
    const source = file.bytes.toString('utf8');
    const stamp = url => versionURL(url, version, file.path, output, assets);
    const rewritten = file.name.endsWith('.html') ? rewriteHTML(source, stamp, version)
      : file.name.endsWith('.js') ? rewriteJS(source, stamp) : source;
    if (rewritten !== source) await writeFile(file.path, rewritten);
  }
  await writeFile(resolve(output, 'asset-version.json'), `${JSON.stringify({version}, null, 2)}\n`);
  return {version, files: files.length};
}
