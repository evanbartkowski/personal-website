// A browser-contained filesystem. This module has no server, filesystem, eval,
// or process access; every command operates on the Map below.
const HOME = '/home/visitor';
const STORAGE_KEY = 'evan-portfolio-shell-v1';
const MAX_NODES = 160;
const MAX_FILE = 64_000;
const MAX_TOTAL = 256_000;
const protectedPaths = new Set(['/', '/home', HOME]);
const deniedCommands = new Set(['rm', 'sudo', 'su', 'unlink', 'mount', 'umount', 'passwd', 'chmod', 'chown', 'chgrp', 'kill', 'killall', 'pkill', 'reboot', 'shutdown', 'poweroff', 'halt', 'systemctl', 'service', 'apt', 'apt-get', 'yum', 'dnf', 'pacman', 'apk', 'brew', 'useradd', 'userdel', 'usermod', 'groupadd', 'fdisk', 'mkfs', 'dd', 'iptables', 'nft', 'crontab', 'ssh', 'scp', 'sftp', 'curl', 'wget', 'ping', 'nc']);
export const VIRTUAL_SHELL_COMMANDS = Object.freeze(['pwd', 'ls', 'cd', 'cat', 'touch', 'mkdir', 'echo', 'printf', 'cp', 'mv', 'rmdir', 'nano', 'head', 'tail', 'wc', 'grep', 'find', 'tree', 'sort', 'uniq', 'cut', 'tr', 'rev', 'nl', 'less', 'more', 'date', 'uname', 'whoami', 'id', 'groups', 'who', 'hostname', 'stat', 'file', 'du', 'df', 'basename', 'dirname', 'realpath', 'env', 'printenv', 'history', 'seq', 'true', 'false', ...deniedCommands]);
const MAX_OUTPUT = 256_000;
const bytes = text => new TextEncoder().encode(text).byteLength;
const linesOf = text => {const lines = text.split(/\r?\n/); if (lines.at(-1) === '') lines.pop(); return lines;};
const linesOutput = lines => lines.length ? lines.join('\n') + '\n' : '';
const commandName = value => value.replace(/^\/(?:usr\/)?bin\//, '');
const permissionMessage = name => `${name}: Command not available with these permissions.`;
const globMatch = (text, pattern) => {
  let index = 0, match = 0, star = -1, retry = 0;
  while (index < text.length) {
    if (pattern[match] === '?' || pattern[match] === text[index]) {index++; match++;}
    else if (pattern[match] === '*') {star = match++; retry = index;}
    else if (star >= 0) {match = star + 1; index = ++retry;}
    else return false;
  }
  while (pattern[match] === '*') match++;
  return match === pattern.length;
};
// A small NFA implements bounded grep expressions without backtracking or
// compiling visitor-controlled JavaScript regular expressions.
function grepMatcher(pattern, fixed, ignoreCase, extended) {
  if (pattern.length > 128) throw Error('grep: Keep the search pattern under 129 characters.');
  if (ignoreCase) pattern = pattern.toLowerCase();
  if (fixed) return value => (ignoreCase ? value.toLowerCase() : value).includes(pattern);
  let anchored = pattern.startsWith('^');
  if (anchored) pattern = pattern.slice(1);
  let end = pattern.endsWith('$') && !/(?:^|[^\\])(?:\\\\)*\\\$$/.test(pattern);
  if (end) pattern = pattern.slice(0, -1);
  const atoms = [];
  for (let index = 0; index < pattern.length; index++) {
    let char = pattern[index], match;
    if (char === '\\') {if (++index === pattern.length) throw Error('grep: Unfinished escape.'); char = pattern[index]; match = value => value === char;}
    else if (char === '.') match = () => true;
    else if (char === '[') {
      const close = pattern.indexOf(']', index + 1);
      if (close < 0) throw Error('grep: Unclosed character class.');
      let group = pattern.slice(index + 1, close), negate = group.startsWith('^');
      if (negate) group = group.slice(1);
      match = value => {let included = false; for (let item = 0; item < group.length; item++) {if (group[item + 1] === '-' && group[item + 2]) {included ||= value >= group[item] && value <= group[item + 2]; item += 2;} else included ||= value === group[item];} return negate ? !included : included;};
      index = close;
    } else if ('()|{}'.includes(char) || char === '*') throw Error('grep: This expression is not supported. Use -F for literal text.');
    else match = value => value === char;
    const atom = {match, star: false, optional: false};
    if (pattern[index + 1] === '*') {atom.star = true; index++;}
    else if (extended && pattern[index + 1] === '?') {atom.optional = true; index++;}
    else if (extended && pattern[index + 1] === '+') {atoms.push(atom); atoms.push({...atom, star: true}); index++; continue;}
    atoms.push(atom);
  }
  const closure = input => {const result = new Set(input); for (const state of result) if (atoms[state]?.star || atoms[state]?.optional) result.add(state + 1); return result;};
  return raw => {
    const value = ignoreCase ? raw.toLowerCase() : raw;
    let states = closure([0]);
    if (states.has(atoms.length) && (!end || !value.length)) return true;
    for (let index = 0; index < value.length; index++) {
      if (!anchored) states = closure([...states, 0]);
      const next = new Set();
      for (const state of states) if (atoms[state]?.match(value[index])) next.add(atoms[state].star ? state : state + 1);
      states = closure(next);
      if (states.has(atoms.length) && (!end || index === value.length - 1)) return true;
    }
    return states.has(atoms.length);
  };
}

function tokensFor(raw) {
  const tokens = [];
  let text = '', quote = '', started = false;
  const push = () => {if (started) tokens.push({value: text, type: 'word'}); text = ''; started = false;};
  for (let index = 0; index < raw.length; index++) {
    const char = raw[index];
    if (quote) {
      if (char === quote) quote = '';
      else if (char === '\\' && quote === '"' && ['"', '\\'].includes(raw[index + 1])) text += raw[++index];
      else text += char;
      continue;
    }
    if (char === '"' || char === "'") {quote = char; started = true;}
    else if (char === '\\') {if (index + 1 >= raw.length) throw Error('Unfinished escape.'); text += raw[++index]; started = true;}
    else if (/\s/.test(char)) push();
    else if (char === '>') {push(); tokens.push({value: raw[index + 1] === '>' ? (index++, '>>') : '>', type: 'redirect'});}
    else if (char === '|') {push(); tokens.push({value: '|', type: 'pipe'});}
    else if ([';', '&'].includes(char)) throw Error('Use one command or a pipeline at a time.');
    else {text += char; started = true;}
  }
  if (quote) throw Error('Unclosed quote.');
  push();
  return tokens;
}

export function createVirtualShell({storage, profile = {}, projects = [], historyProvider} = {}) {
  if (storage === undefined) {try {storage = globalThis.localStorage;} catch {storage = null;}}
  let cwd = HOME;
  let previous = HOME;
  let persistent = false;
  const commandHistory = [];
  let nodes = new Map([
    ['/', {type: 'dir'}], ['/home', {type: 'dir'}], [HOME, {type: 'dir'}],
    [`${HOME}/notes`, {type: 'dir'}], [`${HOME}/projects`, {type: 'dir'}],
    [`${HOME}/README.txt`, {type: 'file', content: "Evan Bartkowski / visitor workspace\n\nThese are virtual files saved only in this browser. Explore, write a note, or edit a file. Your portfolio and the real server are separate.\n\nPublic project notes live in projects/. Personal scratch space lives in notes/.\n"}],
    [`${HOME}/profile.txt`, {type: 'file', content: `${profile.name || 'Evan Bartkowski'}\n${profile.role || 'Cybersecurity engineer and developer'}${profile.company ? ' at ' + profile.company : ''}\n${profile.email || ''}\n`}],
  ]);
  for (const project of projects) if (/^[a-z0-9_-]+$/.test(project.id)) {
    nodes.set(`${HOME}/projects/${project.id}.txt`, {type: 'file', content: `${project.title}\n\n${project.description}\n\n${project.approach}\n${project.detail}\n${project.url || 'Development project · Contact Evan for a walkthrough.'}\n`});
  }
  const parentOf = path => path.slice(0, path.lastIndexOf('/')) || '/';
  const nameOf = path => path.slice(path.lastIndexOf('/') + 1);
  function resolve(path = '.', from = cwd) {
    if (typeof path !== 'string' || !path || /[\u0000-\u001f\u007f]/.test(path) || path.length > 512) throw Error('Invalid virtual path.');
    if (path === '~') path = HOME;
    else if (path.startsWith('~/')) path = HOME + path.slice(1);
    const parts = path.startsWith('/') ? [] : from.split('/').filter(Boolean);
    for (const part of path.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') parts.pop();
      else parts.push(part);
    }
    const result = '/' + parts.join('/');
    if (result.length > 512) throw Error('Virtual path is too long.');
    return result;
  }
  function validate(candidate) {
    if (!(candidate instanceof Map) || candidate.size > MAX_NODES) throw Error('Workspace file limit reached. Reuse an existing virtual file.');
    let total = 0;
    for (const [path, node] of candidate) {
      if (resolve(path, '/') !== path || !['file', 'dir'].includes(node?.type)) throw Error('Invalid workspace data.');
      if (path !== '/' && candidate.get(parentOf(path))?.type !== 'dir') throw Error('Parent directory does not exist.');
      if (node.type === 'file') {
        if (typeof node.content !== 'string' || node.content.length > MAX_FILE) throw Error('A virtual file can contain up to 64,000 characters.');
        total += node.content.length;
      }
    }
    if (total > MAX_TOTAL) throw Error('Workspace text limit reached. Shorten an existing virtual file.');
    for (const path of protectedPaths) if (candidate.get(path)?.type !== 'dir') throw Error('Keep the workspace home directory.');
  }
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (saved && saved.length <= 750_000) {
      const state = JSON.parse(saved);
      if (state.version !== 1 || !Array.isArray(state.entries) || state.entries.length > MAX_NODES) throw Error('Invalid workspace.');
      const restored = new Map();
      for (const entry of state.entries) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || restored.has(entry[0])) throw Error('Invalid workspace entry.');
        restored.set(entry[0], entry[1]);
      }
      validate(restored);
      nodes = restored;
      if (typeof state.cwd === 'string' && restored.get(state.cwd)?.type === 'dir') cwd = state.cwd;
    }
    persistent = Boolean(storage);
  } catch { /* An unavailable or invalid browser store leaves a fresh workspace. */ }
  function save() {
    try {
      if (!storage) {persistent = false; return;}
      storage.setItem(STORAGE_KEY, JSON.stringify({version: 1, cwd, entries: [...nodes]}));
      persistent = true;
    } catch {persistent = false;}
  }
  function commit(candidate) {validate(candidate); nodes = candidate; save();}
  function requireNode(path, candidate = nodes) {
    const node = candidate.get(path);
    if (!node) throw Error(`${path}: No such file or directory.`);
    return node;
  }
  function requireParent(path, candidate = nodes) {
    if (candidate.get(parentOf(path))?.type !== 'dir') throw Error(`${parentOf(path)}: No such directory.`);
  }
  function children(path, candidate = nodes) {
    return [...candidate.keys()].filter(item => item !== path && parentOf(item) === path).sort();
  }
  function readFile(path) {
    const absolute = resolve(path);
    const node = requireNode(absolute);
    if (node.type !== 'file') throw Error(`${absolute}: Is a directory.`);
    return node.content;
  }
  function writeFile(path, content) {
    const absolute = resolve(path);
    if (typeof content !== 'string') throw Error('Virtual file content must be text.');
    requireParent(absolute);
    if (nodes.get(absolute)?.type === 'dir') throw Error(`${absolute}: Is a directory.`);
    const candidate = new Map(nodes);
    candidate.set(absolute, {type: 'file', content});
    commit(candidate);
    return persistent;
  }
  function operands(args, supported = '') {
    const flags = new Set();
    const paths = [];
    let literal = false;
    for (const argument of args) {
      if (!literal && argument === '--') {literal = true; continue;}
      if (!literal && argument.startsWith('-') && argument !== '-') {
        for (const flag of argument.slice(1)) {
          if (!supported.includes(flag)) throw Error(`Unknown option: -${flag}`);
          flags.add(flag);
        }
      } else paths.push(argument);
    }
    return {flags, paths};
  }
  function requirePaths(paths, command, count = 1) {if (paths.length < count) throw Error(`${command}: Missing operand.`);}
  function sources(paths, stdin, command) {
    if (!paths.length) {if (stdin === undefined) throw Error(`${command}: Choose a virtual file or pipe text into this command.`); return [{path: '', text: stdin}];}
    return paths.map(path => ({path, text: path === '-' && stdin !== undefined ? stdin : readFile(path)}));
  }
  function allText(paths, stdin, command) {return sources(paths, stdin, command).map(source => source.text).join('');}
  function numeric(value, command, max = MAX_TOTAL) {const number = Number(value); if (!Number.isInteger(number) || number < 0 || number > max) throw Error(`${command}: Choose a number between 0 and ${max}.`); return number;}
  function workspaceUsage() {return [...nodes.values()].reduce((sum, node) => sum + (node.content?.length || 0), 0);}
  function commandTokens(tokens, stdin) {
    try {
      const command = tokens.shift()?.value;
      const args = tokens.map(token => token.value);
      let output = '';
      switch (command) {
        case 'pwd': output = cwd; break;
        case 'ls': {
          const {flags, paths} = operands(args, 'alh');
          const targets = paths.length ? paths.map(path => resolve(path)) : [cwd];
          output = targets.map(path => {
            const node = requireNode(path);
            const entries = node.type === 'file' ? [path] : children(path).filter(item => flags.has('a') || !nameOf(item).startsWith('.'));
            const listing = entries.map(item => {
              const entry = nodes.get(item);
              const name = nameOf(item) + (entry.type === 'dir' ? '/' : '');
              return flags.has('l') ? `${entry.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--'} visitor ${String(entry.content?.length || 0).padStart(6)} ${name}` : name;
            }).join(flags.has('l') ? '\n' : '  ');
            return (targets.length > 1 ? path + ':\n' : '') + listing;
          }).join('\n\n');
          break;
        }
        case 'cd': {
          if (args.length > 1) throw Error('cd: Too many arguments.');
          const path = args[0] === '-' ? previous : resolve(args[0] || HOME);
          if (requireNode(path).type !== 'dir') throw Error(`${path}: Not a directory.`);
          previous = cwd; cwd = path; save();
          if (args[0] === '-') output = cwd;
          break;
        }
        case 'cat': case 'less': case 'more': {const {flags, paths} = operands(args, 'n'); const text = allText(paths, stdin, command); output = flags.has('n') ? linesOutput(linesOf(text).map((line, index) => `${String(index + 1).padStart(6)}\t${line}`)) : text; break;}
        case 'touch': {
          const {paths} = operands(args); requirePaths(paths, command);
          const candidate = new Map(nodes);
          for (const path of paths.map(path => resolve(path))) {requireParent(path, candidate); if (!candidate.has(path)) candidate.set(path, {type: 'file', content: ''});}
          commit(candidate); break;
        }
        case 'mkdir': {
          const {flags, paths} = operands(args, 'p'); requirePaths(paths, command);
          const candidate = new Map(nodes);
          for (const path of paths.map(path => resolve(path))) {
            if (candidate.has(path)) {if (flags.has('p') && candidate.get(path).type === 'dir') continue; throw Error(`${path}: Already exists.`);}
            if (flags.has('p')) {
              let parent = '';
              for (const part of path.split('/').filter(Boolean)) {
                parent += '/' + part;
                if (candidate.get(parent)?.type === 'file') throw Error(`${parent}: Not a directory.`);
                candidate.set(parent, {type: 'dir'});
              }
            } else {requireParent(path, candidate); candidate.set(path, {type: 'dir'});}
          }
          commit(candidate); break;
        }
        case 'echo': {
          const words = args;
          const noNewline = words[0] === '-n';
          const value = (noNewline ? words.slice(1) : words).join(' ') + (noNewline ? '' : '\n');
          output = value;
          break;
        }
        case 'cp': case 'mv': {
          const {flags, paths} = operands(args, command === 'cp' ? 'rR' : '');
          if (paths.length !== 2) throw Error(`${command}: Use a source and a destination.`);
          const source = resolve(paths[0]);
          const node = requireNode(source);
          let target = resolve(paths[1]);
          if (nodes.get(target)?.type === 'dir') target = (target === '/' ? '' : target) + '/' + nameOf(source);
          if (source === '/' || source === target || target.startsWith(source + '/')) throw Error('Choose a destination outside the source.');
          if (command === 'mv' && protectedPaths.has(source)) throw Error('Keep the workspace home directory.');
          if (node.type === 'dir' && command === 'cp' && !flags.has('r') && !flags.has('R')) throw Error('cp: Use -r to copy a directory.');
          requireParent(target);
          if (nodes.has(target) && (node.type === 'dir' || nodes.get(target).type === 'dir')) throw Error(`${target}: Already exists.`);
          const candidate = new Map(nodes);
          for (const [path, entry] of nodes) if (path === source || path.startsWith(source + '/')) {
            candidate.set(target + path.slice(source.length), {...entry});
            if (command === 'mv') candidate.delete(path);
          }
          const newCwd = command === 'mv' && (cwd === source || cwd.startsWith(source + '/')) ? target + cwd.slice(source.length) : cwd;
          validate(candidate); cwd = newCwd; commit(candidate);
          break;
        }
        case 'rmdir': {
          const {paths} = operands(args);
          requirePaths(paths, command);
          const candidate = new Map(nodes);
          for (const path of paths.map(path => resolve(path))) {
            if (protectedPaths.has(path)) throw Error('Keep the workspace home directory.');
            const node = candidate.get(path);
            if (!node) throw Error(`${path}: No such file or directory.`);
            if (path === cwd || cwd.startsWith(path + '/')) throw Error('Change out of this directory before removing it.');
            if (node.type !== 'dir') throw Error(`${path}: Not a directory.`);
            if (children(path, candidate).length) throw Error(`${path}: Directory is not empty.`);
            candidate.delete(path);
          }
          commit(candidate); break;
        }
        case 'head': case 'tail': {
          let count = 10, byBytes = false, startAt = false;
          const paths = [];
          for (let index = 0; index < args.length; index++) {
            const arg = args[index];
            if (arg === '-n' || arg === '-c') {const value = args[++index]; startAt = command === 'tail' && String(value).startsWith('+'); count = numeric(startAt ? value.slice(1) : value, command); byBytes = arg === '-c';}
            else if (/^-\d+$/.test(arg)) count = numeric(arg.slice(1), command);
            else if (/^-[nc]\d+$/.test(arg)) {count = numeric(arg.slice(2), command); byBytes = arg[1] === 'c';}
            else if (arg.startsWith('-') && arg !== '-') throw Error(`${command}: Unknown option ${arg}.`);
            else paths.push(arg);
          }
          const inputs = sources(paths, stdin, command);
          output = inputs.map(source => {
            let value;
            if (byBytes) {const encoded = new TextEncoder().encode(source.text); const slice = command === 'head' ? encoded.slice(0, count) : startAt ? encoded.slice(Math.max(0, count - 1)) : count ? encoded.slice(-count) : encoded.slice(0, 0); value = new TextDecoder().decode(slice);}
            else {const lines = linesOf(source.text); value = linesOutput(command === 'head' ? lines.slice(0, count) : startAt ? lines.slice(Math.max(0, count - 1)) : count ? lines.slice(-count) : []);}
            return (inputs.length > 1 ? `==> ${source.path} <==\n` : '') + value;
          }).join('\n');
          break;
        }
        case 'wc': {
          const {flags, paths} = operands(args, 'lwcm');
          const inputs = sources(paths, stdin, command);
          const counts = text => [text.split('\n').length - 1, text.trim() ? text.trim().split(/\s+/).length : 0, bytes(text), [...text].length];
          const selected = flags.size ? ['l', 'w', 'c', 'm'].map((flag, index) => flags.has(flag) ? index : -1).filter(index => index >= 0) : [0, 1, 2];
          const totals = [0, 0, 0, 0];
          const rows = inputs.map(source => {const values = counts(source.text); values.forEach((value, index) => {totals[index] += value;}); return selected.map(index => values[index]).join(' ') + (source.path ? ' ' + source.path : '');});
          if (inputs.length > 1) rows.push(selected.map(index => totals[index]).join(' ') + ' total');
          output = rows.join('\n'); break;
        }
        case 'grep': {
          const {flags, paths: values} = operands(args, 'invclFrRE');
          requirePaths(values, command);
          const pattern = values.shift();
          const match = grepMatcher(pattern, flags.has('F'), flags.has('i'), flags.has('E'));
          let inputs;
          if (flags.has('r') || flags.has('R')) {
            inputs = [];
            for (const original of values.length ? values : ['.']) {
              const path = resolve(original), node = requireNode(path);
              for (const [item, child] of nodes) if (child.type === 'file' && (item === path || node.type === 'dir' && item.startsWith(path === '/' ? '/' : path + '/'))) inputs.push({path: item, text: child.content});
            }
          } else inputs = sources(values, stdin, command);
          const rows = [];
          for (const source of inputs) {
            const selected = linesOf(source.text).map((line, index) => ({line, index})).filter(item => match(item.line) !== flags.has('v'));
            if (flags.has('l')) {if (selected.length) rows.push(source.path || '(standard input)');}
            else if (flags.has('c')) rows.push((inputs.length > 1 ? source.path + ':' : '') + selected.length);
            else rows.push(...selected.map(item => (inputs.length > 1 ? source.path + ':' : '') + (flags.has('n') ? item.index + 1 + ':' : '') + item.line));
          }
          output = linesOutput(rows); break;
        }
        case 'find': {
          let path = '.', name, type, insensitive = false, maxdepth = 512;
          let index = 0;
          if (args[0] && !args[0].startsWith('-')) path = args[index++];
          for (; index < args.length; index++) {
            if (args[index] === '-name' || args[index] === '-iname') {insensitive = args[index] === '-iname'; name = args[++index]; if (name === undefined || name.length > 512) throw Error('find: Choose a name pattern.');}
            else if (args[index] === '-type') {type = args[++index]; if (!['f', 'd'].includes(type)) throw Error('find: Type must be f or d.');}
            else if (args[index] === '-maxdepth') maxdepth = numeric(args[++index], command, 512);
            else throw Error(`find: Unknown option ${args[index]}.`);
          }
          const absolute = resolve(path); requireNode(absolute);
          const depth = absolute === '/' ? 0 : absolute.split('/').length - 1;
          output = [...nodes].filter(([item, node]) => (item === absolute || item.startsWith(absolute === '/' ? '/' : absolute + '/')) && (item === '/' ? 0 : item.split('/').length - 1) - depth <= maxdepth && (!type || node.type === (type === 'f' ? 'file' : 'dir')) && (name === undefined || globMatch(insensitive ? nameOf(item).toLowerCase() : nameOf(item), insensitive ? name.toLowerCase() : name))).map(([item]) => item).sort().join('\n');
          break;
        }
        case 'tree': {
          let path = '.', depth = 512, all = false;
          for (let index = 0; index < args.length; index++) {if (args[index] === '-a') all = true; else if (args[index] === '-L') depth = numeric(args[++index], command, 512); else if (args[index].startsWith('-')) throw Error(`tree: Unknown option ${args[index]}.`); else path = args[index];}
          const absolute = resolve(path); requireNode(absolute);
          let directories = 0, files = 0;
          const rows = [absolute];
          const visit = (parent, indent, level) => {
            if (level >= depth) return;
            const entries = children(parent).filter(item => all || !nameOf(item).startsWith('.'));
            entries.forEach((item, index) => {const last = index === entries.length - 1, dir = nodes.get(item).type === 'dir'; rows.push(indent + (last ? '└── ' : '├── ') + nameOf(item) + (dir ? '/' : '')); if (dir) {directories++; visit(item, indent + (last ? '    ' : '│   '), level + 1);} else files++;});
          };
          if (nodes.get(absolute).type === 'dir') visit(absolute, '', 0);
          output = rows.join('\n') + `\n\n${directories} directories, ${files} files`; break;
        }
        case 'sort': {
          const {flags, paths} = operands(args, 'nru');
          let lines = linesOf(allText(paths, stdin, command));
          lines.sort((a, b) => flags.has('n') ? (parseFloat(a) || 0) - (parseFloat(b) || 0) : a < b ? -1 : a > b ? 1 : 0);
          if (flags.has('r')) lines.reverse();
          if (flags.has('u')) lines = [...new Set(lines)];
          output = linesOutput(lines); break;
        }
        case 'uniq': {
          const {flags, paths} = operands(args, 'cdu');
          const groups = [];
          for (const line of linesOf(allText(paths, stdin, command))) {if (groups.at(-1)?.line === line) groups.at(-1).count++; else groups.push({line, count: 1});}
          output = linesOutput(groups.filter(group => (!flags.has('d') || group.count > 1) && (!flags.has('u') || group.count === 1)).map(group => (flags.has('c') ? String(group.count).padStart(7) + ' ' : '') + group.line));
          break;
        }
        case 'cut': {
          let delimiter = '\t', selection, characters = false;
          const paths = [];
          for (let index = 0; index < args.length; index++) {
            const arg = args[index];
            if (arg === '-d' || arg.startsWith('-d')) {delimiter = arg.length > 2 ? arg.slice(2) : args[++index]; if (typeof delimiter !== 'string' || [...delimiter].length !== 1) throw Error('cut: Choose one delimiter character.');}
            else if (arg === '-f' || arg === '-c' || /^-[fc].+/.test(arg)) {characters = arg[1] === 'c'; selection = arg.length > 2 ? arg.slice(2) : args[++index];}
            else if (arg.startsWith('-') && arg !== '-') throw Error(`cut: Unknown option ${arg}.`);
            else paths.push(arg);
          }
          if (typeof selection !== 'string' || !/^(?:\d+(?:-\d*)?|-\d+)(?:,(?:\d+(?:-\d*)?|-\d+))*$/.test(selection)) throw Error('cut: Choose fields with -f or characters with -c, for example -f 1,3.');
          const ranges = selection.split(',').map(part => {const values = part.split('-'); const first = values[0] ? numeric(values[0], command) : 1; const last = values.length === 1 ? first : values[1] ? numeric(values[1], command) : Infinity; if (!first || first > last) throw Error('cut: Invalid range.'); return [first, last];});
          output = linesOutput(linesOf(allText(paths, stdin, command)).map(line => {const fields = characters ? [...line] : line.split(delimiter); return fields.filter((_, index) => ranges.some(([first, last]) => index + 1 >= first && index + 1 <= last)).join(characters ? '' : delimiter);}));
          break;
        }
        case 'tr': {
          let remove = false;
          const values = [...args];
          if (values[0] === '-d') {remove = true; values.shift();}
          if (values.length !== (remove ? 1 : 2) || stdin === undefined) throw Error('tr: Pipe text into tr SET1 SET2, or tr -d SET.');
          const expand = value => {if (value === '[:lower:]') return 'abcdefghijklmnopqrstuvwxyz'; if (value === '[:upper:]') return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; if (value === '[:digit:]') return '0123456789'; return value.replace(/([a-zA-Z0-9])-([a-zA-Z0-9])/g, (_, first, last) => {const count = last.charCodeAt(0) - first.charCodeAt(0) + 1; if (count < 1 || count > 128) throw Error('tr: Invalid range.'); return Array.from({length: count}, (_, index) => String.fromCharCode(first.charCodeAt(0) + index)).join('');});};
          const from = [...expand(values[0])], to = remove ? [] : [...expand(values[1])];
          if (!remove && !to.length) throw Error('tr: The replacement set is empty.');
          output = [...stdin].map(char => {const index = from.indexOf(char); return index < 0 ? char : remove ? '' : to[Math.min(index, to.length - 1)];}).join('');
          break;
        }
        case 'rev': case 'nl': {
          const {paths} = operands(args);
          const lines = linesOf(allText(paths, stdin, command));
          output = linesOutput(lines.map((line, index) => command === 'rev' ? [...line].reverse().join('') : `${String(index + 1).padStart(6)}\t${line}`)); break;
        }
        case 'printf': {
          if (!args.length) throw Error('printf: Choose a format string.');
          const format = args[0].replace(/\\(n|t|r|\\|[0-7]{1,3})/g, (_, value) => ({n: '\n', t: '\t', r: '\r', '\\': '\\'}[value] ?? String.fromCharCode(parseInt(value, 8))));
          let argument = 1, repeat = true;
          while (repeat) {
            let conversions = 0;
            for (let index = 0; index < format.length; index++) {
              if (format[index] !== '%') {output += format[index]; continue;}
              if (format[index + 1] === '%') {output += '%'; index++; continue;}
              const match = format.slice(index).match(/^%([-+0 ]?)(\d{0,3})(?:\.(\d{1,2}))?([sdif])/);
              if (!match) throw Error('printf: Supported formats are %s, %d, %i, %f, and %%.');
              conversions++;
              const raw = args[argument++] ?? (match[4] === 's' ? '' : '0');
              let value = raw;
              if (match[4] !== 's') {const number = Number(raw); if (!Number.isFinite(number)) throw Error('printf: Expected a finite number.'); value = match[4] === 'f' ? number.toFixed(match[3] ? Number(match[3]) : 6) : String(Math.trunc(number));}
              else if (match[3] !== undefined) value = value.slice(0, Number(match[3]));
              const width = Number(match[2] || 0);
              output += match[1] === '-' ? value.padEnd(width) : value.padStart(width, match[1] === '0' ? '0' : ' ');
              index += match[0].length - 1;
              if (output.length > MAX_OUTPUT) throw Error('printf: Output limit reached.');
            }
            repeat = conversions > 0 && argument < args.length;
          }
          break;
        }
        case 'basename': case 'dirname': {
          requirePaths(args, command);
          if (command === 'basename') {if (args.length > 2) throw Error('basename: Choose a path and optional suffix.'); let path = args[0].replace(/\/+$/, '') || '/'; path = path === '/' ? '/' : path.slice(path.lastIndexOf('/') + 1); if (args[1] && path.endsWith(args[1])) path = path.slice(0, -args[1].length); output = path;}
          else output = args.map(value => {const path = value.replace(/\/+$/, '') || '/'; const slash = path.lastIndexOf('/'); return path === '/' ? '/' : slash < 0 ? '.' : slash === 0 ? '/' : path.slice(0, slash);}).join('\n');
          break;
        }
        case 'realpath': {const {flags, paths} = operands(args, 'm'); requirePaths(paths, command); output = paths.map(path => {const absolute = resolve(path); if (!flags.has('m')) requireNode(absolute); return absolute;}).join('\n'); break;}
        case 'stat': case 'file': {
          const {paths} = operands(args); requirePaths(paths, command);
          output = paths.map(path => {
            const absolute = resolve(path), node = requireNode(absolute);
            if (command === 'file') return `${path}: ${node.type === 'dir' ? 'directory (virtual workspace)' : !node.content.length ? 'empty' : /[^\x00-\x7f]/.test(node.content) ? 'Unicode text, UTF-8' : 'ASCII text'}`;
            return `File: ${absolute}\nType: ${node.type === 'dir' ? 'directory' : 'regular text file'}\nSize: ${node.type === 'file' ? bytes(node.content) : 0} bytes\nOwner: visitor (virtual workspace)\nPermissions: ${node.type === 'dir' ? 'rwxr-xr-x' : 'rw-r--r--'}\nTimestamps are not tracked in this browser workspace.`;
          }).join('\n\n'); break;
        }
        case 'du': {
          const {flags, paths} = operands(args, 'sh');
          const size = path => [...nodes].reduce((sum, [item, node]) => sum + (node.type === 'file' && (item === path || item.startsWith(path === '/' ? '/' : path + '/')) ? bytes(node.content) : 0), 0);
          const display = value => flags.has('h') ? value >= 1024 ? (value / 1024).toFixed(1) + 'K' : value + 'B' : String(value);
          const rows = [];
          for (const rawPath of paths.length ? paths : ['.']) {const path = resolve(rawPath); const node = requireNode(path); const entries = !flags.has('s') && node.type === 'dir' ? [...nodes].filter(([item, child]) => item !== path && child.type === 'dir' && item.startsWith(path === '/' ? '/' : path + '/')).map(([item]) => item).sort((a, b) => b.length - a.length) : []; for (const item of [...entries, path]) rows.push(`${display(size(item))}\t${item}`);}
          output = rows.join('\n'); break;
        }
        case 'df': {const used = workspaceUsage(); output = `Virtual workspace (characters, not host disk)\nCapacity  Used  Available  Use%  Mounted on\n${MAX_TOTAL}  ${used}  ${MAX_TOTAL - used}  ${Math.ceil(used / MAX_TOTAL * 100)}%  /`; break;}
        case 'date': {
          const utc = args.includes('-u');
          const format = args.find(arg => arg.startsWith('+'))?.slice(1);
          if (args.some(arg => arg !== '-u' && !arg.startsWith('+'))) throw Error('date: Use -u or a +format string.');
          const date = new Date(), get = name => date[`${utc ? 'getUTC' : 'get'}${name}`](), pad = value => String(value).padStart(2, '0');
          const values = {Y: get('FullYear'), m: pad(get('Month') + 1), d: pad(get('Date')), H: pad(get('Hours')), M: pad(get('Minutes')), S: pad(get('Seconds')), s: Math.floor(date.getTime() / 1000), Z: utc ? 'UTC' : Intl.DateTimeFormat().resolvedOptions().timeZone, '%': '%'};
          values.F = `${values.Y}-${values.m}-${values.d}`; values.T = `${values.H}:${values.M}:${values.S}`;
          output = format === undefined ? utc ? date.toUTCString() : date.toString() : format.replace(/%([YmdHMsSZFT%])/g, (_, key) => values[key]); break;
        }
        case 'uname': {
          const {flags, paths} = operands(args, 'asrmn'); if (paths.length) throw Error('uname: Unknown argument.');
          output = flags.has('a') ? 'Portfolio Browser Workspace · virtual-shell-1 · no host kernel access' : flags.has('n') ? globalThis.location?.hostname || 'portfolio-workspace' : flags.has('r') ? 'virtual-shell-1' : flags.has('m') ? 'browser sandbox' : 'Portfolio Browser Workspace'; break;
        }
        case 'whoami': output = 'visitor'; break;
        case 'id': {const {flags, paths} = operands(args, 'ugn'); if (paths.length) throw Error('id: Only the current virtual visitor identity is available.'); output = flags.has('u') || flags.has('g') ? flags.has('n') ? 'visitor' : '1000' : 'uid=1000(visitor) gid=1000(visitor) groups=1000(visitor) [virtual workspace]'; break;}
        case 'groups': output = 'visitor (virtual workspace)'; break;
        case 'who': output = 'visitor · current browser workspace'; break;
        case 'hostname': if (args.length) throw Error(permissionMessage('hostname')); output = globalThis.location?.hostname || 'portfolio-workspace'; break;
        case 'env': case 'printenv': {
          const environment = {HOME, USER: 'visitor', LOGNAME: 'visitor', SHELL: 'portfolio-virtual-shell', PWD: cwd};
          if (command === 'env' && args.length) throw Error('env: This workspace supports reading its own virtual environment.');
          output = args.length ? args.map(name => Object.hasOwn(environment, name) ? environment[name] : '').join('\n') : Object.entries(environment).map(([name, value]) => `${name}=${value}`).join('\n'); break;
        }
        case 'history': if (args.length) throw Error('history: Use history without arguments.'); output = (historyProvider ? historyProvider() : commandHistory).map((line, index) => `${String(index + 1).padStart(4)}  ${line}`).join('\n'); break;
        case 'seq': {
          if (!args.length || args.length > 3) throw Error('seq: Use LAST, FIRST LAST, or FIRST STEP LAST.');
          const values = args.map(Number); if (values.some(value => !Number.isFinite(value))) throw Error('seq: Choose finite numbers.');
          const first = values.length === 1 ? 1 : values[0], step = values.length === 3 ? values[1] : 1, last = values.at(-1);
          if (!step) throw Error('seq: Step cannot be zero.');
          const count = Math.max(0, Math.floor((last - first) / step) + 1);
          if (count > 10000) throw Error('seq: Limit output to 10,000 numbers.');
          output = linesOutput(Array.from({length: count}, (_, index) => String(Number((first + index * step).toPrecision(14))))); break;
        }
        case 'true': case 'false': return {handled: true, output: '', code: command === 'true' ? 0 : 1};
        case 'nano': {
          const {paths} = operands(args); if (paths.length !== 1) throw Error('nano: Choose one virtual file.');
          const path = resolve(paths[0]); requireParent(path);
          return {handled: true, editor: {path, content: nodes.has(path) ? readFile(path) : ''}};
        }
      }
      return {handled: true, output};
    } catch (error) {return {handled: true, output: String(error.message), code: 1};}
  }
  function execute(raw) {
    if (typeof raw !== 'string') return {handled: false};
    const first = commandName(raw.trim().split(/\s/)[0]);
    if (deniedCommands.has(first)) {commandHistory.push(raw); return {handled: true, output: permissionMessage(first), code: 126};}
    if (!VIRTUAL_SHELL_COMMANDS.includes(first) && !raw.trim().startsWith("'") && !raw.trim().startsWith('"')) return {handled: false};
    try {
      if (raw.length > 128_000) throw Error('Command text limit reached.');
      const segments = [[]];
      for (const token of tokensFor(raw)) {if (token.type === 'pipe') segments.push([]); else segments.at(-1).push(token);}
      if (segments.some(segment => !segment.length)) throw Error('Choose a command on each side of the pipe.');
      // Inspect the entire pipeline before any command can create or change a
      // virtual file. Administrative commands never reach an executor.
      for (const segment of segments) {const name = commandName(segment[0].value); if (deniedCommands.has(name)) {commandHistory.push(raw); return {handled: true, output: permissionMessage(name), code: 126};} if (!VIRTUAL_SHELL_COMMANDS.includes(name)) return {handled: false}; segment[0] = {...segment[0], value: name};}
      commandHistory.push(raw);
      let stdin;
      let result;
      for (const segment of segments) {
        const redirect = segment.findIndex(token => token.type === 'redirect');
        let destination, append = false;
        if (redirect >= 0) {if (redirect !== segment.length - 2 || segment.at(-1).type !== 'word') throw Error('Use > file or >> file at the end of a command.'); destination = segment.at(-1).value; append = segment[redirect].value === '>>'; segment.splice(redirect);}
        if (segments.length > 1 && segment[0].value === 'nano') throw Error('nano opens an editor and cannot run in a pipeline.');
        result = commandTokens(segment, stdin);
        if (result.code) return result;
        if ((result.output?.length || 0) > MAX_OUTPUT) throw Error('Command output limit reached.');
        if (destination !== undefined) {if (result.editor) throw Error('Editor output cannot be redirected.'); const path = resolve(destination); writeFile(path, (append && nodes.has(path) ? readFile(path) : '') + (result.output || '')); result = {...result, output: ''};}
        stdin = result.output || '';
      }
      return result;
    } catch (error) {return {handled: true, output: String(error.message), code: 1};}
  }
  function complete(prefix) {
    try {
      const slash = prefix.lastIndexOf('/');
      const head = slash >= 0 ? prefix.slice(0, slash + 1) : '';
      const start = slash >= 0 ? prefix.slice(slash + 1) : prefix;
      return children(resolve(head || '.')).filter(path => nameOf(path).startsWith(start)).map(path => head + nameOf(path) + (nodes.get(path).type === 'dir' ? '/' : ''));
    } catch {return [];}
  }
  return {execute, readFile, writeFile, complete, resolve, exists: path => {try {return nodes.has(resolve(path));} catch {return false;}}, get cwd() {return cwd;}, get persistent() {return persistent;}};
}
