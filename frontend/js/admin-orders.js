/* Admin: incoming orders — confirm → ready → completed (or decline) */
(async () => {
  const { $, $$, escapeHTML, loadingHTML, requireLogin, toast, price } = TW;
  await requireLogin({ admin: true });

  const box = $('#adminOrders');
  let status = 'active';
  let knownPending = null; // ids seen on the last refresh, to spot new orders

  const label = o => t(`ostatus.${o.status === 'ready' && o.fulfillment === 'delivery' ? 'onTheWay' : o.status}`);
  const when = d => `${I18N.fmtDate(new Date(d), { day: 'numeric', month: 'short' })}, ${new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baku' })}`;
  const actions = o => {
    const b = (s, key, cls = 'btn-primary') => `<button type="button" class="btn ${cls} btn-sm" data-id="${o.id}" data-status="${s}">${escapeHTML(t(key))}</button>`;
    if (o.status === 'pending') return b('confirmed', 'aorders.confirm') + b('declined', 'aorders.decline', 'btn-danger');
    if (o.status === 'confirmed') return b('ready', o.fulfillment === 'delivery' ? 'aorders.send' : 'aorders.ready') + b('declined', 'aorders.decline', 'btn-danger');
    if (o.status === 'ready') return b('completed', 'aorders.complete');
    return '';
  };

  async function load({ quiet = false } = {}) {
    if (!quiet) box.innerHTML = loadingHTML();
    try {
      const { orders } = await api.adminOrders({ status });
      const pending = orders.filter(o => o.status === 'pending').map(o => o.id);
      if (knownPending && status === 'active') {
        const fresh = pending.filter(id => !knownPending.includes(id));
        if (fresh.length) {
          $('#newOrders').hidden = false;
          $('#newOrders').textContent = t('aorders.new', { n: fresh.length });
          document.title = `(${fresh.length}) ${t('title.adminOrders')}`;
        }
      }
      knownPending = pending;
      box.innerHTML = orders.length ? orders.map(o => `
        <article class="order-card admin ${o.status === 'pending' ? 'is-new' : ''}">
          <header>
            <div>
              <h3>#${o.id} <span class="status ostatus-${o.status}">${escapeHTML(label(o))}</span></h3>
              <p class="muted">${escapeHTML(I18N.fmtDate(new Date(o.createdAt), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }))}, ${new Date(o.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baku' })}</p>
            </div>
            <strong class="order-card-total">${escapeHTML(price(o.total))}</strong>
          </header>
          <div class="ao-grid">
            <div>
              <h4>${escapeHTML(t('aorders.customer'))}</h4>
              <p>${escapeHTML(o.user.name)}<br /><span class="muted">${escapeHTML(o.user.email)}</span><br />
                <a class="link" href="tel:${escapeHTML(o.phone.replace(/[^\d+]/g, ''))}">${escapeHTML(o.phone)}</a></p>
              <h4>${escapeHTML(t('aorders.how'))}</h4>
              <p>${escapeHTML(t(o.fulfillment === 'delivery' ? 'order.deliveryOpt' : 'order.pickup'))}${o.address ? `<br /><strong>${escapeHTML(o.address)}</strong>` : ''}</p>
              <h4>${escapeHTML(t('aorders.when'))}</h4>
              <p><strong>${escapeHTML(o.time || t('order.asap'))}</strong></p>
              <h4>${escapeHTML(t('order.payTitle'))}</h4>
              <p>${o.paid
                ? `<span class="status ostatus-ready">${escapeHTML(t(o.paymentTest ? 'order.paidTest' : 'order.paid'))}</span> ${escapeHTML(o.card ? `${o.card.brand.toUpperCase()} •••• ${o.card.last4}` : '')}`
                : `${escapeHTML(t('order.payOnReceipt'))} · ${escapeHTML(t(o.payment === 'card' ? 'order.payTerminal' : 'order.payCash'))}`}</p>
            </div>
            <div>
              <h4>${escapeHTML(t('aorders.items'))}</h4>
              <ul class="order-card-items compact">
                ${o.items.map(i => `<li><span class="oc-name">${escapeHTML(i.name)}${i.variantLabel ? ` <small>${escapeHTML(i.variantLabel)}</small>` : ''}</span><span class="oc-qty">× ${i.quantity}</span><strong>${escapeHTML(price(i.lineTotal))}</strong></li>`).join('')}
              </ul>
              ${o.note ? `<p class="oc-note">“${escapeHTML(o.note)}”</p>` : ''}
              ${o.adminNote ? `<p class="muted"><em>${escapeHTML(t('admin.you', { note: o.adminNote }))}</em></p>` : ''}
            </div>
          </div>
          ${actions(o) ? `<footer>${actions(o)}</footer>` : ''}
        </article>`).join('') : `<div class="empty-box">${escapeHTML(t('aorders.empty'))}</div>`;
    } catch (err) {
      if (!quiet) box.innerHTML = `<div class="empty-box">${escapeHTML(err.message)}</div>`;
    }
  }

  $('#statusChips').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    $$('#statusChips .chip').forEach(x => x.setAttribute('aria-pressed', String(x === c)));
    status = c.dataset.value;
    knownPending = null;
    load();
  });
  $('#refresh').addEventListener('click', () => { $('#newOrders').hidden = true; document.title = t('title.adminOrders'); load(); });

  box.addEventListener('click', async e => {
    const b = e.target.closest('button[data-status]');
    if (!b) return;
    let note = '';
    if (b.dataset.status === 'declined') {
      note = window.prompt(t('aorders.promptDecline'), '');
      if (note === null) return;
    }
    b.disabled = true;
    try {
      await api.adminUpdateOrder(b.dataset.id, { status: b.dataset.status, adminNote: note });
      toast(t('aorders.toast'), 'success');
      load({ quiet: true });
    } catch (err) { toast(err.message, 'error'); b.disabled = false; }
  });

  load();
  // Check for new orders every 30 seconds while the page is open
  setInterval(() => { if (!document.hidden) load({ quiet: true }); }, 30000);
})();
