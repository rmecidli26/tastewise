/* Card entry form.
   The full card number and CVC stay in this browser: they are checked here (Luhn, expiry) and only
   { brand, last4, expMonth, expYear } is ever sent to the server. With a real payment provider this
   form is replaced by the provider's secure fields, which return a token instead. */
(() => {
  const BRANDS = [
    { id: 'amex', re: /^3[47]/, len: [15], cvc: 4, groups: [4, 6, 5] },
    { id: 'visa', re: /^4/, len: [13, 16, 19], cvc: 3 },
    { id: 'mastercard', re: /^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/, len: [16], cvc: 3 },
    { id: 'unionpay', re: /^62/, len: [16, 17, 18, 19], cvc: 3 }
  ];
  const detect = digits => BRANDS.find(b => b.re.test(digits)) || { id: 'card', len: [16], cvc: 3 };
  const luhn = digits => {
    let sum = 0, alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = Number(digits[i]);
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return digits.length >= 12 && sum % 10 === 0;
  };
  const group = (digits, brand) => {
    const g = brand.groups || [4, 4, 4, 4, 3];
    const out = []; let i = 0;
    for (const size of g) { if (i >= digits.length) break; out.push(digits.slice(i, i + size)); i += size; }
    return out.join(' ');
  };
  const LOGO = {
    visa: '<svg viewBox="0 0 48 16" aria-hidden="true"><text x="0" y="13" font-family="Arial Black,Arial" font-weight="900" font-style="italic" font-size="15" fill="currentColor">VISA</text></svg>',
    mastercard: '<svg viewBox="0 0 40 24" aria-hidden="true"><circle cx="15" cy="12" r="10" fill="#eb001b"/><circle cx="25" cy="12" r="10" fill="#f79e1b" fill-opacity=".9"/></svg>',
    amex: '<svg viewBox="0 0 48 16" aria-hidden="true"><text x="0" y="13" font-family="Arial" font-weight="700" font-size="12" fill="currentColor">AMEX</text></svg>',
    unionpay: '<svg viewBox="0 0 60 16" aria-hidden="true"><text x="0" y="13" font-family="Arial" font-weight="700" font-size="11" fill="currentColor">UnionPay</text></svg>',
    card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.5 9.5h19" stroke="currentColor" stroke-width="1.6"/></svg>'
  };
  const brandName = id => ({ visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', unionpay: 'UnionPay', card: 'Card' }[id] || 'Card');

  /**
   * mount(root, { save: true }) → { read(), reset(), focus() }
   * read() returns { ok, card: {brand,last4,expMonth,expYear}, save, field }  (no number, no CVC)
   */
  function mount(root, opts = {}) {
    const e = s => TW.escapeHTML(t(s));
    root.innerHTML = `
      <div class="card-preview" aria-hidden="true">
        <div class="cp-top"><span class="cp-chip"></span><span class="cp-brand">${LOGO.card}</span></div>
        <div class="cp-number">•••• •••• •••• ••••</div>
        <div class="cp-bottom"><span class="cp-name">${e('card.holderPh')}</span><span class="cp-exp">MM/YY</span></div>
      </div>
      <div class="form-field">
        <label for="cfNumber">${e('card.number')}</label>
        <input class="input cf-number" id="cfNumber" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" maxlength="23" />
        <span class="field-error" data-err="number"></span>
      </div>
      <div class="form-field">
        <label for="cfName">${e('card.holder')}</label>
        <input class="input" id="cfName" autocomplete="cc-name" placeholder="${e('card.holderPh')}" maxlength="40" />
      </div>
      <div class="form-row cf-row">
        <div class="form-field">
          <label for="cfExp">${e('card.exp')}</label>
          <input class="input" id="cfExp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" maxlength="5" />
          <span class="field-error" data-err="exp"></span>
        </div>
        <div class="form-field">
          <label for="cfCvc">CVC</label>
          <input class="input" id="cfCvc" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4" type="password" />
          <span class="field-error" data-err="cvc"></span>
        </div>
      </div>
      ${opts.save ? `<label class="check cf-save"><input type="checkbox" id="cfSave" checked /> <span>${e('pcard.save')}</span></label>` : ''}
      <p class="cf-secure"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>${e('card.secure')}</p>`;

    const $ = s => root.querySelector(s);
    const num = $('#cfNumber'), exp = $('#cfExp'), cvc = $('#cfCvc'), name = $('#cfName');
    const setErr = (k, msg) => { const el = root.querySelector(`[data-err="${k}"]`); if (el) el.textContent = msg || ''; };

    const paint = () => {
      const digits = num.value.replace(/\D/g, '');
      const b = detect(digits);
      $('.cp-brand').innerHTML = LOGO[b.id];
      $('.card-preview').dataset.brand = b.id;
      const shown = (digits + '•'.repeat(Math.max(0, 16 - digits.length))).slice(0, Math.max(16, digits.length));
      $('.cp-number').textContent = group(shown, b) || '•••• •••• •••• ••••';
      $('.cp-exp').textContent = exp.value || 'MM/YY';
      $('.cp-name').textContent = name.value.toUpperCase() || t('card.holderPh');
      cvc.maxLength = b.cvc;
    };
    num.addEventListener('input', () => {
      const digits = num.value.replace(/\D/g, '').slice(0, 19);
      num.value = group(digits, detect(digits));
      setErr('number'); paint();
    });
    exp.addEventListener('input', ev => {
      let d = exp.value.replace(/\D/g, '').slice(0, 4);
      if (d.length === 1 && d > '1') d = `0${d}`;
      exp.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : (d.length === 2 && ev.inputType !== 'deleteContentBackward' ? `${d}/` : d);
      setErr('exp'); paint();
    });
    cvc.addEventListener('input', () => { cvc.value = cvc.value.replace(/\D/g, ''); setErr('cvc'); });
    name.addEventListener('input', paint);
    paint();

    function read() {
      const digits = num.value.replace(/\D/g, '');
      const b = detect(digits);
      const [mm, yy] = exp.value.split('/');
      const expMonth = Number(mm), expYear = 2000 + Number(yy);
      const now = new Date();
      let bad = null;
      if (!(b.len.includes(digits.length) || (b.id === 'card' && digits.length >= 13 && digits.length <= 19)) || !luhn(digits)) { setErr('number', t('card.badNumber')); bad = bad || num; }
      if (!(expMonth >= 1 && expMonth <= 12) || !yy || yy.length !== 2) { setErr('exp', t('card.badExp')); bad = bad || exp; }
      else if (expYear < now.getFullYear() || (expYear === now.getFullYear() && expMonth < now.getMonth() + 1)) { setErr('exp', t('card.expired')); bad = bad || exp; }
      if (cvc.value.length !== b.cvc) { setErr('cvc', t('card.badCvc')); bad = bad || cvc; }
      if (bad) { bad.focus(); return { ok: false }; }
      return {
        ok: true,
        card: { brand: b.id, last4: digits.slice(-4), expMonth, expYear },
        save: opts.save ? $('#cfSave').checked : false
      };
    }
    function reset() { [num, exp, cvc, name].forEach(i => { i.value = ''; }); ['number', 'exp', 'cvc'].forEach(k => setErr(k)); paint(); }
    return { read, reset, focus: () => num.focus() };
  }

  const label = c => `${brandName(c.brand)} •••• ${c.last4}`;
  const expLabel = c => `${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)}`;
  window.TWCard = { mount, LOGO, brandName, label, expLabel };
})();
