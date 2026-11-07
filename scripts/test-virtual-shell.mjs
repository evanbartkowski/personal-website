import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualShell } from '../virtual-shell.js';

const memoryStore = () => {
  const values = new Map();
  return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values};
};
const run = (shell, raw) => {
  const result = shell.execute(raw);
  assert.equal(result.handled, true, raw);
  return result;
};

test('quoted file names, redirection and append preserve literal text', () => {
  const shell = createVirtualShell({storage: null});
  run(shell, 'echo "first line" > "notes/my note.txt"');
  run(shell, 'echo "<img src=x onerror=alert(1)>" >> "notes/my note.txt"');
  assert.equal(shell.readFile('notes/my note.txt'), 'first line\n<img src=x onerror=alert(1)>\n');
  assert.equal(run(shell, 'cat "notes/my note.txt"').output, shell.readFile('notes/my note.txt'));
  run(shell, "echo '$(not-executed) > literal' > notes/literal.txt");
  assert.equal(shell.readFile('notes/literal.txt'), '$(not-executed) > literal\n');
  assert.ok(run(shell, 'echo "unclosed').output);
  assert.equal(shell.execute('unknown thing').handled, false);
});

test('directories normalize paths and track cwd through a move', () => {
  const shell = createVirtualShell({storage: null});
  assert.equal(run(shell, 'pwd').output, '/home/visitor');
  run(shell, 'mkdir -p notes/ideas/drafts');
  run(shell, 'cd notes/ideas/drafts');
  assert.equal(shell.cwd, '/home/visitor/notes/ideas/drafts');
  run(shell, 'touch plan.txt');
  run(shell, 'mv ../../ideas ../../archive');
  assert.equal(shell.cwd, '/home/visitor/notes/archive/drafts');
  assert.equal(shell.readFile('plan.txt'), '');
  run(shell, 'cd ../../../../../..');
  assert.equal(shell.cwd, '/');
  run(shell, 'cd');
  assert.equal(shell.cwd, '/home/visitor');
  assert.deepEqual(shell.complete('notes/ar'), ['notes/archive/']);
});

test('copy is recursive and cannot target its own descendants', () => {
  const shell = createVirtualShell({storage: null});
  run(shell, 'mkdir -p notes/source/deep');
  run(shell, 'echo kept > notes/source/deep/file.txt');
  assert.ok(run(shell, 'cp notes/source notes/copy').output);
  run(shell, 'cp -r notes/source notes/copy');
  assert.equal(shell.readFile('notes/copy/deep/file.txt'), 'kept\n');
  assert.ok(run(shell, 'cp -r notes/source notes/source/loop').output);
  assert.equal(shell.exists('notes/source/loop'), false);
  assert.ok(run(shell, 'mv notes/source notes/source/loop').output);
  assert.ok(run(shell, 'cp -r / notes/root-copy').output);
  run(shell, 'cp notes/source/deep/file.txt notes/copy.txt');
  run(shell, 'mv notes/copy.txt notes/renamed.txt');
  assert.equal(shell.exists('notes/copy.txt'), false);
  assert.equal(shell.readFile('notes/renamed.txt'), 'kept\n');
});

test('rm and administrative commands are denied before any virtual mutation', () => {
  const storage = memoryStore();
  const shell = createVirtualShell({storage});
  run(shell, 'mkdir -p notes/remove/nested');
  run(shell, 'touch notes/remove/nested/a.txt');
  shell.writeFile('notes/remove/nested/a.txt', 'preserved');
  const before = storage.getItem('evan-portfolio-shell-v1');
  for (const command of ['rm notes/remove/nested/a.txt', 'rm -r notes/remove', 'rm -rf /', 'rm -f /missing', 'sudo su -', 'su -', 'chmod 777 notes/remove/nested/a.txt', '/bin/rm notes/remove/nested/a.txt', '/usr/bin/sudo su -', 'echo changed > notes/blocked.txt | rm notes/remove/nested/a.txt']) {
    const result = run(shell, command);
    assert.match(result.output, /Command not available with these permissions/);
    assert.equal(result.code, 126);
  }
  assert.equal(shell.readFile('notes/remove/nested/a.txt'), 'preserved');
  assert.equal(shell.exists('notes/blocked.txt'), false);
  assert.equal(storage.getItem('evan-portfolio-shell-v1'), before);
  assert.equal(shell.exists('README.txt'), true);
  for (const path of ['/', '/home', '/home/visitor', '../../../../']) assert.ok(run(shell, `rm -rf ${path}`).output);
  assert.equal(shell.exists('/home/visitor/README.txt'), true);
  assert.match(run(shell, 'rm -f /a-real-system-path/not-in-workspace').output, /not available with these permissions/);
  assert.equal(shell.exists('/a-real-system-path'), false);
  run(shell, 'mkdir notes/empty');
  run(shell, 'rmdir notes/empty');
  assert.equal(shell.exists('notes/empty'), false);
});

