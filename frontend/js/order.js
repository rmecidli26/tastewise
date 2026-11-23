/* Order page: cart, totals, checkout */
(async () => {
  const { $, $$, escapeHTML, price, cart, getMe, loginUrl, showMsg, showFieldErrors, setBusy, toast, I } = TW;
  const list = $('#orderList');
  const form = $('#orderForm');
  let settings = { deliveryFee: 0, minTotal: 0 };
  const money = n => Math.round(n * 100) / 100;
  const ICON = { pizza: I.pizza, doner: I.wrap };

  /* ---------- Cart list ---------- */
  function render() {
    const items = cart.items();
    const root = $('#orderRoot');
    if (!items.length) {
      root.hidden = true;
      if ($('#orderDone').hidden) {
        $('#orderDone').hidden = false;
        $('#orderDone').innerHTML = `
          <div class="empty-box order-empty">
            <div class="order-empty-ico">${I.bag}</div>
            <strong>${escapeHTML(t('order.emptyTitle'))}</strong>${escapeHTML(t('order.emptyText'))}<br />
            <a class="btn btn-primary" href="explore.html">${escapeHTML(t('order.browse'))} ${I.arrow}</a>
          </div>`;
      }
      return;
    }
    root.hidden = false;
    $('#itemCount').textContent = `· ${t('order.items', { n: cart.count() })}`;
    list.innerHTML = items.map((it, i) => `
      <li class="order-item">
        <a class="oi-photo" href="dish.html?id=${it.dishId}" tabindex="-1" aria-hidden="true">
          ${ICON[it.category] || I.pizza}
          ${it.imageUrl ? `<img src="${escapeHTML(it.imageUrl)}" alt="" loading="lazy" />` : ''}
        </a>
        <div class="oi-name">
          <a href="dish.html?id=${it.dishId}">${escapeHTML(it.name)}</a>
          ${it.variantLabel ? `<span class="oi-variant">${escapeHTML(it.variantLabel)}</span>` : ''}
        </div>
        <span class="oi-price">${escapeHTML(price(it.price))}</span>
        <div class="stepper" role="group" aria-label="${escapeHTML(t('order.qty'))}: ${escapeHTML(it.name)}">
          <button type="button" data-step="-1" data-i="${i}" aria-label="${escapeHTML(t('order.dec'))}">−</button>
          <output aria-live="polite">${it.quantity}</output>
          <button type="button" data-step="1" data-i="${i}" aria-label="${escapeHTML(t('order.inc'))}" ${it.quantity >= 20 ? 'disabled' : ''}>+</button>
        </div>
        <strong class="oi-sum">${escapeHTML(price(money(it.price * it.quantity)))}</strong>
        <button type="button" class="oi-remove" data-remove="${i}" aria-label="${escapeHTML(t('order.remove', { name: it.name }))}">×</button>
      </li>`).join('');
    totals();
  }
  list.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);

  function totals() {
    const items = cart.items();
    const subtotal = money(items.reduce((s, i) => s + i.price * i.quantity, 0));
    const delivery = form.fulfillment?.value === 'delivery';
    const fee = delivery ? settings.deliveryFee : 0;
    const total = money(subtotal + fee);
    $('#sumSubtotal').textContent = price(subtotal);
    $('#sumFee').textContent = !delivery ? '—' : fee ? price(fee) : t('order.free');
    $('#sumTotal').textContent = price(total);
    $('#btnTotal').textContent = `· ${price(total)}`;
    const minNote = $('#minNote');
    minNote.hidden = !(delivery && settings.minTotal > 0);
    minNote.textContent = t('order.minNote', { min: price(settings.minTotal) });
  }

  list.addEventListener('click', e => {
    const step = e.target.closest('[data-step]');
    const rm = e.target.closest('[data-remove]');
    if (step) {
      const i = Number(step.dataset.i);
      cart.setQuantity(i, cart.items()[i].quantity + Number(step.dataset.step));
    } else if (rm) {
      cart.remove(Number(rm.dataset.remove));
    } else return;
    render();
  });
  $('#clearCart').addEventListener('click', () => {
    if (window.confirm(t('order.confirmClear'))) { cart.clear(); render(); }
  });
  document.addEventListener('cart:change', () => render()); // changes from other tabs

  /* ---------- Checkout form ---------- */
  const addressField = $('#addressField');
  form.addEventListener('change', e => {
    if (e.target.name === 'fulfillment') {
      addressField.hidden = form.fulfillment.value !== 'delivery';
      totals();
    }
  });

  async function setupGate() {
    const me = await getMe();
    if (!me) {
      $('#orderGate').innerHTML = `
        <div class="gate">
          <strong>${escapeHTML(t('order.loginTitle'))}</strong>
          <p class="muted">${escapeHTML(t('order.loginText'))}</p>
          <a class="btn btn-primary btn-block" href="${loginUrl()}">${escapeHTML(t('auth.login'))} ${I.arrow}</a>
          <a class="btn btn-ghost btn-block" style="margin-top:.6rem" href="register.html?next=order.html">${escapeHTML(t('auth.signup'))}</a>
        </div>`;
      return;
    }
    form.hidden = false;
    if (me.phone && !form.phone.value) form.phone.value = me.phone;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    showMsg($('#orderMsg'), ''); showFieldErrors(form);
    const items = cart.items();
    if (!items.length) return;
    const btn = $('#placeOrder');
    setBusy(btn, true, t('order.sending'));
    try {
      const res = await api.placeOrder({
        items: items.map(i => ({ dishId: i.dishId, variant: i.variant, quantity: i.quantity })),
        fulfillment: form.fulfillment.value,
        payment: form.payment.value,
        address: form.address.value,
        phone: form.phone.value,
        note: form.note.value
      });
      cart.clear();
      showDone(res.order);
    } catch (err) {
      setBusy(btn, false);
      showFieldErrors(form, Array.isArray(err.details) ? err.details : []);
      showMsg($('#orderMsg'), err.message);
      if (err.code === 'EMAIL_NOT_VERIFIED') setTimeout(() => location.assign(`verify.html?email=${encodeURIComponent(err.details?.email || '')}`), 1200);
      if (err.code === 'UNAUTHORIZED') location.assign(loginUrl());
    }
  });

  function showDone(order) {
    $('#orderRoot').hidden = true;
    const done = $('#orderDone');
    done.hidden = false;
    done.innerHTML = `
      <div class="done-card">
        <div class="done-check" aria-hidden="true">✓</div>
        <h2>${escapeHTML(t('order.doneTitle', { id: order.id }))}</h2>
        <p>${escapeHTML(t('order.doneText'))}</p>
        <ul class="done-items">${order.items.map(i => `<li><span>${escapeHTML(i.name)}${i.variantLabel ? ` · ${escapeHTML(i.variantLabel)}` : ''} × ${i.quantity}</span><strong>${escapeHTML(price(i.lineTotal))}</strong></li>`).join('')}
          <li class="done-total"><span>${escapeHTML(t('order.total'))}</span><strong>${escapeHTML(price(order.total))}</strong></li></ul>
        <div class="done-actions">
          <a class="btn btn-primary" href="account.html#orders">${escapeHTML(t('account.orders'))} ${I.arrow}</a>
          <a class="btn btn-ghost" href="explore.html">${escapeHTML(t('order.browse'))}</a>
        </div>
      </div>`;
    done.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(t('order.doneTitle', { id: order.id }), 'success');
  }

  /** Refresh names, sizes, prices and photos in the current language (cart may be from another visit). */
  async function refreshCart() {
    const items = cart.items();
    if (!items.length) return;
    try {
      const ids = [...new Set(items.map(i => i.dishId))];
      const { dishes } = await api.dishes({ ids: ids.join(','), limit: ids.length });
      const byId = new Map(dishes.map(d => [d.id, d]));
      const next = items.filter(i => byId.has(i.dishId)).map(i => {
        const d = byId.get(i.dishId);
        const v = d.variants.find(x => x.code === i.variant) || (d.variants.length ? null : undefined);
        if (v === null) return null; // size no longer offered
        return { ...i, name: d.name, variantLabel: v?.label || null, price: v ? v.price : d.price, imageUrl: d.imageUrl, category: d.category.slug };
      }).filter(Boolean);
      cart.replace(next);
    } catch { /* show what we have */ }
  }

  try { settings = await api.orderConfig(); } catch { /* keep defaults */ }
  render();
  await refreshCart();
  setupGate();
})();
