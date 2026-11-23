/* Reservation request form */
(async () => {
  const { $, escapeHTML, getMe, loginUrl, showMsg, showFieldErrors, setBusy, toast } = TW;
  const form = $('#reserveForm'), gate = $('#reserveGate');

  const me = await getMe();
  if (!me) {
    gate.innerHTML = `
      <h3 style="font-size:1.6rem;margin:.4rem 0 .5rem">${escapeHTML(t('reserve.gateTitle'))}</h3>
      <p class="muted">${escapeHTML(t('reserve.gateText'))}</p>
      <div style="display:flex;gap:.7rem;flex-wrap:wrap;margin-top:1.25rem">
        <a class="btn btn-primary" href="${loginUrl()}">${escapeHTML(t('auth.login'))}</a>
        <a class="btn btn-ghost" href="register.html?next=reserve.html">${escapeHTML(t('reserve.create'))}</a>
      </div>`;
    return;
  }
  form.hidden = false;

  // Date: today (Baku time) … +60 days
  const bakuToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(new Date()); // YYYY-MM-DD
  const plusDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  form.date.min = bakuToday;
  form.date.max = plusDays(bakuToday, 60);
  form.date.value = plusDays(bakuToday, 1);

  // Time slots every 30 min, 10:00–22:00
  const slots = [];
  for (let h = 10; h <= 22; h++) for (const m of ['00', '30']) if (!(h === 22 && m === '30')) slots.push(`${String(h).padStart(2, '0')}:${m}`);
  form.time.innerHTML = slots.map(s => `<option ${s === '19:00' ? 'selected' : ''}>${s}</option>`).join('');
  // Guests: type any number 1–20 or use − / +
  const clampGuests = () => {
    const n = Math.round(Number(form.guests.value));
    form.guests.value = Number.isFinite(n) && n > 0 ? Math.min(20, n) : 1;
  };
  form.querySelectorAll('.g-btn').forEach(b => b.addEventListener('click', () => {
    form.guests.value = Math.max(1, Math.min(20, (Number(form.guests.value) || 0) + Number(b.dataset.g)));
  }));
  form.guests.addEventListener('change', clampGuests);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    showMsg($('#formMsg'), '');
    showFieldErrors(form);
    const btn = form.querySelector('[type=submit]');
    setBusy(btn, true, t('reserve.sending'));
    try {
      const { reservation: r } = await api.reserve({
        date: form.date.value,
        time: form.time.value,
        guests: (clampGuests(), Number(form.guests.value)),
        phone: form.phone.value,
        note: form.note.value
      });
      form.hidden = true;
      const when = I18N.fmtDate(new Date(`${r.date}T12:00:00`), { weekday: 'long', day: 'numeric', month: 'long' });
      gate.innerHTML = `
        <span class="status status-pending">${escapeHTML(t('status.pending'))}</span>
        <h2 style="font-size:2.2rem;margin:.75rem 0 .5rem">${escapeHTML(t('reserve.doneTitle'))}</h2>
        <p class="muted" id="doneText"></p>
        <p style="font-size:1.1rem;margin:1.25rem 0">${escapeHTML(t('reserve.doneWhen', { date: when, time: r.time, guests: t('account.guests', { n: r.guests }) }))}</p>
        <div style="display:flex;gap:.7rem;flex-wrap:wrap">
          <a class="btn btn-primary" href="account.html#reservations">${escapeHTML(t('reserve.mine'))}</a>
          <a class="btn btn-ghost" href="explore.html">${escapeHTML(t('reserve.browse'))}</a>
        </div>`;
      $('#doneText').replaceChildren(I18N.tNodes('reserve.doneText', { email: Object.assign(document.createElement('strong'), { textContent: me.email }) }));
      toast(t('reserve.toast'), 'success');
    } catch (err) {
      showFieldErrors(form, Array.isArray(err.details) ? err.details : []);
      showMsg($('#formMsg'), err.message);
    } finally {
      setBusy(btn, false);
    }
  });
})();
