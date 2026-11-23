/* Home: ingredient + budget search → Explore, popular dishes */
(() => {
  const { $, escapeHTML, dishCard, loadingHTML, ingredientPicker, budgetSelect, loadFavorites, syncFavButtons } = TW;

  const picker = ingredientPicker($('#ingPicker'));
  budgetSelect($('#budgetSelect'), '');

  const go = () => {
    picker.flush();
    const qs = new URLSearchParams();
    const prefer = picker.values();
    const budget = $('#budgetSelect').value;
    if (prefer.length) qs.set('prefer', prefer.join(','));
    if (budget) qs.set('maxPrice', budget);
    location.assign(`explore.html${[...qs].length ? `?${qs}` : ''}`);
  };
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); go(); });
  $('#ingPicker').addEventListener('ing:submit', go);

  /* QR code that opens this website on a phone */
  const siteUrl = `${location.origin}/`;
  if (window.TWQR) $('#qrCode').innerHTML = TWQR.svg(siteUrl, { size: 116, label: t('qr.alt') });
  $('#qrUrl').href = siteUrl;
  $('#qrUrl').textContent = location.host;

  const grid = $('#popularGrid');
  grid.innerHTML = loadingHTML();
  api.dishes({ sort: 'popular', limit: 4 })
    .then(async ({ dishes }) => {
      grid.innerHTML = dishes.map(dishCard).join('');
      await loadFavorites();
      syncFavButtons();
    })
    .catch(() => { grid.innerHTML = `<div class="empty-state">${escapeHTML(t('home.unavailable'))}</div>`; });
})();
