/* Order page: cart, totals, step-by-step checkout (pickup/delivery, time, contact, payment) */
(async () => {
  const { $, $$, escapeHTML, price, cart, getMe, loginUrl, showMsg, showFieldErrors, setBusy, toast, I } = TW;
  const list = $('#orderList');
  const form = $('#orderForm');
  let settings = { deliveryFee: 0, minTotal: 0, cardPayments: 'test', firstTime: '10:00', lastTime: '22:30', timeZone: 'Asia/Baku' };
  let savedCards = [];
  let cardForm = null;
  const money = n => Math.round(n * 100) / 100;
  const ICON = { pizza: I.pizza, doner: I.wrap, drinks: I.cup, desserts: I.cake };

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
          ${ICON[it.category] || I.bag}
          ${it.imageUrl ? `<img src="${escapeHTML(it.imageUrl)}" alt="" loading="lazy"${it.category === 'drinks' && it.slug ? ` data-fallback="images/dishes/${escapeHTML(it.slug)}.svg"` : ''} />` : ''}
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
  list.addEventListener('error', e => {
    const img = e.target; if (img.tagName !== 'IMG') return;
    if (img.dataset.fallback) { img.src = img.dataset.fallback; delete img.dataset.fallback; } else img.remove();
  }, true);

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
    const gateTotal = $('#gateTotal');
    if (gateTotal) gateTotal.textContent = price(total);
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
  document.addEventListener('cart:change', () => render());

  /* ---------- Time: today or tomorrow; quick buttons + type any time ---------- */
  const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  const toHM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const bakuNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: settings.timeZone }));
  /** Earliest allowed minute of the chosen day (today: now + 45 min, rounded up to 5 min) */
  const earliestFor = day => {
    const open = toMin(settings.firstTime);
    if (day === 'tomorrow') return open;
    const n = bakuNow();
    return Math.max(open, Math.ceil((n.getHours() * 60 + n.getMinutes() + 45) / 5) * 5);
  };
  function fillTimes() {
    const close = toMin(settings.lastTime);
    let day = form.day.value;
    if (day === 'today' && earliestFor('today') > close) { // too late today → switch to tomorrow
      form.querySelector('input[name="day"][value="tomorrow"]').checked = true;
      day = 'tomorrow';
      $('#slotsEmpty').hidden = false;
    } else if (day === 'today') $('#slotsEmpty').hidden = true;
    const from = earliestFor(day);
    const first = Math.ceil(from / 15) * 15;
    const chips = [];
    for (let m = first; m <= close && chips.length < 8; m += m < first + 60 ? 15 : 30) chips.push(toHM(m));
    $('#slotChips').innerHTML = chips.map(c => `<button type="button" class="slot" data-time="${c}" aria-pressed="false">${c}</button>`).join('');
    const input = $('#time');
    input.min = toHM(from);
    input.max = settings.lastTime;
    $('#timeHint').textContent = t('order.timeRange', { from: toHM(from), to: settings.lastTime });
    if (!input.value || toMin(input.value) < from || toMin(input.value) > close) input.value = chips[0] || '';
    syncChips();
    $('#timeError').textContent = '';
  }
  function syncChips() {
    $$('#slotChips .slot').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.time === $('#time').value)));
  }
  /** Returns "HH:MM" or null with an error message shown */
  function checkTime() {
    const v = $('#time').value;
    const from = earliestFor(form.day.value), close = toMin(settings.lastTime);
    let err = '';
    if (!/^\d{2}:\d{2}$/.test(v)) err = t('order.timeRequired');
    else if (toMin(v) < from || toMin(v) > close) err = t('order.timeOut', { from: toHM(from), to: settings.lastTime });
    $('#timeError').textContent = err;
    $('#time').toggleAttribute('aria-invalid', Boolean(err));
    return err ? null : v;
  }
  $('#slotChips').addEventListener('click', e => {
    const b = e.target.closest('.slot'); if (!b) return;
    $('#time').value = b.dataset.time; syncChips(); checkTime();
  });
  $('#time').addEventListener('input', () => { syncChips(); $('#timeError').textContent = ''; });
  $('#time').addEventListener('change', checkTime);

  /* ---------- Payment ---------- */
  function renderCards() {
    const box = $('#savedCards');
    const opts = savedCards.map((c, i) => `
      <label class="saved-card">
        <input type="radio" name="cardChoice" value="${c.id}" ${i === 0 ? 'checked' : ''} />
        <span class="sc-logo" data-brand="${c.brand}">${TWCard.LOGO[c.brand] || TWCard.LOGO.card}</span>
        <span class="sc-text"><strong>${escapeHTML(TWCard.label(c))}</strong><small>${escapeHTML(t('card.expShort', { exp: TWCard.expLabel(c) }))}</small></span>
      </label>`).join('');
    box.innerHTML = opts + `
      <label class="saved-card new">
        <input type="radio" name="cardChoice" value="new" ${savedCards.length ? '' : 'checked'} />
        <span class="sc-logo">+</span>
        <span class="sc-text"><strong>${escapeHTML(t('pcard.new'))}</strong></span>
      </label>`;
    box.hidden = !savedCards.length;
    syncCardChoice();
  }
  function syncCardChoice() {
    const choice = form.querySelector('input[name="cardChoice"]:checked')?.value || 'new';
    const box = $('#newCard');
    box.hidden = choice !== 'new';
    if (choice === 'new' && !cardForm) cardForm = TWCard.mount(box, { save: true });
  }
  function syncPayment() {
    const online = form.payment.value === 'online';
    $('#onlinePay').hidden = !online;
    $('#placeLabel').textContent = t(online ? 'order.placeAndPay' : 'order.submit');
    if (online) syncCardChoice();
  }

  form.addEventListener('change', e => {
    if (e.target.name === 'fulfillment') { $('#addressField').hidden = form.fulfillment.value !== 'delivery'; totals(); }
    if (e.target.name === 'when') { $('#timeField').hidden = form.when.value !== 'later'; if (form.when.value === 'later') fillTimes(); }
    if (e.target.name === 'day') { $('#slotsEmpty').hidden = true; $('#time').value = ''; fillTimes(); }
    if (e.target.name === 'payment') syncPayment();
    if (e.target.name === 'cardChoice') syncCardChoice();
  });

  /* ---------- Sign-in gate ---------- */
  async function setupGate() {
    const me = await getMe();
    if (!me) {
      $('#orderGate').innerHTML = `
        <div class="gate">
          <div class="gate-total"><span>${escapeHTML(t('order.total'))}</span><strong id="gateTotal"></strong></div>
          <strong>${escapeHTML(t('order.loginTitle'))}</strong>
          <p class="muted">${escapeHTML(t('order.loginText'))}</p>
          <a class="btn btn-primary btn-block" href="${loginUrl()}">${escapeHTML(t('auth.login'))} ${I.arrow}</a>
          <a class="btn btn-ghost btn-block" style="margin-top:.6rem" href="register.html?next=order.html">${escapeHTML(t('auth.signup'))}</a>
        </div>`;
      totals();
      return;
    }
    form.hidden = false;
    if (me.phone && !form.phone.value) form.phone.value = me.phone;
    if (settings.cardPayments === 'off') {
      $('#onlineTile').remove();
    } else {
      try { savedCards = (await api.cards()).cards; } catch { savedCards = []; }
      renderCards();
    }
    syncPayment();
  }

  /* ---------- Submit ---------- */
  form.addEventListener('submit', async e => {
    e.preventDefault();
    showMsg($('#orderMsg'), ''); showFieldErrors(form);
    $('#cardError').textContent = '';
    const items = cart.items();
    if (!items.length) return;
    if (form.when.value === 'later' && !checkTime()) { $('#time').focus(); return; }

    const body = {
      items: items.map(i => ({ dishId: i.dishId, variant: i.variant, quantity: i.quantity })),
      fulfillment: form.fulfillment.value,
      payment: form.payment.value,
      time: form.when.value === 'later' ? form.time.value : 'asap',
      day: form.when.value === 'later' ? form.day.value : 'today',
      address: form.address.value,
      phone: form.phone.value,
      note: form.note.value
    };
    if (body.payment === 'online') {
      const choice = form.querySelector('input[name="cardChoice"]:checked')?.value || 'new';
      if (choice === 'new') {
        const r = cardForm.read(); // card number and CVC stay in the browser
        if (!r.ok) return;
        body.card = { ...r.card, save: r.save };
      } else {
        body.cardId = Number(choice);
      }
    }

    const btn = $('#placeOrder');
    setBusy(btn, true, t('order.sending'));
    try {
      const res = await api.placeOrder(body);
      cart.clear();
      cardForm?.reset();
      showDone(res.order);
    } catch (err) {
      setBusy(btn, false);
      const details = Array.isArray(err.details) ? err.details : [];
      showFieldErrors(form, details);
      const cardErr = details.find(d => d.field === 'card' || d.field?.startsWith?.('card'));
      if (cardErr) $('#cardError').textContent = cardErr.message;
      showMsg($('#orderMsg'), err.message);
      $('#orderMsg').scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (err.code === 'EMAIL_NOT_VERIFIED') setTimeout(() => location.assign(`verify.html?email=${encodeURIComponent(err.details?.email || '')}`), 1200);
      if (err.code === 'UNAUTHORIZED') location.assign(loginUrl());
    }
  });

  function showDone(order) {
    $('#orderRoot').hidden = true;
    const done = $('#orderDone');
    done.hidden = false;
    const payLine = order.paid
      ? `${t(order.paymentTest ? 'order.paidTest' : 'order.paid')} · ${TWCard.label(order.card)}`
      : `${t('order.payOnReceipt')} · ${t(order.payment === 'card' ? 'order.payTerminal' : 'order.payCash')}`;
    done.innerHTML = `
      <div class="done-card">
        <div class="done-check" aria-hidden="true">✓</div>
        <h2>${escapeHTML(t('order.doneTitle', { id: order.id }))}</h2>
        <p>${escapeHTML(t('order.doneText'))}</p>
        <ul class="done-items">${order.items.map(i => `<li><span>${escapeHTML(i.name)}${i.variantLabel ? ` · ${escapeHTML(i.variantLabel)}` : ''} × ${i.quantity}</span><strong>${escapeHTML(price(i.lineTotal))}</strong></li>`).join('')}
          <li class="done-total"><span>${escapeHTML(t('order.total'))}</span><strong>${escapeHTML(price(order.total))}</strong></li></ul>
        <p class="done-meta">${escapeHTML(order.time ? t(order.timeTomorrow ? 'account.orderTimeTomorrow' : 'account.orderTime', { time: order.time }) : t('order.asap'))} · ${escapeHTML(payLine)}</p>
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
        return { ...i, name: d.name, slug: d.slug, variantLabel: v?.label || null, price: v ? v.price : d.price, imageUrl: d.imageUrl, category: d.category.slug };
      }).filter(Boolean);
      cart.replace(next);
    } catch { /* show what we have */ }
  }

  try { settings = { ...settings, ...(await api.orderConfig()) }; } catch { /* keep defaults */ }
  render();
  await refreshCart();
  setupGate();
})();
