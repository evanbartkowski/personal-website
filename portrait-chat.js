// An in-page conversation owned by the current home-page lifetime.
export function mountPortraitChat(host, {launch, portrait, beforeOpen = () => {}} = {}) {
  if (!host || !launch || !portrait) return null;
  const lifetime = new AbortController(), motion = matchMedia('(prefers-reduced-motion: reduce)');
  const on = (node, event, handler) => node.addEventListener(event, handler, {signal: lifetime.signal});
  host.innerHTML = `<div class="portrait-chat-head"><span>Ask my AI</span><button id="portrait-chat-close" type="button" aria-label="Close AI conversation">&times;</button></div>
    <p class="portrait-chat-disclosure">AI representative &middot; based on Evan&rsquo;s public portfolio.</p>
    <div class="portrait-chat-connection"><span id="portrait-chat-status" role="status">Ready to connect.</span><button id="portrait-chat-reconnect" type="button">Reconnect</button></div>
    <div id="portrait-chat-messages" role="log" aria-label="AI conversation" aria-live="off"><p class="portrait-chat-intro">Ask about my work, projects, or education.</p></div>
    <form id="portrait-chat-form"><label for="portrait-chat-input">Your question</label><div class="portrait-chat-composer"><textarea id="portrait-chat-input" rows="2" maxlength="2000" placeholder="Ask me something…" required></textarea><button id="portrait-chat-send" type="submit" aria-label="Send question">Send <span aria-hidden="true">↗</span></button></div></form>
    <p class="sr-only" id="portrait-chat-announcement" role="status" aria-live="polite"></p>`;
  const one = selector => host.querySelector(selector);
  const input = one('#portrait-chat-input'), form = one('#portrait-chat-form'), messages = one('#portrait-chat-messages');
  const status = one('#portrait-chat-status'), reconnect = one('#portrait-chat-reconnect'), sendButton = one('#portrait-chat-send');
  const history = [];
  let active = true, opened = false, available = false, busy = false, checking = false, generation = 0;
  let requestController, statusController, statusPromise, typing;

  function state(value) {
    portrait.dataset.aiState = value;host.dataset.aiState = value;
    portrait.dispatchEvent(new CustomEvent('portrait:aistatechange', {detail: {state: value}}));
  }
  function visibility(value) {
    portrait.dataset.chatOpen = String(value);
    portrait.dispatchEvent(new CustomEvent('portrait:chatvisibilitychange', {detail: {open: value}}));
  }
  function controls() {
    if (!active) return;
    sendButton.disabled = busy || !available;input.disabled = busy;reconnect.disabled = busy || checking;
    messages.setAttribute('aria-busy', String(busy));
  }
  function finishTyping(complete = true) {
    if (!typing) return;
    const current = typing;typing = undefined;cancelAnimationFrame(current.frame);
    if (complete && active) current.node.textContent = current.text;
    current.resolve(complete);
  }
  function reveal(node, text) {
    finishTyping(false);
    if (motion.matches || document.hidden) {node.textContent = text;return Promise.resolve(true);}
    const characters = Array.from(text), duration = Math.min(5200, Math.max(650, characters.length * 13));
    return new Promise(resolve => {
      const current = {node, text, resolve, frame: 0, started: 0};typing = current;
      function paint(now) {
        if (!active || !opened || typing !== current) return;
        if (!current.started) current.started = now;
        const follow = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 48;
        const count = Math.min(characters.length, Math.max(1, Math.floor((now - current.started) / duration * characters.length)));
        node.textContent = characters.slice(0, count).join('');
        if (follow) messages.scrollTop = messages.scrollHeight;
        if (count === characters.length) {typing = undefined;resolve(true);}
        else current.frame = requestAnimationFrame(paint);
      }
      current.frame = requestAnimationFrame(paint);
    });
  }
  function append(role, text = '') {
    one('.portrait-chat-intro')?.remove();
    const article = document.createElement('article');article.className = `portrait-message portrait-message-${role}`;
    const label = document.createElement('span');label.className = 'portrait-message-label';label.textContent = role === 'user' ? 'YOU' : 'EVAN / AI';
    const paragraph = document.createElement('p');paragraph.className = 'message-text';paragraph.textContent = text;
    article.append(label, paragraph);messages.append(article);messages.scrollTop = messages.scrollHeight;
    return {article, paragraph};
  }
  async function checkAvailability() {
    if (statusPromise) return statusPromise;
    const controller = new AbortController();statusController = controller;checking = true;
    status.textContent = 'Connecting…';controls();
    statusPromise = (async () => {
      try {
        const response = await fetch('/api/chat/status', {headers: {Accept: 'application/json'}, signal: AbortSignal.any([lifetime.signal, controller.signal, AbortSignal.timeout(8000)])});
        const result = response.ok ? await response.json() : null;
        if (!active || controller.signal.aborted) return false;
        available = result?.available === true;
        status.textContent = available ? 'Ready for your question.' : 'AI is unavailable right now. Try reconnecting shortly.';
        if (available && !busy) state('idle');
      } catch {
        if (active && !controller.signal.aborted) {available = false;status.textContent = 'Connection unavailable. You can reconnect.';}
      } finally {
        if (statusController === controller) {statusController = undefined;statusPromise = undefined;checking = false;controls();}
      }
      return active && available;
    })();
    return statusPromise;
  }
  function requestMessages(question) {
    let entries = [{role: 'user', content: question.slice(0, 2000)}], total = entries[0].content.length;
    for (let index = history.length - 2; index >= 0; index -= 2) {
      const pair = history.slice(index, index + 2).map(entry => ({role: entry.role, content: entry.content.slice(0, 2000)}));
      const size = pair.reduce((sum, entry) => sum + entry.content.length, 0), candidate = [...pair, ...entries];
      if (candidate.length > 11 || total + size > 11000 || new TextEncoder().encode(JSON.stringify({messages: candidate})).byteLength > 23000) break;
      entries = candidate;total += size;
    }
    return entries;
  }
  function showFailure(entry, question, message) {
    entry.querySelector('.portrait-chat-error')?.remove();
    const error = document.createElement('div');error.className = 'portrait-chat-error';
    const description = document.createElement('p');description.textContent = message;
    const retry = document.createElement('button');retry.type = 'button';retry.className = 'portrait-chat-retry';retry.textContent = 'Retry question';
    on(retry, 'click', () => send(question, entry));error.append(description, retry);entry.append(error);
    messages.scrollTop = messages.scrollHeight;
  }
  async function send(question, existingEntry) {
    question = String(question).trim().slice(0, 2000);
    if (!active || !opened || busy || !question) return;
    const openingGeneration = generation;
    if (!available && !await checkAvailability()) return;
    if (!active || !opened || busy || openingGeneration !== generation) return;
    const token = ++generation, entry = existingEntry || append('user', question).article;
    entry.querySelector('.portrait-chat-error')?.remove();input.value = '';busy = true;
    state('thinking');status.textContent = 'Thinking…';controls();
    const pending = document.createElement('p');pending.className = 'portrait-chat-pending';pending.textContent = 'Formulating a response…';messages.append(pending);messages.scrollTop = messages.scrollHeight;
    const controller = new AbortController();requestController = controller;
    try {
      const response = await fetch('/api/chat', {method: 'POST',headers: {'Content-Type': 'application/json',Accept: 'application/json'},body: JSON.stringify({messages: requestMessages(question)}),signal: AbortSignal.any([lifetime.signal, controller.signal, AbortSignal.timeout(45000)])});
      const result = await response.json();
      if (!active || token !== generation || controller.signal.aborted) return;
      if (!response.ok) {const error = new Error('Chat unavailable');error.status = response.status;throw error;}
      if (typeof result.reply !== 'string' || !result.reply.trim() || result.reply.length > 20000) throw Error('Invalid reply');
      pending.remove();history.push({role: 'user',content: question}, {role: 'assistant',content: result.reply});
      const answer = append('assistant');state('responding');status.textContent = 'Typing…';
      await reveal(answer.paragraph, result.reply);
      if (!active || token !== generation) return;
      state('idle');status.textContent = 'Ready for your question.';
      one('#portrait-chat-announcement').textContent = `AI response: ${result.reply}`;
    } catch (error) {
      if (!active || token !== generation || controller.signal.aborted) return;
      pending.remove();state('error');
      const message = error.status === 429 ? 'The AI is busy. Wait a moment, then retry.' : error.status === 503 ? 'AI chat is temporarily unavailable. Please retry shortly.' : error.name === 'TimeoutError' || error.name === 'AbortError' ? 'The response took too long. You can retry your question.' : 'The response could not be loaded. You can retry your question.';
      status.textContent = 'No response received.';showFailure(entry, question, message);
    } finally {
      if (active && token === generation) {requestController = undefined;busy = false;controls();if (opened) input.focus({preventScroll: true});}
    }
  }
  async function open(question = '', sendImmediately = false) {
    if (!active) return;
    beforeOpen();opened = true;host.hidden = false;launch.setAttribute('aria-expanded', 'true');visibility(true);
    if (!busy) {if (question) input.value = question;input.focus({preventScroll: true});}
    host.scrollIntoView({behavior: motion.matches ? 'instant' : 'smooth',block: 'nearest'});
    if (busy) return;
    const openingGeneration = generation;
    await checkAvailability();
    if (sendImmediately && question && active && opened && !busy && openingGeneration === generation) send(question);
  }
  function close({focus = true} = {}) {
    if (!active) return;
    const wasBusy = busy, wasTyping = Boolean(typing);opened = false;generation++;
    requestController?.abort();requestController = undefined;
    statusController?.abort();statusController = undefined;statusPromise = undefined;checking = false;
    finishTyping(true);one('.portrait-chat-pending')?.remove();busy = false;state('idle');visibility(false);
    if (wasBusy && !wasTyping) {
      const last = messages.querySelector('.portrait-message-user:last-of-type');
      if (last) showFailure(last, last.querySelector('.message-text').textContent, 'Response cancelled. You can retry this question.');
    }
    status.textContent = available ? 'Ready for your question.' : 'Ready to connect.';
    host.hidden = true;launch.setAttribute('aria-expanded', 'false');controls();
    if (focus) launch.focus({preventScroll: true});
  }
  on(launch, 'click', () => opened ? close() : open());
  on(one('#portrait-chat-close'), 'click', () => close());
  on(reconnect, 'click', () => checkAvailability());
  on(form, 'submit', event => {event.preventDefault();send(input.value);});
  on(input, 'keydown', event => {if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {event.preventDefault();send(input.value);}});
  on(document, 'keydown', event => {if (event.key === 'Escape' && opened && !document.querySelector('dialog[open]')) {event.preventDefault();close();}});
  on(motion, 'change', () => {if (motion.matches && typing) finishTyping(true);});
  on(document, 'visibilitychange', () => {if (document.hidden && typing) finishTyping(true);});
  state('idle');visibility(false);controls();
  return {open, close, dispose() {
    if (!active) return;
    generation++;requestController?.abort();statusController?.abort();finishTyping(false);state('idle');visibility(false);
    active = false;lifetime.abort();busy = false;
  }};
}
