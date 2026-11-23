/* Account: profile, activity, reservations, favorites, settings */
(async () => {
  const { $, $$, escapeHTML, loadingHTML, requireLogin, toast, dishCard, favorites, syncFavButtons, showMsg, showFieldErrors, setBusy, ratingNum, price, cart, I } = TW;
  let me = await requireLogin();

  /* ---------- Sections (#profile, #reservations, #favorites, #settings) ---------- */
  const VIEWS = ['profile', 'orders', 'reservations', 'favorites', 'settings'];
  const loaded = new Set();
  function show(view) {
    if (!VIEWS.includes(view)) view = 'profile';
    $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== view; });
    $$('.acc-link[data-view]').forEach(a => {
      const on = a.dataset.view === view;
      a.classList.toggle('active', on);
      on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    });
    if (!loaded.has(view)) {
      loaded.add(view);
      ({ profile: loadProfile, orders: loadOrders, reservations: loadReservations, favorites: loadFavs, settings: renderSettings })[view]();
    }
  }
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  $('#logoutLink').addEventListener('click', async () => { await api.logout().catch(() => {}); location.assign('index.html'); });

  /* ---------- Profile ---------- */
  const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

  function renderUser() {
    $('#accAvatar').innerHTML = `<span>${escapeHTML(initials(me.fullName))}</span>`;
    $('#accName').textContent = me.fullName;
    $('#accEmail').textContent = me.email;
    const val = (el, v) => { el.textContent = v || t('account.notSet'); el.classList.toggle('muted', !v); };
    val($('#pvName'), me.fullName);
    val($('#pvEmail'), me.email);
    val($('#pvPhone'), me.phone);
    val($('#pvCity'), me.city);
    if (me.createdAt) $('#memberSince').textContent = t('account.memberSince', { date: I18N.fmtDate(new Date(me.createdAt), { month: 'long', year: 'numeric' }) });
  }
  renderUser();

  async function loadProfile() {
    try {
      const { user, stats } = await api.profile();
      me = user;
      renderUser();
      $('#statRes').textContent = stats.reservations;
      $('#statResLabel').textContent = t('account.statRes', { n: stats.reservations });
      $('#statFav').textContent = stats.favorites;
      $('#statFavLabel').textContent = t('account.statFav', { n: stats.favorites });
      $('#statRating').textContent = stats.averageRating ? ratingNum(stats.averageRating) : '–';
      $('#statRatingHint').textContent = stats.reviews ? t('account.statRatingHint', { n: stats.reviews }) : '';
    } catch (err) { toast(err.message, 'error'); }
  }

  const form = $('#profileForm'), view = $('#profileView'), editBtn = $('#editProfile');
  const setEditing = on => {
    form.hidden = !on; view.hidden = on; editBtn.hidden = on;
    if (on) {
      form.fullName.value = me.fullName;
      $('#pfEmail').value = me.email;
      form.phone.value = me.phone || '';
      form.city.value = me.city || '';
      showMsg($('#profileMsg'), ''); showFieldErrors(form);
      form.fullName.focus();
    }
  };
  editBtn.addEventListener('click', () => setEditing(true));
  $('#cancelEdit').addEventListener('click', () => setEditing(false));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    showMsg($('#profileMsg'), ''); showFieldErrors(form);
    const btn = form.querySelector('[type=submit]');
    setBusy(btn, true);
    try {
      const res = await api.updateProfile({ fullName: form.fullName.value, phone: form.phone.value, city: form.city.value });
      me = res.user;
      renderUser();
      setEditing(false);
      toast(res.message, 'success');
    } catch (err) {
      showFieldErrors(form, Array.isArray(err.details) ? err.details : []);
      showMsg($('#profileMsg'), err.message);
    } finally { setBusy(btn, false); }
  });

  /* ---------- Reservations ---------- */
  const resList = $('#resList');
  const day = d => new Date(`${d}T12:00:00`);
  async function loadReservations() {
    resList.innerHTML = loadingHTML();
    try {
      const { reservations } = await api.myReservations();
      if (!reservations.length) {
        resList.innerHTML = `<div class="empty-box"><strong>${escapeHTML(t('account.resEmptyTitle'))}</strong>${escapeHTML(t('account.resEmptyText'))}<br /><a class="btn btn-primary" href="reserve.html">${escapeHTML(t('account.reserve'))}</a></div>`;
        return;
      }
      resList.innerHTML = reservations.map(r => {
        const d = day(r.date);
        return `
          <article class="res-item">
            <div class="res-date"><span>${escapeHTML(I18N.fmtDate(d, { month: 'short' }))}</span><strong>${d.getDate()}</strong><span>${escapeHTML(I18N.fmtDate(d, { weekday: 'short' }))}</span></div>
            <div class="res-body">
              <h3>${r.time} · ${escapeHTML(t('account.guests', { n: r.guests }))} <span class="status status-${r.status}">${escapeHTML(t(`status.${r.status}`))}</span></h3>
              <p>${escapeHTML(r.phone)}${r.note ? ` · ${escapeHTML(r.note)}` : ''}</p>
              ${r.adminNote ? `<p><strong>${escapeHTML(t('account.afaNote'))}</strong> ${escapeHTML(r.adminNote)}</p>` : ''}
            </div>
            <div>${r.canCancel ? `<button type="button" class="btn btn-danger btn-sm" data-cancel="${r.id}">${escapeHTML(t('account.cancel'))}</button>` : ''}</div>
          </article>`;
      }).join('');
    } catch (err) {
      resList.innerHTML = `<div class="empty-box">${escapeHTML(err.message)}</div>`;
    }
  }
  resList.addEventListener('click', async e => {
    const b = e.target.closest('[data-cancel]');
    if (!b || !window.confirm(t('account.confirmCancel'))) return;
    b.disabled = true;
    try {
      await api.cancelReservation(b.dataset.cancel);
      toast(t('account.cancelled'));
      loadReservations();
      loaded.delete('profile'); // refresh the counters next time
    } catch (err) { toast(err.message, 'error'); b.disabled = false; }
  });

  /* ---------- Orders ---------- */
  const ordersList = $('#ordersList');
  const statusLabel = o => t(`ostatus.${o.status === 'ready' && o.fulfillment === 'delivery' ? 'onTheWay' : o.status}`);
  async function loadOrders() {
    ordersList.innerHTML = loadingHTML();
    try {
      const { orders } = await api.myOrders();
      if (!orders.length) {
        ordersList.innerHTML = `<div class="empty-box"><strong>${escapeHTML(t('account.ordersEmptyTitle'))}</strong>${escapeHTML(t('account.ordersEmptyText'))}<br /><a class="btn btn-primary" href="explore.html">${escapeHTML(t('order.browse'))}</a></div>`;
        return;
      }
      ordersList.innerHTML = orders.map(o => `
        <article class="order-card">
          <header>
            <div>
              <h3>${escapeHTML(t('account.orderNo', { id: o.id }))} <span class="status ostatus-${o.status}">${escapeHTML(statusLabel(o))}</span></h3>
              <p class="muted">${escapeHTML(I18N.fmtDate(new Date(o.createdAt), { day: 'numeric', month: 'long', year: 'numeric' }))} · ${new Date(o.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baku' })} · ${escapeHTML(t(o.fulfillment === 'delivery' ? 'order.deliveryOpt' : 'order.pickup'))}</p>
            </div>
            <strong class="order-card-total">${escapeHTML(price(o.total))}</strong>
          </header>
          <ul class="order-card-items">
            ${o.items.map(i => `<li>
              <span class="oc-photo">${i.imageUrl ? `<img src="${escapeHTML(i.imageUrl)}" alt="" loading="lazy" />` : I.bag}</span>
              <span class="oc-name">${escapeHTML(i.name)}${i.variantLabel ? ` <small>${escapeHTML(i.variantLabel)}</small>` : ''}</span>
              <span class="oc-qty">${escapeHTML(price(i.unitPrice))} × ${i.quantity}</span>
              <strong>${escapeHTML(price(i.lineTotal))}</strong></li>`).join('')}
          </ul>
          ${o.adminNote ? `<p class="oc-note"><strong>${escapeHTML(t('account.afaNote'))}</strong> ${escapeHTML(o.adminNote)}</p>` : ''}
          <footer>
            ${o.canCancel ? `<button type="button" class="btn btn-danger btn-sm" data-cancel-order="${o.id}">${escapeHTML(t('account.cancelOrder'))}</button>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" data-repeat="${o.id}">${escapeHTML(t('account.repeat'))}</button>
          </footer>
        </article>`).join('');
      ordersList._orders = orders;
    } catch (err) {
      ordersList.innerHTML = `<div class="empty-box">${escapeHTML(err.message)}</div>`;
    }
  }
  ordersList.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
  ordersList.addEventListener('click', async e => {
    const c = e.target.closest('[data-cancel-order]');
    const r = e.target.closest('[data-repeat]');
    if (c) {
      if (!window.confirm(t('account.confirmCancelOrder'))) return;
      c.disabled = true;
      try { const res = await api.cancelOrder(c.dataset.cancelOrder); toast(res.message); loadOrders(); }
      catch (err) { toast(err.message, 'error'); c.disabled = false; }
    }
    if (r) {
      // Put the same dishes back in the cart; the server re-checks today's prices
      const o = ordersList._orders.find(x => x.id === Number(r.dataset.repeat));
      const items = cart.items();
      o.items.filter(i => i.dishId).forEach(i => {
        const same = items.find(x => x.dishId === i.dishId && (x.variant || null) === (i.variant || null));
        if (same) same.quantity = Math.min(20, same.quantity + i.quantity);
        else items.push({ dishId: i.dishId, variant: i.variant, quantity: i.quantity, name: i.name, variantLabel: i.variantLabel, price: i.unitPrice, imageUrl: i.imageUrl });
      });
      cart.replace(items);
      location.assign('order.html');
    }
  });

  /* ---------- Favorites ---------- */
  const favGrid = $('#accFavGrid');
  async function loadFavs() {
    favGrid.innerHTML = loadingHTML();
    try {
      const { ids, dishes } = await api.favorites();
      favorites.clear();
      ids.forEach(i => favorites.add(i));
      favGrid.innerHTML = dishes.length
        ? dishes.map(dishCard).join('')
        : `<div class="empty-box" style="grid-column:1/-1">${escapeHTML(t('account.favEmpty'))}<br /><a class="btn btn-primary" href="explore.html">${escapeHTML(t('fav.explore'))}</a></div>`;
      syncFavButtons();
    } catch (err) {
      favGrid.innerHTML = `<div class="empty-box">${escapeHTML(err.message)}</div>`;
    }
  }
  document.addEventListener('favorites:change', e => {
    loaded.delete('profile');
    if (!e.detail.isFavorite) favGrid.querySelector(`[data-fav="${e.detail.id}"]`)?.closest('.dish-card')?.remove();
    if (loaded.has('favorites') && !favGrid.querySelector('.dish-card')) loadFavs();
  });

  /* ---------- Settings ---------- */
  function renderSettings() {
    $('#langChoice').innerHTML = I18N.LANGS.map(l =>
      `<button type="button" class="chip" data-lang="${l}" lang="${l}" aria-pressed="${l === I18N.lang}">${escapeHTML(I18N.NAMES[l])}</button>`).join('');
    $$('#langChoice [data-lang]').forEach(b => b.addEventListener('click', () => I18N.setLang(b.dataset.lang)));
  }
  const pwForm = $('#passwordForm');
  pwForm.addEventListener('submit', async e => {
    e.preventDefault();
    showMsg($('#pwMsg'), ''); showFieldErrors(pwForm);
    const btn = pwForm.querySelector('[type=submit]');
    setBusy(btn, true);
    try {
      const res = await api.changePassword({ currentPassword: pwForm.currentPassword.value, newPassword: pwForm.newPassword.value });
      pwForm.reset();
      showMsg($('#pwMsg'), res.message, 'success');
    } catch (err) {
      showFieldErrors(pwForm, Array.isArray(err.details) ? err.details : []);
      showMsg($('#pwMsg'), err.message);
    } finally { setBusy(btn, false); }
  });

  show(location.hash.slice(1));
})();
