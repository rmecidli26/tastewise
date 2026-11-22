/* My Favorites */
(async () => {
  const { $, escapeHTML, dishCard, loadingHTML, getMe, loginUrl, favorites, syncFavButtons } = TW;
  const grid = $('#favGrid');
  const box = (title, text, href, cta) => `<div class="empty-box" style="grid-column:1/-1"><strong>${escapeHTML(t(title))}</strong>${escapeHTML(t(text))}<br /><a class="btn btn-primary" href="${href}">${escapeHTML(t(cta))}</a></div>`;

  const me = await getMe();
  if (!me) { grid.innerHTML = box('fav.loginTitle', 'fav.loginText', loginUrl(), 'auth.login'); return; }

  async function load() {
    grid.innerHTML = loadingHTML();
    try {
      const { ids, dishes } = await api.favorites();
      favorites.clear();
      ids.forEach(i => favorites.add(i));
      grid.innerHTML = dishes.length ? dishes.map(dishCard).join('') : box('fav.emptyTitle', 'fav.emptyText', 'explore.html', 'fav.explore');
      syncFavButtons();
    } catch (err) {
      grid.innerHTML = `<div class="empty-box">${escapeHTML(err.message)}</div>`;
    }
  }
  // Un-hearting a dish here removes its card
  document.addEventListener('favorites:change', e => {
    if (!e.detail.isFavorite) grid.querySelector(`[data-fav="${e.detail.id}"]`)?.closest('.dish-card')?.remove();
    if (!grid.querySelector('.dish-card')) load();
  });
  load();
})();
