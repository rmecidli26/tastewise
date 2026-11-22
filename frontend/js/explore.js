/* Explore: ingredients + budget search, filters, results */
(() => {
  const { $, $$, escapeHTML, price, dishCard, loadingHTML, ingredientPicker, budgetSelect, loadFavorites, syncFavButtons } = TW;
  const PAGE_SIZE = 12;
  const PRICE_MAX = 30;
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

  /* ---------- Other filters ---------- */
  api.categories().then(({ categories }) => {
    $('#categoryChecks').innerHTML = categories.filter(c => c.dishCount > 0).map(c => `
      <label class="check"><input type="checkbox" value="${escapeHTML(c.slug)}" ${state.category.includes(c.slug) ? 'checked' : ''} />
        <span>${escapeHTML(c.name)}</span><span class="count">${c.dishCount}</span></label>`).join('');
  });
  $('#categoryChecks').addEventListener('change', () => {
    state.category = $$('#categoryChecks input:checked').map(i => i.value);
    load();
  });
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
    veg.checked = mild.checked = false; exclude.value = '';
    $$('input[name="rating"]').forEach(r => { r.checked = r.value === ''; });
    load();
  });

  /* ---------- Load results ---------- */
  const grid = $('#resultsGrid'), moreBtn = $('#loadMore');
  let requestId = 0;
  async function load({ append = false } = {}) {
    const id = ++requestId;
    if (!append) { state.page = 1; grid.innerHTML = loadingHTML(); moreBtn.hidden = true; }
    // "Best match" only makes sense with ingredients
    sortSel.querySelector('option[value="match"]').hidden = !state.prefer.length;
    sortSel.value = effectiveSort();
    $('#resultsTitle').textContent = t(state.prefer.length ? 'results.title' : 'results.all');
    syncUrl();
    try {
      const res = await api.dishes({
        prefer: state.prefer, category: state.category,
        minPrice: state.minPrice || '', maxPrice: state.maxPrice || '',
        diet: state.veg ? 'vegetarian' : '', maxSpice: state.mild ? 0 : '',
        minRating: state.minRating, exclude: state.exclude, sort: effectiveSort(),
        page: state.page, limit: PAGE_SIZE
      });
      if (id !== requestId) return;
      const html = res.dishes.map((d, i) => dishCard(d, i)).join('');
      if (append) grid.insertAdjacentHTML('beforeend', html);
      else grid.innerHTML = html || `<div class="empty-state"><strong>${escapeHTML(t('results.emptyTitle'))}</strong>${escapeHTML(t('results.emptyText'))}</div>`;
      $('#resultCount').textContent = t('results.count', { n: res.total });
      moreBtn.hidden = state.page >= res.pages;
      await loadFavorites();
      syncFavButtons();
    } catch (err) {
      if (id !== requestId) return;
      grid.innerHTML = `<div class="empty-state"><strong>${escapeHTML(t('results.error'))}</strong>${escapeHTML(err.message)}</div>`;
      $('#resultCount').textContent = '';
    }
  }
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
