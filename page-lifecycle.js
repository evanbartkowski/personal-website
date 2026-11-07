// Each fetched page owns its handlers, requests, observers and visual loops.
// Settings and the audio player live outside this lifetime.
export function createPageLifecycle() {
  const controller = new AbortController();
  const roots = [...document.body.children].filter(node => !node.matches('#site-settings, #portfolio-music-player, #portfolio-background-music, .settings-launch'));
  const cleanups = [];
  const timers = new Set();
  let active = true;
  const all = (selector, context) => context ? [...context.querySelectorAll(selector)] : roots.flatMap(root => [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)]);
  const one = (selector, context) => all(selector, context)[0] || null;
  const on = (target, event, listener, options = {}) => target?.addEventListener(event, listener, {...(typeof options === 'boolean' ? {capture: options} : options), signal: controller.signal});
  const own = node => {roots.push(node); document.body.append(node); return node;};
  const cleanup = callback => {if (typeof callback === 'function') cleanups.push(callback);};
  const timeout = (callback, delay) => {
    const id = setTimeout(() => {timers.delete(id); if (active) callback();}, delay);
    timers.add(id);
    return id;
  };
  const request = async (url, options = {}) => {
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    const response = await fetch(url, {...options, signal});
    if (!active) throw new DOMException('Page closed', 'AbortError');
    return response;
  };
  return {
    one, all, on, own, cleanup, timeout, request, signal: controller.signal,
    get active() {return active;},
    dispose() {
      if (!active) return;
      active = false;
      controller.abort();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const callback of cleanups.reverse()) callback();
    },
  };
}
