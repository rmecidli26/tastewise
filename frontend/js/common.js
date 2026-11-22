/* =========================================================
   Shared UI: header/footer, session, favorites, dish cards,
   ingredient picker, toasts, form helpers
   Load order on every page: i18n.js → api.js → common.js → <page>.js
   ========================================================= */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const param = name => new URLSearchParams(location.search).get(name);

  /* ---------- Formatting ---------- */
  const numFmt = new Intl.NumberFormat(I18N.locale(), { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const price = n => t('common.price', { n: numFmt.format(Number(n)) });
  /** "8,8 ₼" or "8,8 ₼-dan" / "from 8.8 ₼" / "от 8,8 ₼" when the dish has several prices */
  const priceFrom = d => (d.variants?.length > 1 ? t('common.from', { price: price(d.price) }) : price(d.variants?.[0]?.price ?? d.price));
  const cuisineLabel = c => { const k = `cuisine.${c}`; const v = t(k); return v === k ? String(c) : v; };
  const dietLabel = d => { const k = `diet.${d}`; const v = t(k); return v === k ? String(d) : v; };
  const SPICE = [0, 1, 2, 3].map(n => t(`spice.${n}`));
  const ratingNum = n => numFmt.format(Number(n));
  const stars = avg => {
    const full = Math.round(avg || 0);
    return `<span class="stars" aria-label="${escapeHTML(avg ? t('stars.label', { n: ratingNum(avg) }) : t('stars.none'))}">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`;
  };

  /* ---------- Icons ---------- */
  const I = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.5 3.7 4 7.3 4c2 0 3.6 1.1 4.7 2.7C13.1 5.1 14.7 4 16.7 4c3.6 0 5.9 3.5 4.6 7.1-1.8 4.8-9.3 9.4-9.3 9.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    arrow: '<svg class="arrow" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7zM4 7l11-3v3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="16" cy="13.5" r="1.3" fill="currentColor"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    cutlery: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 1.5-3 4-3 7h3v11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="9.5" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 6.5l8.5 6 8.5-6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    hat: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 30c-5 0-8-3.6-8-8s3.6-8 8-8c1 0 1.8.1 2.6.4C18 10.6 20.8 8 24 8s6 2.6 7.4 6.4c.8-.3 1.6-.4 2.6-.4 4.4 0 8 3.6 8 8s-3 8-8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M14 26v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V26" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M14 34h20" stroke="currentColor" stroke-width="3"/></svg>',
    pizza: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M32 6L6 56c17 6 35 6 52 0z"/><path d="M11 46c14 4 28 4 42 0"/><circle cx="28" cy="34" r="3"/><circle cx="38" cy="42" r="3"/><circle cx="32" cy="22" r="2.5"/></svg>',
    wrap: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 50L44 10l10 8-30 40z"/><path d="M44 10c4 6 8 10 10 8M22 40l8 6M28 32l8 6"/></svg>'
  };
  const SOCIAL = {
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8.5c0-.3.2-.5.5-.5z" fill="currentColor"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor"/></svg>'
  };
  const WAVE = '<svg viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true"><path d="M0 60V30C240 0 480 0 720 22s480 38 720 8v30z" fill="currentColor"/></svg>';

  /* ---------- Session ---------- */
  let mePromise = null;
  const getMe = (fresh = false) => {
    if (!mePromise || fresh) mePromise = api.me().then(r => r.user).catch(() => null);
    return mePromise;
  };
  const currentPath = () => location.pathname.replace(/^\//, '') + location.search + location.hash;
  const loginUrl = (next = currentPath()) => `login.html?next=${encodeURIComponent(next || 'index.html')}`;
  /** Only allow same-site relative redirects (prevents open redirects). */
  const safeNext = (fallback = 'account.html') => {
    const n = param('next');
    return n && /^[a-z0-9-]+\.html([?#].*)?$/i.test(n) ? n : fallback;
  };
  async function requireLogin({ admin = false } = {}) {
    const me = await getMe();
    if (!me) { location.replace(loginUrl()); return new Promise(() => {}); }
    if (admin && me.role !== 'admin') { location.replace('account.html'); return new Promise(() => {}); }
    return me;
  }

  /* ---------- Toasts ---------- */
  function toast(message, type = '') {
    let box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.append(box); }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    box.append(el);
    setTimeout(() => el.remove(), 3800);
  }

  /* ---------- Dish visuals & cards ---------- */
  const COLORS = { pizza: ['#a2414f', '#5b1220'], doner: ['#b5695a', '#7b1c2c'] };
  function dishPhoto(d, extra = '') {
    const key = d.category?.slug === 'doner' ? 'doner' : 'pizza';
    const [c1, c2] = COLORS[key];
    // The icon stays underneath; if the photo fails to load it is removed and the icon shows.
    const img = d.imageUrl ? `<img src="${escapeHTML(d.imageUrl)}" alt="${escapeHTML(d.name)}" loading="lazy" />` : '';
    return `<div class="dish-photo" style="--c1:${c1};--c2:${c2}">${key === 'doner' ? I.wrap : I.pizza}${img}${extra}</div>`;
  }
  document.addEventListener('error', e => {
    if (e.target.tagName === 'IMG' && e.target.closest('.dish-photo')) e.target.remove();
  }, true);

  function ratingHTML(d) {
    if (!d.rating?.count) return `<span class="new-badge">${escapeHTML(t('card.new'))}</span>`;
    return `<span class="rating"><span class="star" aria-hidden="true">★</span><strong>${ratingNum(d.rating.average)}</strong> ${escapeHTML(t('card.reviews', { n: d.rating.count }))}</span>`;
  }

  function dishCard(d, i = 0) {
    const isFav = favorites.has(d.id);
    const ribbon = d.isBestSeller ? `<span class="best-ribbon">${escapeHTML(t('card.best'))}</span>` : '';
    const match = d.match ? `<span class="match-badge">${escapeHTML(t('card.match', { count: d.match.count, total: d.match.total }))}</span>` : '';
    return `
      <article class="dish-card" style="animation-delay:${Math.min(i, 8) * 60}ms">
        ${dishPhoto(d, ribbon + match)}
        <button type="button" class="fav-btn" data-fav="${d.id}" aria-pressed="${isFav}" aria-label="${escapeHTML(t(isFav ? 'card.remove' : 'card.save', { name: d.name }))}">${I.heart}</button>
        <div class="dish-body">
          <h3><a href="dish.html?id=${d.id}">${escapeHTML(d.name)}</a></h3>
          <div class="dish-meta">${ratingHTML(d)}<span class="price">${escapeHTML(priceFrom(d))}</span></div>
          <div class="card-actions"><a class="btn btn-soft btn-sm" href="dish.html?id=${d.id}" tabindex="-1">${escapeHTML(t('card.details'))} ${I.arrow}</a></div>
        </div>
      </article>`;
  }
  const loadingHTML = (text = t('common.loading')) => `<div class="loading"><span class="spinner" aria-hidden="true"></span>${escapeHTML(text)}</div>`;

  /* ---------- Favorites (stored in the account) ---------- */
  const favorites = new Set();
  let favoritesReady = null;
  function loadFavorites() {
    favoritesReady = favoritesReady || getMe().then(me => (me
      ? api.favorites().then(r => { r.ids.forEach(id => favorites.add(id)); syncFavButtons(); })
      : null)).catch(() => null);
    return favoritesReady;
  }
  function syncFavButtons() {
    $$('[data-fav]').forEach(b => b.setAttribute('aria-pressed', String(favorites.has(Number(b.dataset.fav)))));
    $$('.fav-count').forEach(badge => { badge.hidden = favorites.size === 0; badge.textContent = favorites.size; });
  }
  async function toggleFavorite(id) {
    const me = await getMe();
    if (!me) { toast(t('common.loginToSave')); setTimeout(() => location.assign(loginUrl()), 800); return; }
    const on = favorites.has(id);
    on ? favorites.delete(id) : favorites.add(id); // optimistic
    syncFavButtons();
    try {
      await (on ? api.removeFavorite(id) : api.addFavorite(id));
      document.dispatchEvent(new CustomEvent('favorites:change', { detail: { id, isFavorite: !on } }));
    } catch (err) {
      on ? favorites.add(id) : favorites.delete(id);
      syncFavButtons();
      toast(err.message, 'error');
    }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-fav]');
    if (!b) return;
    e.preventDefault();
    toggleFavorite(Number(b.dataset.fav));
  });

  /* ---------- Ingredient picker (chips + suggestions) ---------- */
  let ingredientList = null;
  const getIngredients = () => (ingredientList ||= api.ingredients().then(r => r.ingredients).catch(() => []));

  /**
   * Turns <div class="ing-picker" data-name="prefer"> into chips + input with suggestions.
   * Returns { values(), set(list) }.
   */
  function ingredientPicker(root, { initial = [], onChange = () => {} } = {}) {
    let values = [...new Set(initial.map(v => v.trim()).filter(Boolean))];
    root.innerHTML = `<input class="ing-input" type="text" autocomplete="off" aria-label="${escapeHTML(t('search.label'))}" placeholder="${escapeHTML(t('search.addPh'))}" />
      <div class="ing-suggest" role="listbox" hidden></div>`;
    const input = $('.ing-input', root), box = $('.ing-suggest', root);
    let active = -1, options = [];

    const render = () => {
      $$('.ing-chip', root).forEach(c => c.remove());
      values.forEach(v => {
        const chip = document.createElement('span');
        chip.className = 'ing-chip';
        chip.innerHTML = `<span></span><button type="button" aria-label="${escapeHTML(t('search.remove', { name: v }))}">×</button>`;
        chip.firstChild.textContent = v;
        chip.querySelector('button').addEventListener('click', () => { values = values.filter(x => x !== v); render(); onChange(values); input.focus(); });
        root.insertBefore(chip, input);
      });
      input.placeholder = values.length ? '' : t('search.addPh');
    };
    const add = v => {
      const clean = String(v).trim().replace(/,$/, '');
      if (clean && !values.some(x => x.toLowerCase() === clean.toLowerCase()) && values.length < 10) {
        values.push(clean); render(); onChange(values);
      }
      input.value = ''; hide();
    };
    const hide = () => { box.hidden = true; active = -1; };
    const show = async () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { hide(); return; }
      const all = await getIngredients();
      options = all.filter(i => i.label.toLowerCase().includes(q) && !values.includes(i.label)).slice(0, 8);
      if (!options.length) { hide(); return; }
      box.innerHTML = options.map((o, i) => `<button type="button" role="option" data-i="${i}">${escapeHTML(o.label)}</button>`).join('');
      box.hidden = false; active = -1;
    };
    input.addEventListener('input', () => {
      if (input.value.includes(',')) { input.value.split(',').forEach(add); return; }
      show();
    });
    input.addEventListener('keydown', e => {
      const btns = $$('button', box);
      if (e.key === 'ArrowDown' && !box.hidden) { e.preventDefault(); active = Math.min(active + 1, btns.length - 1); }
      else if (e.key === 'ArrowUp' && !box.hidden) { e.preventDefault(); active = Math.max(active - 1, 0); }
      else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0 && options[active]) add(options[active].label); else if (input.value.trim()) add(input.value); else root.dispatchEvent(new CustomEvent('ing:submit', { bubbles: true })); return; }
      else if (e.key === 'Escape') { hide(); return; }
      else if (e.key === 'Backspace' && !input.value && values.length) { values.pop(); render(); onChange(values); return; }
      else return;
      btns.forEach((b, i) => b.setAttribute('aria-selected', String(i === active)));
    });
    box.addEventListener('mousedown', e => { const b = e.target.closest('button'); if (b) { e.preventDefault(); add(options[b.dataset.i].label); } });
    input.addEventListener('blur', () => setTimeout(() => { if (input.value.trim()) add(input.value); hide(); }, 150));
    root.addEventListener('click', e => { if (e.target === root) input.focus(); });
    render();
    return {
      values: () => [...values],
      set: list => { values = [...list]; render(); },
      flush: () => { if (input.value.trim()) add(input.value); } // add text typed but not yet confirmed
    };
  }

  /** <select> with "Max. 5 ₼ … Any budget" */
  function budgetSelect(select, current) {
    const opts = [5, 8, 10, 12, 15, 20, 25, 30];
    select.innerHTML = `<option value="">${escapeHTML(t('search.any'))}</option>` +
      opts.map(n => `<option value="${n}" ${Number(current) === n ? 'selected' : ''}>${escapeHTML(t('search.max', { n }))}</option>`).join('');
    if (current && !opts.includes(Number(current))) {
      select.insertAdjacentHTML('beforeend', `<option value="${Number(current)}" selected>${escapeHTML(t('search.max', { n: Number(current) }))}</option>`);
    }
  }

  /* ---------- Header ---------- */
  const NAV = [
    ['home', 'index.html', 'nav.home'],
    ['explore', 'explore.html', 'nav.explore'],
    ['favorites', 'favorites.html', 'nav.favorites'],
    ['about', 'about.html', 'nav.about'],
    ['visit', 'visit.html', 'nav.visit'],
    ['account', 'account.html', 'nav.account']
  ];
  const langSwitch = cls => `
    <div class="lang-switch ${cls}" role="group" aria-label="${escapeHTML(t('lang.label'))}">
      ${I18N.LANGS.map(l => `<button type="button" data-lang="${l}" lang="${l}" title="${I18N.NAMES[l]}" aria-pressed="${l === I18N.lang}">${l.toUpperCase()}</button>`).join('')}
    </div>`;

  function renderHeader() {
    const header = $('header.site-header');
    if (!header) return;
    const active = document.body.dataset.nav || document.body.dataset.page;
    header.innerHTML = `
      <div class="container header-inner">
        <a href="index.html" class="logo" aria-label="${escapeHTML(t('header.home'))}">
          <span class="logo-mark">${I.hat}</span>
          <span class="logo-text"><span class="logo-name">Tastewise.</span><span class="logo-sub">by AFA</span></span>
        </a>
        <nav class="main-nav" id="mainNav" aria-label="${escapeHTML(t('nav.main'))}">
          ${NAV.map(([key, href, label]) => `<a href="${href}" class="${key === active ? 'active' : ''}"${key === active ? ' aria-current="page"' : ''}>${escapeHTML(t(label))}</a>`).join('')}
          ${langSwitch('lang-mobile')}
        </nav>
        <div class="header-actions">
          ${langSwitch('lang-desktop')}
          <a href="favorites.html" class="icon-btn" aria-label="${escapeHTML(t('header.favorites'))}">${I.heart}<span class="fav-count" hidden>0</span></a>
          <div class="auth-actions" id="authSlot"></div>
          <a href="explore.html" class="btn btn-primary btn-sm header-cta">${escapeHTML(t('cta.find'))} ${I.arrow}</a>
          <button class="menu-toggle" id="menuToggle" aria-label="${escapeHTML(t('nav.open'))}" aria-expanded="false" aria-controls="mainNav"><span></span><span></span><span></span></button>
        </div>
      </div>`;

    const toggle = $('#menuToggle'), nav = $('#mainNav');
    toggle.addEventListener('click', () => toggle.setAttribute('aria-expanded', String(nav.classList.toggle('open'))));
    $$('a', nav).forEach(a => a.addEventListener('click', () => { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }));
    $$('[data-lang]', header).forEach(b => b.addEventListener('click', () => I18N.setLang(b.dataset.lang)));
    getMe().then(renderAuthSlot);
  }

  function renderAuthSlot(me) {
    const slot = $('#authSlot');
    if (!slot) return;
    if (!me) {
      slot.innerHTML = `<a href="${loginUrl()}" class="login-link">${I.user}<span>${escapeHTML(t('auth.login'))}</span></a>`;
      return;
    }
    const first = me.fullName.split(' ')[0];
    slot.innerHTML = `
      <div class="user-menu">
        <button class="user-btn" id="userBtn" aria-haspopup="true" aria-expanded="false">
          <span class="avatar" aria-hidden="true">${escapeHTML(first[0].toUpperCase())}</span><span class="user-name">${escapeHTML(first)}</span>
        </button>
        <div class="user-dropdown" id="userDropdown" hidden>
          <div class="dd-head"><strong>${escapeHTML(me.fullName)}</strong>${escapeHTML(me.email)}</div>
          <a href="account.html">${escapeHTML(t('user.account'))}</a>
          <a href="favorites.html">${escapeHTML(t('user.favorites'))}</a>
          <a href="account.html#reservations">${escapeHTML(t('user.reservations'))}</a>
          ${me.role === 'admin' ? `<a href="admin.html">${escapeHTML(t('user.admin'))}</a>` : ''}
          <button type="button" id="logoutBtn">${escapeHTML(t('user.logout'))}</button>
        </div>
      </div>`;
    const btn = $('#userBtn'), dd = $('#userDropdown');
    btn.addEventListener('click', e => { e.stopPropagation(); dd.hidden = !dd.hidden; btn.setAttribute('aria-expanded', String(!dd.hidden)); });
    document.addEventListener('click', e => { if (!e.target.closest('.user-menu')) { dd.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') dd.hidden = true; });
    $('#logoutBtn').addEventListener('click', async () => { await api.logout().catch(() => {}); location.assign('index.html'); });
  }

  /* ---------- Footer ---------- */
  function renderFooter() {
    const footer = $('footer.site-footer');
    if (!footer) return;
    footer.innerHTML = `
      <div class="wave-top">${WAVE}</div>
      <div class="container">
        <div class="footer-grid">
          <div>
            <a href="index.html" class="logo"><span class="logo-mark">${I.hat}</span><span class="logo-text"><span class="logo-name">Tastewise.</span><span class="logo-sub">by AFA</span></span></a>
            <p class="tagline">${escapeHTML(t('footer.tagline'))}</p>
          </div>
          <div class="divider"></div>
          <div>
            <h3>${escapeHTML(t('footer.newsTitle'))}</h3>
            <p>${escapeHTML(t('footer.newsText'))}</p>
            <form class="news-form" id="newsForm" novalidate>
              <input type="email" name="email" required autocomplete="email" placeholder="${escapeHTML(t('footer.emailPh'))}" aria-label="${escapeHTML(t('footer.emailPh'))}" />
              <button type="submit" class="btn btn-primary">${escapeHTML(t('footer.subscribe'))}</button>
            </form>
            <div class="news-msg" id="newsMsg" role="status"></div>
          </div>
          <div class="divider"></div>
          <div>
            <h3>${escapeHTML(t('footer.follow'))}</h3>
            <div class="socials">
              <a href="https://www.instagram.com/" target="_blank" rel="noopener" aria-label="Instagram">${SOCIAL.instagram}</a>
              <a href="https://www.facebook.com/" target="_blank" rel="noopener" aria-label="Facebook">${SOCIAL.facebook}</a>
              <a href="https://www.youtube.com/" target="_blank" rel="noopener" aria-label="YouTube">${SOCIAL.youtube}</a>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <span>${escapeHTML(t('footer.rights', { year: new Date().getFullYear() }))}</span>
          <nav class="footer-links" aria-label="Footer">
            ${NAV.slice(0, 4).map(([, href, label]) => `<a href="${href}">${escapeHTML(t(label))}</a>`).join('')}
            <a href="visit.html">${escapeHTML(t('footer.contact'))}</a>
          </nav>
        </div>
      </div>`;
    $('#newsForm').addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.currentTarget, msg = $('#newsMsg');
      const btn = form.querySelector('button');
      btn.disabled = true;
      try {
        const res = await api.subscribe(form.email.value);
        msg.textContent = res.message;
        form.reset();
      } catch (err) {
        msg.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---------- Form helpers ---------- */
  function showMsg(el, text, type = 'error') {
    if (!el) return;
    el.hidden = !text;
    el.className = `form-msg ${type}`;
    el.textContent = text || '';
  }
  /** Marks fields from an API VALIDATION_ERROR (details: [{field, message}]) */
  function showFieldErrors(form, details = []) {
    $$('[aria-invalid]', form).forEach(i => i.removeAttribute('aria-invalid'));
    $$('.field-error', form).forEach(e => { e.textContent = ''; });
    details.forEach(({ field, message }) => {
      const input = form.elements[field];
      if (!input || !input.setAttribute) return;
      input.setAttribute('aria-invalid', 'true');
      const err = input.closest('.form-field')?.querySelector('.field-error');
      if (err && !err.textContent) err.textContent = message;
    });
  }
  function setBusy(btn, busy, text) {
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; if (text) btn.textContent = text; }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }
  document.addEventListener('click', e => {
    const tog = e.target.closest('.pw-toggle');
    if (!tog) return;
    const input = tog.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    if (tog.classList.contains('pw-eye')) tog.setAttribute('aria-label', t(show ? 'pw.hide' : 'pw.show')); // icon button
    else tog.textContent = t(show ? 'pw.hide' : 'pw.show');
    tog.setAttribute('aria-pressed', String(show));
  });

  /** Fills [data-restaurant="address|phone|hours|description|email"] elements from the API. */
  function fillRestaurant() {
    const setHours = h => $$('[data-restaurant="hours"]').forEach(el => { el.textContent = t('info.hoursValue', { from: h[0], to: h[1] }); });
    setHours(['10:00', '23:00']);
    return api.restaurant().then(({ restaurant: r }) => {
      $$('[data-restaurant="address"]').forEach(el => { el.textContent = r.address; });
      $$('[data-restaurant="description"]').forEach(el => { el.textContent = r.description; });
      $$('[data-restaurant="email"]').forEach(el => { el.textContent = r.email; if (el.tagName === 'A') el.href = `mailto:${r.email}`; });
      $$('[data-restaurant="phone"]').forEach(el => { el.textContent = r.phone; if (el.tagName === 'A') el.href = `tel:${r.phone.replace(/[^\d+]/g, '')}`; });
      if (r.openingHours?.mon) setHours(r.openingHours.mon);
      return r;
    }).catch(() => null);
  }

  /* ---------- Boot ---------- */
  // Scripts sit at the end of <body>: translate static text BEFORE page scripts run.
  const boot = () => {
    I18N.apply(); renderHeader(); renderFooter(); loadFavorites();
    if ($('[data-restaurant]')) fillRestaurant(); // address / phone / hours blocks on any page
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.TW = {
    $, $$, escapeHTML, param, price, priceFrom, stars, ratingNum, cuisineLabel, dietLabel, SPICE, I, t,
    getMe, requireLogin, loginUrl, safeNext,
    toast, dishCard, dishPhoto, ratingHTML, loadingHTML,
    favorites, loadFavorites, syncFavButtons,
    ingredientPicker, budgetSelect, fillRestaurant,
    showMsg, showFieldErrors, setBusy
  };
})();
