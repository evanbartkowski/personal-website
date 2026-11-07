import { credentialDocuments } from './credential-data.js';

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text) item.textContent = text;
  return item;
}
function resource(label, href, download, className = 'text-link') {
  const link = node('a', className, label);
  link.href = href;
  if (download) link.download = download;
  else {link.target = '_blank'; link.rel = 'noopener noreferrer';}
  return link;
}

export function mountCredentialArchive(section, {signal} = {}) {
  const on = (target, event, handler, options = {}) => target.addEventListener(event, handler, {...options, ...(signal ? {signal} : {})});
  const frames = new Set();
  const schedule = callback => {const frame = requestAnimationFrame(() => {frames.delete(frame); if (!signal?.aborted) callback();}); frames.add(frame);};
  const dialog = document.querySelector('#certificate-dialog');
  if (!dialog) return;
  function openDocument(id) {
    const record = credentialDocuments.find(item => item.id === id);
    if (!record) return;
    dialog.querySelector('#certificate-dialog-title').textContent = record.title;
    dialog.querySelector('.certificate-dialog-issuer').textContent = `${record.issuer} · ${record.dateLabel}`;
    dialog.querySelector('.certificate-modal-note').textContent = record.detail;
    const image = dialog.querySelector('.certificate-image-wrap img');
    image.src = record.preview;
    image.alt = `Original ${record.title} document supplied by Evan Bartkowski`;
    image.width = 1100; image.height = record.id === 'nscs' ? 852 : 850;
    const actions = dialog.querySelector('.certificate-dialog-actions');
    actions.replaceChildren(
      resource('Download original PDF ↓',record.pdf,record.downloadName,'button button-primary'),
      resource('Open PDF ↗',record.pdf,null,'button button-secondary'),
    );
    if (record.verification) actions.append(resource('Issuer verification ↗',record.verification));
    if (record.originalImage) actions.append(resource(record.id === 'nscs' ? 'Original JPG ↓' : 'Download Badge ↓',record.originalImage,record.id === 'nscs' ? 'Evan-Bartkowski-NSCS-Membership.jpg' : 'Evan-Bartkowski-CompTIA-CSAP-Badge.png'));
    dialog.showModal();
  }
  for (const button of document.querySelectorAll('.credential-proof[data-document]')) {
    on(button, 'click',()=>openDocument(button.dataset.document));
  }
  if (!section) return;
  const track = section.querySelector('.document-track');
  const cards = [];
  for (const record of credentialDocuments) {
    const card = node('article', 'document-card');
    card.dataset.documentCategory = record.category;
    card.setAttribute('role','listitem');
    const meta = node('div', 'document-meta mono');
    meta.append(node('span', '', `DOC. ${record.number}`), node('span', '', record.categoryLabel));
    const preview = node('button','document-preview');
    preview.type = 'button';
    preview.dataset.document = record.id;
    preview.setAttribute('aria-label', `Preview ${record.title}`);
    const image = node('img');
    image.src = record.preview;
    image.alt = `Original ${record.title} document supplied by Evan Bartkowski`;
    image.width = 1100; image.height = record.id === 'nscs' ? 852 : 850;
    image.loading = 'lazy'; image.decoding = 'async';
    const hint = node('span', 'document-preview-hint', 'Inspect document ↗');
    hint.setAttribute('aria-hidden','true');
    preview.append(image,hint);
    const caption = node('div', 'document-caption');
    caption.append(node('h3','',record.title), node('p','document-issuer',record.issuer));
    const date = node('time','document-date mono',record.dateLabel);
    date.dateTime = record.date; caption.append(date);
    const actions = node('div','document-actions');
    const inspect = node('button','','Preview ↗');
    inspect.type = 'button'; inspect.dataset.document = record.id;
    inspect.setAttribute('aria-label', `Preview ${record.title}`);
    const download = resource('Download PDF ↓',record.pdf,record.downloadName);
    download.setAttribute('aria-label', `Download ${record.title} PDF`);
    actions.append(inspect,download); caption.append(actions);
    card.append(meta,preview,caption); cards.push(card); track.append(card);
  }

  on(track, 'click', event => {
    const button = event.target.closest('[data-document]');
    if (button) openDocument(button.dataset.document);
  });


  const previous = section.querySelector('[data-document-direction="previous"]');
  const next = section.querySelector('[data-document-direction="next"]');
  const controls = () => {
    previous.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
  };
  const pageSize = () => {
    const visible = cards.find(card=>!card.hidden);
    return visible ? visible.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).gap) || 24) : track.clientWidth;
  };
  const move = direction => track.scrollBy({left:direction*pageSize(),behavior:document.body.classList.contains('motion-paused')?'instant':'smooth'});
  on(previous, 'click',()=>move(-1));
  on(next, 'click',()=>move(1));
  on(track, 'scroll',controls,{passive:true});
  on(track, 'keydown',event=>{
    if (event.target !== track || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home' || event.key === 'End') track.scrollTo({left:event.key==='Home'?0:track.scrollWidth,behavior:'instant'});
    else move(event.key==='ArrowRight'?1:-1);
  });
  const resizeObserver = new ResizeObserver(controls);
  resizeObserver.observe(track);
  for (const button of section.querySelectorAll('[data-document-filter]')) {
    on(button, 'click',()=>{
      for (const item of section.querySelectorAll('[data-document-filter]')) {
        item.setAttribute('aria-pressed',String(item===button));
        item.classList.toggle('active',item===button);
      }
      const category = button.dataset.documentFilter;
      let count = 0;
      for (const card of cards) {card.hidden = category !== 'all' && card.dataset.documentCategory !== category; if(!card.hidden) count++;}
      track.scrollTo({left:0,behavior:'instant'});
      section.querySelector('#document-status').textContent = `${count} ${count===1?'document':'documents'} shown.`;
      schedule(controls);
    });
  }
  schedule(controls);
  return () => {resizeObserver.disconnect(); for (const frame of frames) cancelAnimationFrame(frame);};
}
