/* Visit AFA: gallery carousel + full-screen photo viewer */
(() => {
  const { $, $$, escapeHTML } = TW;
  const track = $('#galleryTrack');
  const step = dir => {
    const img = track.querySelector('img');
    const w = img ? img.getBoundingClientRect().width + 16 : 240;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    if (dir > 0 && atEnd) track.scrollTo({ left: 0, behavior: 'smooth' });
    else if (dir < 0 && track.scrollLeft <= 0) track.scrollTo({ left: track.scrollWidth, behavior: 'smooth' });
    else track.scrollBy({ left: dir * w, behavior: 'smooth' });
  };
  $('#galPrev').addEventListener('click', () => step(-1));
  $('#galNext').addEventListener('click', () => step(1));

  /* ---------- Lightbox ---------- */
  const photos = $$('img', track);
  photos.forEach((img, i) => {
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', t('visit.photo', { n: i + 1, total: photos.length }));
  });

  const box = document.createElement('div');
  box.className = 'lightbox';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.innerHTML = `
    <img alt="" />
    <button type="button" class="lb-btn lb-close" aria-label="${escapeHTML(t('visit.close'))}">×</button>
    <button type="button" class="lb-btn lb-prev" aria-label="${escapeHTML(t('visit.prev'))}">‹</button>
    <button type="button" class="lb-btn lb-next" aria-label="${escapeHTML(t('visit.next'))}">›</button>
    <span class="lb-count" aria-live="polite"></span>`;
  document.body.append(box);
  const big = $('img', box), count = $('.lb-count', box);
  let index = 0, opener = null;

  const show = i => {
    index = (i + photos.length) % photos.length;
    big.src = photos[index].currentSrc || photos[index].src;
    big.alt = photos[index].alt || '';
    count.textContent = t('visit.photo', { n: index + 1, total: photos.length });
  };
  const open = i => {
    opener = document.activeElement;
    show(i);
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    $('.lb-close', box).focus();
  };
  const close = () => {
    box.hidden = true;
    document.body.style.overflow = '';
    opener?.focus?.();
  };

  track.addEventListener('click', e => { const i = photos.indexOf(e.target); if (i >= 0) open(i); });
  track.addEventListener('keydown', e => {
    const i = photos.indexOf(e.target);
    if (i >= 0 && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(i); }
  });
  $('.lb-close', box).addEventListener('click', close);
  $('.lb-prev', box).addEventListener('click', () => show(index - 1));
  $('.lb-next', box).addEventListener('click', () => show(index + 1));
  box.addEventListener('click', e => { if (e.target === box) close(); });
  document.addEventListener('keydown', e => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key === 'ArrowRight') show(index + 1);
    else if (e.key === 'Tab') { // keep focus inside the viewer
      const f = $$('button', box);
      const k = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  // Swipe on phones
  let x0 = null;
  box.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1));
    x0 = null;
  });
})();
