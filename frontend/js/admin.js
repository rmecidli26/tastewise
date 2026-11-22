/* Admin: confirm / decline reservation requests */
(async () => {
  const { $, $$, escapeHTML, loadingHTML, requireLogin, toast } = TW;
  await requireLogin({ admin: true });

  const rows = $('#adminRows');
  let status = 'pending';

  async function load() {
    rows.innerHTML = `<tr><td colspan="6">${loadingHTML()}</td></tr>`;
    try {
      const { reservations } = await api.adminReservations({ status, upcoming: $('#upcomingOnly').checked });
      rows.innerHTML = reservations.length ? reservations.map(r => `
        <tr>
          <td><strong>${escapeHTML(I18N.fmtDate(new Date(`${r.date}T12:00:00`), { day: 'numeric', month: 'short', year: 'numeric' }))}</strong><br />${escapeHTML(r.time)}</td>
          <td>${escapeHTML(r.user.name)}<br /><span class="muted">${escapeHTML(r.user.email)}</span><br /><a class="link" href="tel:${escapeHTML(r.phone.replace(/[^\d+]/g, ''))}">${escapeHTML(r.phone)}</a></td>
          <td>${r.guests}</td>
          <td style="max-width:240px">${escapeHTML(r.note) || '<span class="muted">—</span>'}${r.adminNote ? `<br /><em class="muted">${escapeHTML(t('admin.you', { note: r.adminNote }))}</em>` : ''}</td>
          <td><span class="status status-${r.status}">${escapeHTML(t(`status.${r.status}`))}</span></td>
          <td><div class="actions">
            ${r.status !== 'confirmed' && r.status !== 'cancelled' ? `<button class="btn btn-primary" data-id="${r.id}" data-status="confirmed">${escapeHTML(t('admin.confirm'))}</button>` : ''}
            ${r.status !== 'declined' && r.status !== 'cancelled' ? `<button class="btn btn-danger" data-id="${r.id}" data-status="declined">${escapeHTML(t('admin.decline'))}</button>` : ''}
          </div></td>
        </tr>`).join('') : `<tr><td colspan="6" class="muted" style="text-align:center;padding:2.5rem">${escapeHTML(t('admin.empty'))}</td></tr>`;
    } catch (err) {
      rows.innerHTML = `<tr><td colspan="6">${escapeHTML(err.message)}</td></tr>`;
    }
  }

  $('#statusChips').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    $$('#statusChips .chip').forEach(x => x.setAttribute('aria-pressed', String(x === c)));
    status = c.dataset.value;
    load();
  });
  $('#upcomingOnly').addEventListener('change', load);

  rows.addEventListener('click', async e => {
    const b = e.target.closest('button[data-status]');
    if (!b) return;
    const note = window.prompt(t(b.dataset.status === 'confirmed' ? 'admin.promptConfirm' : 'admin.promptDecline'), '');
    if (note === null) return;
    b.disabled = true;
    try {
      await api.adminUpdateReservation(b.dataset.id, { status: b.dataset.status, adminNote: note });
      toast(t(b.dataset.status === 'confirmed' ? 'admin.toastConfirmed' : 'admin.toastDeclined'), 'success');
      load();
    } catch (err) { toast(err.message, 'error'); b.disabled = false; }
  });

  load();
})();
