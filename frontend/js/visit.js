/* Visit AFA: restaurant info + gallery carousel */
(() => {
  const { $ } = TW;
  const track = $('#galleryTrack');
  const step = dir => {
    const img = track.querySelector('img');
    const w = img ? img.getBoundingClientRect().width + 16 : 240;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    if (dir > 0 && atEnd) track.scrollTo({ left: 0, behavior: 'smooth' });
    else if (dir < 0 && track.scrollLeft <= 0) track.scrollTo({ left: track.scrollWidth, behavior: 'smooth' });
    else track.scrollBy({ left: dir * w, behavior: 'smooth' });
  };
  $('#galPrev').addEventListener('click', () => step(-1));
  $('#galNext').addEventListener('click', () => step(1));
})();
