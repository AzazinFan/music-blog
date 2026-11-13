'use strict';
(() => {
  const entries = window.MUSIC_CATALOG || [];
  const storageKey = 'music-blog:saved:v1';
  const localFileMode = location.protocol === 'file:';
  const fileParams = new URLSearchParams(location.search);
  const toast = document.querySelector('#toast');
  let timer;
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }
  const storedSaved = read(storageKey, []);
  let saved = new Set((Array.isArray(storedSaved) ? storedSaved : []).filter(url => entries.some(e => e.url === url)));
  // File URLs can isolate localStorage for each page. Carry only bookmark IDs
  // through internal navigation so the folder can be demonstrated without a server.
  if (localFileMode && fileParams.has('mb_saved')) {
    saved = new Set((fileParams.get('mb_saved') || '').split('.').filter(id => /^[0-9a-z]+$/.test(id)).map(id => entries[parseInt(id, 36)]?.url).filter(Boolean));
    write(storageKey, [...saved]);
  }
  function syncFileNavigation() {
    if (!localFileMode) return;
    const payload = entries.map((entry, index) => saved.has(entry.url) ? index.toString(36) : null).filter(id => id !== null).join('.');
    document.querySelectorAll('a[href]').forEach(link => {
      const target = new URL(link.getAttribute('href'), location.href);
      if (target.protocol !== 'file:' || !target.pathname.endsWith('.html')) return;
      target.searchParams.set('mb_saved', payload);
      link.href = target.href;
    });
    document.querySelectorAll('.search-form').forEach(form => {
      let input = form.querySelector('[name="mb_saved"]');
      if (!input) { input = document.createElement('input'); input.type = 'hidden'; input.name = 'mb_saved'; form.append(input); }
      input.value = payload;
    });
    try {
      const current = new URL(location.href); current.searchParams.set('mb_saved', payload);
      history.replaceState(null, '', current);
    } catch { /* Navigation links still carry state when file history is restricted. */ }
  }
  function announce(message) {
    if (!toast) return;
    clearTimeout(timer);
    toast.textContent = message;
    timer = setTimeout(() => { toast.textContent = ''; }, 4200);
  }
  function updateSaved() {
    document.querySelectorAll('.saved-count').forEach(el => {
      el.textContent = String(saved.size);
      el.hidden = !saved.size;
    });
    document.querySelectorAll('[data-save]').forEach(button => {
      const active = saved.has(button.dataset.save);
      button.setAttribute('aria-pressed', String(active));
      button.querySelector('span').textContent = active ? 'Сохранено' : 'Читать позже';
    });
    syncFileNavigation();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-save]');
    if (!button) return;
    const url = button.dataset.save;
    const next = new Set(saved);
    if (next.has(url)) next.delete(url); else next.add(url);
    if (!write(storageKey, [...next]) && !localFileMode) {
      announce('Браузер запретил сохранение. Разрешите локальное хранение данных.');
      return;
    }
    saved = next;
    updateSaved();
    announce(saved.has(url) ? 'Материал сохранен в «Читать позже»' : 'Материал больше не отложен');
    if (document.querySelector('[data-mode="saved"]')) renderCatalog();
  });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey) return;
    const value = read(storageKey, []);
    saved = new Set(Array.isArray(value) ? value : []);
    updateSaved();
    if (document.querySelector('[data-mode="saved"]')) renderCatalog();
  });
  updateSaved();

  // Native details menus also work with JavaScript disabled.
  const menus = [...document.querySelectorAll('.more-menu, .mobile-menu')];
  document.addEventListener('click', event => {
    for (const menu of menus) if (!menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    for (const menu of menus) if (menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
  menus.forEach(menu => menu.addEventListener('toggle', () => {
    if (menu.open) for (const other of menus) if (other !== menu) other.open = false;
  }));

  const results = document.querySelector('#catalog-results');
  const status = document.querySelector('#results-status');
  const query = document.querySelector('.catalog-page #site-search');
  const section = document.querySelector('#section-filter');
  const genre = document.querySelector('#genre-filter');
  const source = document.querySelector('#source-filter');
  const rating = document.querySelector('#rating-filter');
  const params = new URLSearchParams(location.search);
  if (query) query.value = (params.get('q') || '').slice(0, 160);
  if (section && [...section.options].some(o => o.value === params.get('section'))) section.value = params.get('section');
  if (genre && [...genre.options].some(o => o.value === params.get('genre'))) genre.value = params.get('genre');
  const normalize = value => String(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/электроника/g, 'электронная').trim();
  const bookmarkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4V4Z"/></svg>';
  function element(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function renderCatalog() {
    if (!results) return;
    const words = normalize(query?.value || '').split(/\s+/).filter(Boolean);
    const isSaved = results.dataset.mode === 'saved';
    const matches = entries.filter(entry => {
      if (isSaved && !saved.has(entry.url)) return false;
      if (section?.value && entry.section !== section.value) return false;
      if (source?.value === 'new' && entry.archive) return false;
      if (source?.value === 'archive' && !entry.archive) return false;
      if (rating?.value && (entry.rating === null || entry.rating < Number(rating.value))) return false;
      const haystack = normalize([entry.title, entry.description, entry.text, entry.category, ...entry.tags].join(' '));
      if (genre?.value && !haystack.includes(normalize(genre.value))) return false;
      return words.every(word => haystack.includes(word));
    });
    matches.sort((a, b) => Number(a.archive) - Number(b.archive));
    results.replaceChildren();
    status.textContent = isSaved ? `Сохранено материалов: ${matches.length}` : `Найдено материалов: ${matches.length}`;
    if (!matches.length) {
      const empty = element('div', 'empty-state');
      empty.append(element('h2', '', isSaved ? 'Пока ничего не отложено' : 'Такого материала пока нет'));
      empty.append(element('p', '', isSaved ? 'Откройте статью и нажмите «Читать позже». Она появится здесь и останется после перезагрузки.' : 'Попробуйте другое слово или снимите фильтры. Например: «джаз», «альбом» или «продюсер».'));
      const link = element('a', 'button', isSaved ? 'Найти интересное' : 'Сбросить поиск');
      link.href = 'search.html'; empty.append(link); results.append(empty); return;
    }
    const fragment = document.createDocumentFragment();
    for (const entry of matches) {
      const card = element('article', 'result-card');
      const photoLink = element('a', ''); photoLink.href = entry.url; photoLink.tabIndex = -1; photoLink.setAttribute('aria-hidden', 'true');
      const img = document.createElement('img'); img.src = `assets/images/${entry.image}.jpg`; img.alt = ''; img.width = 1400; img.height = 934; img.loading = 'lazy';
      photoLink.append(img); card.append(photoLink);
      card.append(element('div', 'result-meta', `${entry.category} · ${entry.archive ? 'Учебный архив' : 'Редакционный материал'}`));
      const heading = element('h2'); const link = element('a', '', entry.title); link.href = entry.url; heading.append(link); card.append(heading);
      card.append(element('p', '', entry.description));
      const button = element('button', 'save-button'); button.type = 'button'; button.dataset.save = entry.url; button.setAttribute('aria-label', `Читать позже: ${entry.title}`);
      button.innerHTML = bookmarkSvg; button.append(element('span', '', 'Читать позже')); card.append(button);
      fragment.append(card);
    }
    results.append(fragment); updateSaved();
  }
  document.querySelector('.catalog-page .search-form')?.addEventListener('submit', event => {
    event.preventDefault(); renderCatalog();
    const next = new URL(location.href); next.search = '';
    if (query.value.trim()) next.searchParams.set('q', query.value.trim());
    if (section.value) next.searchParams.set('section', section.value);
    if (genre.value) next.searchParams.set('genre', genre.value);
    try { history.replaceState(null, '', next); } catch { /* File URLs can restrict history. */ }
    syncFileNavigation();
  });
  let searchTimer;
  query?.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderCatalog, 160); });
  [section, genre, source, rating].forEach(select => select?.addEventListener('change', renderCatalog));
  renderCatalog();
  if (localFileMode && results?.dataset.mode === 'saved') {
    const help = element('p', 'page-description', 'При показе из папки переходите между страницами по ссылкам внутри сайта. Избранное переносится вместе с этими переходами. На GitHub Pages оно сохраняется между посещениями.');
    results.before(help);
  }

  document.querySelectorAll('[data-like]').forEach(button => {
    const key = `music-blog:like:${button.dataset.like}`;
    function update() { const liked = read(key, false); button.setAttribute('aria-pressed', String(liked)); button.textContent = liked ? 'Вам понравилось' : 'Нравится'; }
    button.addEventListener('click', () => {
      if (!write(key, !read(key, false))) { announce('Не удалось сохранить отметку в браузере.'); return; }
      update(); announce('Ваша отметка сохранена на этом устройстве');
    }); update();
  });
  const feedback = document.querySelector('#feedback-form');
  if (feedback) {
    const draft = read('music-blog:feedback:v1', null);
    if (draft && typeof draft === 'object') for (const name of ['name', 'topic', 'message']) if (typeof draft[name] === 'string') feedback.elements[name].value = draft[name];
    feedback.addEventListener('submit', event => {
      event.preventDefault();
      if (!feedback.reportValidity()) return;
      const value = Object.fromEntries(new FormData(feedback));
      const ok = write('music-blog:feedback:v1', value);
      document.querySelector('#feedback-status').textContent = ok ? 'Черновик сохранен в этом браузере. Сообщение не отправлялось.' : 'Сохранение недоступно. Скопируйте текст сообщения вручную.';
    });
  }
  const noteForm = document.querySelector('#note-form');
  if (noteForm) {
    const field = document.querySelector('#music-note');
    const note = read('music-blog:note:v1', '');
    field.value = typeof note === 'string' ? note : '';
    noteForm.addEventListener('submit', event => {
      event.preventDefault();
      if (!noteForm.reportValidity()) return;
      const ok = write('music-blog:note:v1', field.value.trim());
      document.querySelector('#note-status').textContent = ok ? 'Заметка сохранена на этом устройстве. Другим посетителям она не видна.' : 'Не удалось сохранить. Скопируйте заметку вручную.';
    });
  }
})();
