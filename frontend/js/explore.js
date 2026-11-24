/* Explore: ingredients + budget search, filters, results */
(() => {
  const { $, $$, escapeHTML, price, dishCard, loadingHTML, ingredientPicker, budgetSelect, loadFavorites, syncFavButtons, I } = TW;
  const PAGE_SIZE = 12;
  const PRICE_MAX = 60;
  const url = new URLSearchParams(location.search);
  const list = k => (url.get(k) || '').split(',').map(s => s.trim()).filter(Boolean);

  const state = {
    prefer: list('prefer'),
    category: list('category'),
    minPrice: Number(url.get('minPrice')) || 0,
    maxPrice: Number(url.get('maxPrice')) || 0, // 0 = no limit
    veg: url.get('diet') === 'vegetarian',
    mild: url.get('maxSpice') === '0',
    minRating: url.get('minRating') || '',
    exclude: url.get('exclude') || '',
    sort: url.get('sort') || '',
    page: 1
  };
  const effectiveSort = () => state.sort || (state.prefer.length ? 'match' : 'popular');

  /* ---------- Search bar ---------- */
  const picker = ingredientPicker($('#ingPicker'), { initial: state.prefer, onChange: v => { state.prefer = v; load(); } });
  const budget = $('#budgetSelect');
  budgetSelect(budget, state.maxPrice || '');
  budget.addEventListener('change', () => { state.maxPrice = Number(budget.value) || 0; syncSlider(); load(); });
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); picker.flush(); state.prefer = picker.values(); load(); });

  /* ---------- Price slider ---------- */
  const minR = $('#minPrice'), maxR = $('#maxPrice'), fill = $('#priceFill');
  minR.max = maxR.max = PRICE_MAX;
  function syncSlider() {
    minR.value = state.minPrice;
    maxR.value = state.maxPrice || PRICE_MAX;
    const a = (minR.value / PRICE_MAX) * 100, b = (maxR.value / PRICE_MAX) * 100;
    fill.style.left = `${a}%`; fill.style.width = `${b - a}%`;
    $('#minPriceOut').textContent = price(minR.value);
    $('#maxPriceOut').textContent = price(maxR.value);
  }
  let sliderTimer;
  const onSlide = () => {
    let lo = Number(minR.value), hi = Number(maxR.value);
    if (lo > hi) [lo, hi] = [hi, lo];
    state.minPrice = lo;
    state.maxPrice = hi >= PRICE_MAX ? 0 : hi;
    syncSlider();
    budgetSelect(budget, state.maxPrice || '');
    clearTimeout(sliderTimer); sliderTimer = setTimeout(load, 300);
  };
  minR.addEventListener('input', onSlide);
  maxR.addEventListener('input', onSlide);
  syncSlider();

  /* ---------- Menu sections: tabs + category filter ---------- */
  const TAB_ICON = new Proxy({}, { get: (_, slug) => TW.catIcon(slug) });
  let cats = [];
  const catsReady = api.categories().then(({ categories }) => {
    cats = categories.filter(c => c.dishCount > 0);
    $('#categoryChecks').innerHTML = cats.map(c => `
      <label class="check"><input type="checkbox" value="${escapeHTML(c.slug)}" ${state.category.includes(c.slug) ? 'checked' : ''} />
        <span>${escapeHTML(c.name)}</span><span class="count">${c.dishCount}</span></label>`).join('');
    $('#menuTabs').innerHTML = `<button type="button" role="tab" data-tab="">${I.grid}<span>${escapeHTML(t('results.all'))}</span></button>` +
      cats.map(c => `<button type="button" role="tab" data-tab="${escapeHTML(c.slug)}">${TAB_ICON[c.slug] || I.grid}<span>${escapeHTML(c.name)}</span></button>`).join('');
    syncTabs();
  });
  function syncTabs() {
    const one = state.category.length === 1 ? state.category[0] : state.category.length ? null : '';
    $$('#menuTabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === one)));
  }
  function setCategory(list) {
    state.category = list;
    $$('#categoryChecks input').forEach(i => { i.checked = list.includes(i.value); });
    syncTabs();
    load();
  }
  $('#menuTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    setCategory(b.dataset.tab ? [b.dataset.tab] : []);
  });
  $('#categoryChecks').addEventListener('change', () => setCategory($$('#categoryChecks input:checked').map(i => i.value)));
  const veg = $('#vegOnly'), mild = $('#mildOnly');
  veg.checked = state.veg; mild.checked = state.mild;
  veg.addEventListener('change', () => { state.veg = veg.checked; load(); });
  mild.addEventListener('change', () => { state.mild = mild.checked; load(); });
  $$('[data-rating-label]').forEach(el => { el.textContent = t('filters.ratingUp', { n: TW.ratingNum(el.dataset.ratingLabel) }); });
  $$('input[name="rating"]').forEach(r => {
    r.checked = r.value === state.minRating;
    r.addEventListener('change', () => { state.minRating = r.value; load(); });
  });
  const exclude = $('#exclude');
  exclude.value = state.exclude;
  let exTimer;
  exclude.addEventListener('input', () => { state.exclude = exclude.value.trim(); clearTimeout(exTimer); exTimer = setTimeout(load, 400); });
  api.ingredients().then(({ ingredients }) => {
    $('#ingredientList').innerHTML = ingredients.map(i => `<option value="${escapeHTML(i.label)}"></option>`).join('');
  }).catch(() => {});

  const sortSel = $('#sort');
  sortSel.addEventListener('change', () => { state.sort = sortSel.value; load(); });

  $('#clearFilters').addEventListener('click', () => {
    Object.assign(state, { prefer: [], category: [], minPrice: 0, maxPrice: 0, veg: false, mild: false, minRating: '', exclude: '', sort: '' });
    picker.set([]); budgetSelect(budget, ''); syncSlider();
    $$('#categoryChecks input').forEach(i => { i.checked = false; });
    syncTabs();
    veg.checked = mild.checked = false; exclude.value = '';
    $$('input[name="rating"]').forEach(r => { r.checked = r.value === ''; });
    load();
  });

  /* ---------- Load results ---------- */
  const grid = $('#resultsGrid'), moreBtn = $('#loadMore'), sections = $('#menuSections');
  let requestId = 0;
  const catName = slug => cats.find(c => c.slug === slug)?.name || slug;
  async function load({ append = false } = {}) {
    const id = ++requestId;
    // "Best match" only makes sense with ingredients
    sortSel.querySelector('option[value="match"]').hidden = !state.prefer.length;
    sortSel.value = effectiveSort();
    syncUrl();
    await catsReady.catch(() => {});
    const grouped = !state.category.length; // "All menu" → one section per category
    $('#resultsTitle').textContent = state.prefer.length ? t('results.title')
      : state.category.length === 1 ? catName(state.category[0]) : t('results.all');
    if (!append) {
      state.page = 1; moreBtn.hidden = true;
      grid.hidden = grouped; sections.hidden = !grouped;
      (grouped ? sections : grid).innerHTML = loadingHTML();
    }
    const filters = {
      prefer: state.prefer,
      minPrice: state.minPrice || '', maxPrice: state.maxPrice || '',
      diet: state.veg ? 'vegetarian' : '', maxSpice: state.mild ? 0 : '',
      minRating: state.minRating, exclude: state.exclude, sort: effectiveSort()
    };
    const empty = `<div class="empty-state"><strong>${escapeHTML(t('results.emptyTitle'))}</strong>${escapeHTML(t('results.emptyText'))}</div>`;
    try {
      if (grouped) {
        const res = await api.dishes({ ...filters, limit: 300 });
        if (id !== requestId) return;
        const by = new Map(cats.map(c => [c.slug, []]));
        res.dishes.forEach(d => { if (!by.has(d.category.slug)) by.set(d.category.slug, []); by.get(d.category.slug).push(d); });
        let i = 0;
        sections.innerHTML = [...by].filter(([, list]) => list.length).map(([slug, list]) => `
          <section class="menu-section" aria-labelledby="sec-${escapeHTML(slug)}">
            <div class="row-head">
              <h2 id="sec-${escapeHTML(slug)}"><span class="sec-ico" aria-hidden="true">${TAB_ICON[slug] || I.grid}</span>${escapeHTML(catName(slug))}</h2>
              <span class="line"></span>
              <button type="button" class="btn-text" data-open="${escapeHTML(slug)}">${escapeHTML(t('home.viewAll'))} (${list.length}) →</button>
            </div>
            ${slug === 'drinks' ? `<p class="muted sec-sub">${escapeHTML(t('explore.drinksSub'))}</p>` : ''}
            <div class="dish-grid cols-3">${list.map(d => dishCard(d, i++)).join('')}</div>
          </section>`).join('') || empty;
        $('#resultCount').textContent = t('results.count', { n: res.total });
      } else {
        const res = await api.dishes({ ...filters, category: state.category, page: state.page, limit: PAGE_SIZE });
        if (id !== requestId) return;
        const html = res.dishes.map((d, k) => dishCard(d, k)).join('');
        if (append) grid.insertAdjacentHTML('beforeend', html); else grid.innerHTML = html || empty;
        $('#resultCount').textContent = t('results.count', { n: res.total });
        moreBtn.hidden = state.page >= res.pages;
      }
      await loadFavorites();
      syncFavButtons();
    } catch (err) {
      if (id !== requestId) return;
      (grouped ? sections : grid).innerHTML = `<div class="empty-state"><strong>${escapeHTML(t('results.error'))}</strong>${escapeHTML(err.message)}</div>`;
      $('#resultCount').textContent = '';
    }
  }
  sections.addEventListener('click', e => {
    const b = e.target.closest('[data-open]'); if (!b) return;
    setCategory([b.dataset.open]);
    window.scrollTo({ top: $('#menuTabs').getBoundingClientRect().top + scrollY - 110, behavior: 'smooth' });
  });
  moreBtn.addEventListener('click', () => { state.page += 1; load({ append: true }); });

  function syncUrl() {
    const qs = new URLSearchParams();
    if (state.prefer.length) qs.set('prefer', state.prefer.join(','));
    if (state.category.length) qs.set('category', state.category.join(','));
    if (state.minPrice) qs.set('minPrice', state.minPrice);
    if (state.maxPrice) qs.set('maxPrice', state.maxPrice);
    if (state.veg) qs.set('diet', 'vegetarian');
    if (state.mild) qs.set('maxSpice', '0');
    if (state.minRating) qs.set('minRating', state.minRating);
    if (state.exclude) qs.set('exclude', state.exclude);
    if (state.sort) qs.set('sort', state.sort);
    history.replaceState(null, '', `${location.pathname}${[...qs].length ? `?${qs}` : ''}`);
  }

  /* ---------- Mobile filter drawer ---------- */
  const panel = $('#filterPanel');
  let backdrop;
  const closePanel = () => { panel.classList.remove('open'); backdrop?.remove(); };
  $('#openFilters').addEventListener('click', () => {
    panel.classList.add('open');
    backdrop = Object.assign(document.createElement('div'), { className: 'filter-backdrop' });
    backdrop.addEventListener('click', closePanel);
    document.body.append(backdrop);
  });
  $('#closeFilters').addEventListener('click', closePanel);

  load();
})();
