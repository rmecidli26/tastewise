/* Dish page: gallery, size/option picker, ingredients, favorites, reviews */
(() => {
  const { $, $$, escapeHTML, param, price, stars, ratingNum, dishPhoto, loadingHTML, getMe, loginUrl, loadFavorites, syncFavButtons, favorites, toast, showMsg, I } = TW;
  const id = Number(param('id'));
  if (!id) { location.replace('explore.html'); return; }

  const gallery = $('#galleryCol'), info = $('#infoCol');
  // Came from Explore? Go back to the same filtered results.
  const backHref = document.referrer && new URL(document.referrer).pathname.endsWith('/explore.html')
    ? new URL(document.referrer).pathname.slice(1) + new URL(document.referrer).search : 'explore.html';

  /* ---------- Dish ---------- */
  async function loadDish() {
    info.innerHTML = loadingHTML();
    try {
      const { dish: d } = await api.dish(id);
      document.title = `${d.name} — Tastewise by AFA`;
      renderInfo(d);
      renderGallery(d);
      await loadFavorites();
      syncFavButtons();
      updateFavLabel();
    } catch (err) {
      gallery.innerHTML = '';
      info.innerHTML = `<div class="empty-state"><strong>${escapeHTML(t(err.status === 404 ? 'dish.notFound' : 'dish.loadError'))}</strong>${escapeHTML(err.message)}<br /><a class="btn btn-ghost" style="margin-top:1rem" href="explore.html">${escapeHTML(t('dish.back'))}</a></div>`;
      $('#reviewsCol').hidden = true;
    }
  }

  function renderInfo(d) {
    const v = d.variants || [];
    const isSize = d.category.slug === 'pizza';
    const hasAllergen = d.ingredientDetails.some(i => i.isAllergen);
    const chips = [d.category.name, TW.cuisineLabel(d.cuisine), d.spiceLevel ? TW.SPICE[d.spiceLevel] : null, ...d.dietTags.map(TW.dietLabel)].filter(Boolean);
    info.innerHTML = `
      <h1>${escapeHTML(d.name)} <button type="button" class="fav-inline" data-fav="${d.id}" aria-pressed="false" aria-label="${escapeHTML(t('card.save', { name: d.name }))}">${I.heart}</button></h1>
      <div class="dish-line">
        ${d.rating.count
          ? `<span class="rating"><span class="star" aria-hidden="true">★</span><strong>${ratingNum(d.rating.average)}</strong> <a class="link" href="#reviewsCol">${escapeHTML(t('card.reviews', { n: d.rating.count }))}</a></span>`
          : `<span class="new-badge">${escapeHTML(t('card.new'))}</span>`}
        ${d.isBestSeller ? `<span class="badge">${escapeHTML(t('card.best'))}</span>` : ''}
      </div>
      <div class="dish-price" id="dishPrice">${escapeHTML(price(v[0]?.price ?? d.price))}</div>
      ${v.length > 1 ? `
        <p class="variant-label">${escapeHTML(t(isSize ? 'dish.size' : 'dish.option'))}</p>
        <div class="variants" role="group" aria-label="${escapeHTML(t(isSize ? 'dish.size' : 'dish.option'))}">
          ${v.map((x, i) => `<button type="button" class="variant" data-price="${x.price}" aria-pressed="${i === 0}"><span>${escapeHTML(x.label)}</span><small>${escapeHTML(price(x.price))}</small></button>`).join('')}
        </div>` : ''}
      <p class="dish-desc">${escapeHTML(d.description)}</p>
      <h2 class="sub-h">${escapeHTML(t('dish.ingredients'))}</h2>
      <ul class="ing-list">${d.ingredientDetails.map(i => `<li class="${i.isAllergen ? 'allergen' : ''}">${escapeHTML(i.name)}</li>`).join('')}</ul>
      ${hasAllergen ? `<p class="hint" style="margin:.2rem 0 0">${escapeHTML(t('dish.allergen'))}</p>` : ''}
      <div class="chips-line">${chips.map(c => `<span>${escapeHTML(c)}</span>`).join('')}</div>
      ${d.isAvailable === false ? `<p class="form-msg info" style="margin-top:1rem">${escapeHTML(t('dish.unavailable'))}</p>` : ''}
      <div class="dish-actions">
        <button type="button" class="btn btn-primary" id="favMain" data-fav="${d.id}" aria-pressed="false">${I.heart}<span>${escapeHTML(t('dish.addFav'))}</span></button>
        <a href="${escapeHTML(backHref)}" class="btn btn-ghost"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ${escapeHTML(t('dish.back'))}</a>
      </div>
      <a class="link" style="display:inline-block;margin-top:1rem" href="reserve.html">${escapeHTML(t('dish.reserve'))} →</a>`;

    $$('.variant', info).forEach(b => b.addEventListener('click', () => {
      $$('.variant', info).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      $('#dishPrice').textContent = price(b.dataset.price);
    }));
  }

  async function renderGallery(d) {
    gallery.innerHTML = `<div class="gallery-main">${dishPhoto(d)}</div>
      <p class="related-label">${escapeHTML(t('dish.related'))}</p><div class="thumbs" id="thumbs"></div>`;
    try {
      const { dishes } = await api.dishes({ category: d.category.slug, sort: 'popular', limit: 5 });
      const others = dishes.filter(x => x.id !== d.id).slice(0, 4);
      if (!others.length) { $('.related-label', gallery).remove(); return; }
      $('#thumbs').innerHTML = others.map(x => `<a href="dish.html?id=${x.id}" title="${escapeHTML(x.name)}">${dishPhoto(x)}</a>`).join('');
    } catch { $('.related-label', gallery)?.remove(); }
  }

  const updateFavLabel = () => {
    const on = favorites.has(id);
    const b = $('#favMain');
    if (b) b.querySelector('span').textContent = t(on ? 'dish.inFav' : 'dish.addFav');
  };
  document.addEventListener('favorites:change', updateFavLabel);
  document.addEventListener('click', e => { if (e.target.closest('[data-fav]')) setTimeout(updateFavLabel, 0); });

  /* ---------- Reviews ---------- */
  let page = 1;
  let mine = null;
  const initials = name => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

  function renderSummary(s) {
    $('#reviewSummary').innerHTML = s.count
      ? `<strong class="big">${ratingNum(s.average)}</strong><div>${stars(s.average)}<div class="muted">${escapeHTML(t('dish.reviews', { n: s.count }))}</div></div>`
      : '';
  }
  const reviewHTML = r => `
    <article class="review ${r.isMine ? 'mine' : ''}">
      <span class="avatar" aria-hidden="true">${escapeHTML(initials(r.author))}</span>
      <div>
        <div class="review-head"><strong>${escapeHTML(r.author)}</strong>${r.isMine ? ` <span class="status status-confirmed">${escapeHTML(t('reviews.you'))}</span>` : ''}</div>
        <div class="review-stars">${stars(r.rating)} <span class="review-date">${I18N.fmtDate(new Date(r.updatedAt || r.createdAt), { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
        ${r.comment ? `<p>${escapeHTML(r.comment)}</p>` : ''}
      </div>
    </article>`;

  async function loadReviews({ append = false } = {}) {
    if (!append) { page = 1; $('#reviewList').innerHTML = loadingHTML(); }
    try {
      const res = await api.reviews(id, page);
      if (!append) { renderSummary(res.summary); mine = res.reviews.find(r => r.isMine) || null; }
      const html = res.reviews.map(reviewHTML).join('');
      if (append) $('#reviewList').insertAdjacentHTML('beforeend', html);
      else $('#reviewList').innerHTML = html || `<div class="empty-box"><strong>${escapeHTML(t('reviews.emptyTitle'))}</strong>${escapeHTML(t('reviews.emptyText'))}</div>`;
      $('#moreReviews').hidden = page * 10 >= res.total;
      if (!append) renderForm();
    } catch (err) {
      $('#reviewList').innerHTML = `<div class="empty-box">${escapeHTML(err.message)}</div>`;
    }
  }
  $('#moreReviews').addEventListener('click', () => { page += 1; loadReviews({ append: true }); });

  async function renderForm() {
    const slot = $('#reviewFormSlot');
    const me = await getMe();
    if (!me) {
      const box = Object.assign(document.createElement('div'), { className: 'review-form' });
      box.append(I18N.tNodes('reviews.login', { link: Object.assign(document.createElement('a'), { className: 'link', href: loginUrl(), textContent: t('reviews.loginLink') }) }));
      slot.replaceChildren(box);
      return;
    }
    const starsInput = [5, 4, 3, 2, 1].map(n => `
      <input type="radio" name="rating" id="star${n}" value="${n}" ${mine?.rating === n ? 'checked' : ''} />
      <label for="star${n}" title="${escapeHTML(t('reviews.star', { n }))}"><span aria-hidden="true">★</span><span class="sr-only">${escapeHTML(t('reviews.star', { n }))}</span></label>`).join('');
    slot.innerHTML = `
      <form class="review-form form" id="reviewForm" novalidate>
        <h3>${escapeHTML(t(mine ? 'reviews.yours' : 'reviews.rate'))}</h3>
        <div class="form-msg" id="reviewMsg" hidden></div>
        <fieldset style="border:0;padding:0;margin:0"><legend class="sr-only">${escapeHTML(t('reviews.rating'))}</legend><div class="star-input">${starsInput}</div></fieldset>
        <div class="form-field">
          <label for="comment">${escapeHTML(t('reviews.comment'))}</label>
          <textarea class="textarea" id="comment" name="comment" maxlength="1000" placeholder="${escapeHTML(t('reviews.commentPh'))}">${escapeHTML(mine?.comment || '')}</textarea>
        </div>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap">
          <button type="submit" class="btn btn-primary btn-sm">${escapeHTML(t(mine ? 'reviews.update' : 'reviews.post'))}</button>
          ${mine ? `<button type="button" class="btn btn-danger btn-sm" id="deleteReview">${escapeHTML(t('reviews.delete'))}</button>` : ''}
        </div>
      </form>`;

    const form = $('#reviewForm');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const rating = Number(form.querySelector('input[name=rating]:checked')?.value);
      if (!rating) { showMsg($('#reviewMsg'), t('reviews.choose')); return; }
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        await api.saveReview(id, { rating, comment: form.comment.value });
        toast(t(mine ? 'reviews.updated' : 'reviews.thanks'), 'success');
        await Promise.all([loadReviews(), loadDish()]);
      } catch (err) {
        showMsg($('#reviewMsg'), err.message);
        btn.disabled = false;
      }
    });
    $('#deleteReview')?.addEventListener('click', async () => {
      if (!window.confirm(t('reviews.confirmDelete'))) return;
      try {
        await api.deleteReview(id);
        toast(t('reviews.deleted'));
        await Promise.all([loadReviews(), loadDish()]);
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  loadDish();
  loadReviews();
})();