test('nano opens virtual content and edited and renamed files persist', () => {
  const storage = memoryStore();
  const shell = createVirtualShell({storage});
  const first = run(shell, 'nano notes/edited.txt');
  assert.deepEqual(first.editor, {path: '/home/visitor/notes/edited.txt', content: ''});
  shell.writeFile(first.editor.path, 'saved by the editor\n');
  assert.equal(run(shell, 'nano notes/edited.txt').editor.content, 'saved by the editor\n');
  run(shell, 'mv profile.txt notes/profile-copy.txt');
  run(shell, 'cd notes');
  const restored = createVirtualShell({storage});
  assert.equal(restored.cwd, '/home/visitor/notes');
  assert.equal(restored.readFile('edited.txt'), 'saved by the editor\n');
  assert.equal(restored.exists('../profile.txt'), false);
  assert.equal(restored.exists('profile-copy.txt'), true);
});

test('head, tail, cat, pagers and wc read actual virtual text', () => {
  const shell = createVirtualShell({storage: null});
  shell.writeFile('notes/lines.txt', 'alpha\nBeta\nalpha\n');
  shell.writeFile('notes/unicode.txt', '🌊 sea\n');
  assert.equal(run(shell, 'head -n 2 notes/lines.txt').output, 'alpha\nBeta\n');
  assert.equal(run(shell, 'head -c 5 notes/lines.txt').output, 'alpha');
  assert.equal(run(shell, 'tail -n 1 notes/lines.txt').output, 'alpha\n');
  assert.equal(run(shell, 'tail -n +2 notes/lines.txt').output, 'Beta\nalpha\n');
  assert.equal(run(shell, 'tail -n 0 notes/lines.txt').output, '');
  assert.equal(run(shell, 'wc notes/lines.txt').output, '3 3 17 notes/lines.txt');
  assert.equal(run(shell, 'wc -lwmc notes/unicode.txt').output, '1 2 9 6 notes/unicode.txt');
  for (const command of ['cat', 'less', 'more']) assert.equal(run(shell, `${command} notes/lines.txt`).output, 'alpha\nBeta\nalpha\n');
  assert.match(run(shell, 'cat -n notes/lines.txt').output, /1\talpha\n\s+2\tBeta/);
});

test('grep matches bounded expressions, fixed text, line numbers and recursive sources', () => {
  const shell = createVirtualShell({storage: null});
  shell.writeFile('notes/search.txt', 'alpha\nBeta\nALPHA\n[raw]\nabb\nabbbc\n');
  assert.equal(run(shell, 'grep -in "^alpha$" notes/search.txt').output, '1:alpha\n3:ALPHA\n');
  assert.equal(run(shell, 'grep -F "[raw]" notes/search.txt').output, '[raw]\n');
  assert.equal(run(shell, 'grep -E "^ab+c?$" notes/search.txt').output, 'abb\nabbbc\n');
  assert.equal(run(shell, 'grep -c "^[a-z]*$" notes/search.txt').output, '3\n');
  assert.equal(run(shell, 'grep -l Beta notes/search.txt').output, 'notes/search.txt\n');
  assert.ok(run(shell, 'grep -r Beta notes').output.includes('Beta'));
  assert.equal(run(shell, 'printf "one\\ntwo\\n" | grep -v one').output, 'two\n');
  const unsupported = run(shell, 'grep "(a*)*$" notes/search.txt');
  assert.equal(unsupported.code, 1);
  assert.match(unsupported.output, /not supported/);
});

