/* Menu page: filters → GET /api/dishes */
(() => {
  const { $, $$, escapeHTML, label, dishCard, loadingHTML, loadFavorites, syncFavButtons } = TW;
  const PAGE_SIZE = 12;
  const url = new URLSearchParams(location.search);
  const listParam = k => (url.get(k) || '').split(',').map(s => s.trim()).filter(Boolean);

  const state = {
    q: url.get('q') || '',
    category: url.get('category') || '',
    cuisine: listParam('cuisine'),
    diet: listParam('diet'),
    minPrice: url.get('minPrice') || '',
    maxPrice: url.get('maxPrice') || '',
    maxSpice: url.get('maxSpice') || '',
    include: url.get('include') || '',
    exclude: url.get('exclude') || '',
    sort: url.get('sort') || 'menu',
    page: 1
  };

  const grid = $('#menuGrid'), countEl = $('#resultCount'), moreBtn = $('#loadMore');

  /* ---------- Fill controls from state ---------- */
  $('#search').value = state.q;
  $('#sort').value = state.sort;
  $('#minPrice').value = state.minPrice;
  $('#maxPrice').value = state.maxPrice;
  $('#maxSpice').value = state.maxSpice;
  $('#include').value = state.include;
  $('#exclude').value = state.exclude;

  const chip = (value, text, on) => `<button type="button" class="chip" data-value="${escapeHTML(value)}" aria-pressed="${on}">${escapeHTML(text)}</button>`;

  api.categories().then(({ categories }) => {
    $('#categoryChips').innerHTML = chip('', 'All', !state.category) +
      categories.map(c => chip(c.slug, c.name, state.category === c.slug)).join('');
  });
  api.cuisines().then(({ cuisines }) => {
    $('#cuisineChips').innerHTML = cuisines.map(c => chip(c, label(c), state.cuisine.includes(c))).join('');
  });
  $$('#dietChips .chip').forEach(c => c.setAttribute('aria-pressed', String(state.diet.includes(c.dataset.value))));
  api.ingredients().then(({ ingredients }) => {
    $('#ingredientList').innerHTML = ingredients.map(i => `<option value="${escapeHTML(i.name)}"></option>`).join('');
  }).catch(() => {});

  /* ---------- Load dishes ---------- */
  let requestId = 0;
  async function load({ append = false } = {}) {
    const id = ++requestId;
    if (!append) { state.page = 1; grid.innerHTML = loadingHTML(); moreBtn.hidden = true; }
    syncUrl();
    try {
      const res = await api.dishes({
        q: state.q, category: state.category, cuisine: state.cuisine, diet: state.diet,
        minPrice: state.minPrice, maxPrice: state.maxPrice, maxSpice: state.maxSpice,
        include: state.include, exclude: state.exclude, sort: state.sort,
        page: state.page, limit: PAGE_SIZE
      });
      if (id !== requestId) return; // a newer request is running
      const html = res.dishes.map((d, i) => dishCard(d, i)).join('');
      if (append) grid.insertAdjacentHTML('beforeend', html);
      else grid.innerHTML = html || `<div class="empty-state"><strong>No dishes match</strong>Try removing a filter or searching for something else.</div>`;
      countEl.textContent = `${res.total} dish${res.total === 1 ? '' : 'es'}`;
      moreBtn.hidden = state.page >= res.pages;
      await loadFavorites();
      syncFavButtons();
    } catch (err) {
      if (id !== requestId) return;
      grid.innerHTML = `<div class="empty-state"><strong>Couldn't load the menu</strong>${escapeHTML(err.message)}</div>`;
      countEl.textContent = '';
    }
  }

  function syncUrl() {
    const qs = new URLSearchParams();
    ['q', 'category', 'minPrice', 'maxPrice', 'maxSpice', 'include', 'exclude'].forEach(k => state[k] && qs.set(k, state[k]));
    ['cuisine', 'diet'].forEach(k => state[k].length && qs.set(k, state[k].join(',')));
    if (state.sort !== 'menu') qs.set('sort', state.sort);
    history.replaceState(null, '', `${location.pathname}${[...qs].length ? `?${qs}` : ''}`);
  }

  let timer;
  const debounced = () => { clearTimeout(timer); timer = setTimeout(() => load(), 350); };

  /* ---------- Events ---------- */
  $('#categoryChips').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    $$('#categoryChips .chip').forEach(x => x.setAttribute('aria-pressed', 'false'));
    c.setAttribute('aria-pressed', 'true');
    state.category = c.dataset.value;
    load();
  });
  [['#cuisineChips', 'cuisine'], ['#dietChips', 'diet']].forEach(([sel, key]) => {
    $(sel).addEventListener('click', e => {
      const c = e.target.closest('.chip'); if (!c) return;
      const on = c.getAttribute('aria-pressed') !== 'true';
      c.setAttribute('aria-pressed', String(on));
      state[key] = $$(`${sel} .chip[aria-pressed="true"]`).map(x => x.dataset.value);
      load();
    });
  });
  [['#search', 'q'], ['#minPrice', 'minPrice'], ['#maxPrice', 'maxPrice'], ['#include', 'include'], ['#exclude', 'exclude']].forEach(([sel, key]) => {
    $(sel).addEventListener('input', e => { state[key] = e.target.value.trim(); debounced(); });
  });
  $('#maxSpice').addEventListener('change', e => { state.maxSpice = e.target.value; load(); });
  $('#sort').addEventListener('change', e => { state.sort = e.target.value; load(); });
  moreBtn.addEventListener('click', () => { state.page += 1; load({ append: true }); });

  $('#clearFilters').addEventListener('click', () => {
    Object.assign(state, { q: '', category: '', cuisine: [], diet: [], minPrice: '', maxPrice: '', maxSpice: '', include: '', exclude: '' });
    ['#search', '#minPrice', '#maxPrice', '#include', '#exclude'].forEach(s => { $(s).value = ''; });
    $('#maxSpice').value = '';
    $$('.filter-panel .chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.value === '' )));
    load();
  });

  // Mobile filter drawer
  const panel = $('#filterPanel');
  let backdrop;
  const openPanel = () => {
    panel.classList.add('open');
    backdrop = document.createElement('div');
    backdrop.className = 'filter-backdrop';
    backdrop.addEventListener('click', closePanel);
    document.body.append(backdrop);
  };
  const closePanel = () => { panel.classList.remove('open'); backdrop?.remove(); };
  $('#openFilters').addEventListener('click', openPanel);
  $('#closeFilters').addEventListener('click', closePanel);

  load();
})();