test('find and tree report real paths and bounded depths', () => {
  const shell = createVirtualShell({storage: null});
  run(shell, 'mkdir -p notes/search/deep');
  run(shell, 'touch notes/search/A.txt notes/search/deep/b.md');
  assert.equal(run(shell, 'find notes/search -name "*.txt" -type f').output, '/home/visitor/notes/search/A.txt');
  assert.equal(run(shell, 'find notes/search -iname "a.TXT"').output, '/home/visitor/notes/search/A.txt');
  assert.equal(run(shell, 'find notes/search -maxdepth 1 -type d').output, '/home/visitor/notes/search\n/home/visitor/notes/search/deep');
  assert.match(run(shell, 'tree notes/search').output, /deep\/\n.*b\.md[\s\S]*1 directories, 2 files/);
  assert.equal(run(shell, 'tree -L 0 notes/search').output, '/home/visitor/notes/search\n\n0 directories, 0 files');
});

test('sort, uniq, cut, tr, rev, nl and printf process real pipeline text', () => {
  const shell = createVirtualShell({storage: null});
  assert.equal(run(shell, 'printf "pear\\napple\\npear\\n" | sort | uniq -c').output, '      1 apple\n      2 pear\n');
  assert.equal(run(shell, 'printf "10\\n2\\n1\\n" | sort -nr').output, '10\n2\n1\n');
  assert.equal(run(shell, 'printf "a\\na\\nb\\n" | uniq -d').output, 'a\n');
  assert.equal(run(shell, 'printf "a\\na\\nb\\n" | uniq -u').output, 'b\n');
  assert.equal(run(shell, 'printf "a,b,c\\nx,y,z\\n" | cut -d , -f 1,3').output, 'a,c\nx,z\n');
  assert.equal(run(shell, 'echo abcde | cut -c 2-4').output, 'bcd\n');
  assert.equal(run(shell, 'echo security | tr a-z A-Z').output, 'SECURITY\n');
  assert.equal(run(shell, 'echo alphabet | tr -d a').output, 'lphbet\n');
  assert.equal(run(shell, 'echo abc | rev').output, 'cba\n');
  assert.equal(run(shell, 'echo line | nl').output, '     1\tline\n');
  assert.equal(run(shell, 'printf "%s:%03d\\n" item 7').output, 'item:007\n');
  assert.equal(run(shell, 'printf "%s\\n" one two').output, 'one\ntwo\n');
  run(shell, 'printf "b\\na\\n" | sort > notes/sorted.txt');
  assert.equal(shell.readFile('notes/sorted.txt'), 'a\nb\n');
});

test('path utilities, stat, file and disk usage describe the virtual workspace', () => {
  const shell = createVirtualShell({storage: null});
  shell.writeFile('notes/data.txt', 'abc\n');
  assert.equal(run(shell, 'basename /some/path/data.txt .txt').output, 'data');
  assert.equal(run(shell, 'dirname notes/data.txt').output, 'notes');
  assert.equal(run(shell, 'dirname file').output, '.');
  assert.equal(run(shell, 'realpath notes/../notes/data.txt').output, '/home/visitor/notes/data.txt');
  assert.equal(run(shell, 'realpath -m notes/missing').output, '/home/visitor/notes/missing');
  assert.match(run(shell, 'stat notes/data.txt').output, /Size: 4 bytes[\s\S]*visitor \(virtual workspace\)/);
  assert.equal(run(shell, 'file notes/data.txt').output, 'notes/data.txt: ASCII text');
  assert.equal(run(shell, 'du -s notes').output, '4\t/home/visitor/notes');
  assert.equal(run(shell, 'du -sh notes').output, '4B\t/home/visitor/notes');
  assert.match(run(shell, 'df').output, /characters, not host disk/);
});

test('identity, date and environment are truthful virtual diagnostics', () => {
  const shell = createVirtualShell({storage: null});
  assert.equal(run(shell, 'whoami').output, 'visitor');
  assert.match(run(shell, 'id').output, /virtual workspace/);
  assert.equal(run(shell, 'id -un').output, 'visitor');
  assert.equal(run(shell, 'groups').output, 'visitor (virtual workspace)');
  assert.match(run(shell, 'who').output, /current browser workspace/);
  assert.equal(run(shell, 'uname').output, 'Portfolio Browser Workspace');
  assert.match(run(shell, 'uname -a').output, /no host kernel access/);
  assert.equal(run(shell, 'hostname').output, 'portfolio-workspace');
  assert.match(run(shell, 'hostname different').output, /not available with these permissions/);
  assert.equal(run(shell, 'printenv HOME USER').output, '/home/visitor\nvisitor');
  assert.equal(run(shell, 'printenv OPENAI_API_KEY').output, '');
  assert.equal(run(shell, 'printenv __proto__ constructor').output, '\n');
  assert.match(run(shell, 'env').output, /SHELL=portfolio-virtual-shell/);
  assert.match(run(shell, 'date -u +%F').output, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(run(shell, 'date +%s').output, /^\d{10,}$/);
  assert.match(run(shell, 'history').output, /whoami[\s\S]*history/);
  assert.equal(run(shell, 'seq 3').output, '1\n2\n3\n');
  assert.equal(run(shell, 'seq 5 -2 1').output, '5\n3\n1\n');
  assert.equal(run(shell, 'true').code, 0);
  assert.equal(run(shell, 'false').code, 1);
});

test('command, file, node and output limits leave existing content unchanged', () => {
  const shell = createVirtualShell({storage: null});
  shell.writeFile('notes/kept.txt', 'original');
  assert.equal(run(shell, 'seq 10000000 > notes/kept.txt').code, 1);
  assert.equal(shell.readFile('notes/kept.txt'), 'original');
  assert.equal(run(shell, 'printf "%q" nope > notes/kept.txt').code, 1);
  assert.equal(shell.readFile('notes/kept.txt'), 'original');
  assert.equal(run(shell, 'echo overwritten > notes/kept.txt | sudo su -').code, 126);
  assert.equal(shell.readFile('notes/kept.txt'), 'original');
  const crowded = createVirtualShell({storage: null});
  run(crowded, 'touch ' + Array.from({length: 152}, (_, index) => `notes/file${index}`).join(' '));
  assert.equal(run(crowded, 'touch notes/too-many-a notes/too-many-b').code, 1);
  assert.equal(crowded.exists('notes/too-many-a'), false);
  assert.equal(crowded.exists('notes/too-many-b'), false);
  const full = createVirtualShell({storage: null});
  for (let index = 0; index < 3; index++) full.writeFile(`notes/large${index}`, 'x'.repeat(64000));
  assert.throws(() => full.writeFile('notes/one-too-many', 'x'.repeat(64000)));
  assert.equal(full.exists('notes/one-too-many'), false);
  assert.equal(full.readFile('notes/large0').length, 64000);
});

test('corrupt storage and blocked storage leave a usable workspace', () => {
  const storage = memoryStore();
  storage.setItem('evan-portfolio-shell-v1', '{corrupt');
  const recovered = createVirtualShell({storage});
  assert.equal(recovered.exists('README.txt'), true);
  recovered.writeFile('notes/recovered.txt', 'yes');
  assert.equal(createVirtualShell({storage}).readFile('notes/recovered.txt'), 'yes');
  const blocked = createVirtualShell({storage: {getItem() {throw Error('blocked');}, setItem() {throw Error('blocked');}}});
  assert.equal(blocked.writeFile('notes/visit.txt', 'works'), false);
  assert.equal(blocked.readFile('notes/visit.txt'), 'works');
});

test('limits are atomic and prototype names are ordinary file names', () => {
  const storage = memoryStore();
  const shell = createVirtualShell({storage});
  shell.writeFile('notes/kept.txt', 'original');
  assert.throws(() => shell.writeFile('notes/kept.txt', 'x'.repeat(64001)));
  assert.equal(shell.readFile('notes/kept.txt'), 'original');
  run(shell, 'echo harmless > notes/__proto__');
  run(shell, 'echo ordinary > notes/constructor');
  assert.equal(shell.readFile('notes/__proto__'), 'harmless\n');
  assert.equal({}.harmless, undefined);
  assert.equal(createVirtualShell({storage}).readFile('notes/constructor'), 'ordinary\n');
  assert.ok(run(shell, 'echo unsafe > ../../../server/chat.mjs').output);
  assert.equal(shell.exists('/server/chat.mjs'), false);
  assert.equal(shell.exists('notes/kept.txt'), true);
});
