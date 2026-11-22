/* Login, register, email verification and password reset pages */
(() => {
  const { $, $$, param, safeNext, getMe, toast, showMsg, showFieldErrors, setBusy } = TW;
  const page = document.body.dataset.page;
  const VERIFY_KEY = 'tw:verifyEmail';
  const store = {
    get: () => { try { return sessionStorage.getItem(VERIFY_KEY) || ''; } catch { return ''; } },
    set: v => { try { sessionStorage.setItem(VERIFY_KEY, v); sessionStorage.setItem('tw:codeSentAt', String(Date.now())); } catch { /* private mode */ } },
    secondsSinceSent: () => { try { return (Date.now() - Number(sessionStorage.getItem('tw:codeSentAt') || 0)) / 1000; } catch { return 999; } }
  };
  // In development (no SMTP) the API returns the code — show it so the flow can be tested
  const devHint = code => code && toast(t('common.devCode', { code }));

  /** Starts a countdown on a button, e.g. "Send a new code (45s)". */
  function cooldown(btn, seconds) {
    const base = btn.dataset.base || btn.textContent;
    btn.dataset.base = base;
    btn.disabled = true;
    let left = seconds;
    const tick = () => {
      if (left <= 0) { btn.disabled = false; btn.textContent = base; return; }
      btn.textContent = t('common.seconds', { label: base, s: left-- });
      setTimeout(tick, 1000);
    };
    tick();
  }

  /* ---------- Log in ---------- */
  if (page === 'login') {
    getMe().then(me => { if (me) location.replace(safeNext()); });
    const form = $('#loginForm'), msg = $('#formMsg');
    if (param('next')) $('#toRegister').href = `register.html?next=${encodeURIComponent(param('next'))}`;

    form.addEventListener('submit', async e => {
      e.preventDefault();
      showMsg(msg, '');
      showFieldErrors(form);
      const btn = form.querySelector('[type=submit]');
      setBusy(btn, true, t('login.busy'));
      try {
        await api.login({ email: form.email.value, password: form.password.value, remember: form.remember.checked });
        location.assign(safeNext());
      } catch (err) {
        if (err.code === 'EMAIL_NOT_VERIFIED') {
          store.set(err.details?.email || form.email.value);
          devHint(err.details?.devCode);
          const next = param('next') ? `&next=${encodeURIComponent(param('next'))}` : '';
          setTimeout(() => location.assign(`verify.html?email=${encodeURIComponent(err.details?.email || form.email.value)}${next}`), err.details?.devCode ? 1200 : 0);
          return;
        }
        showFieldErrors(form, err.details instanceof Array ? err.details : []);
        showMsg(msg, err.message);
      } finally {
        setBusy(btn, false);
      }
    });
  }

  /* ---------- Register ---------- */
  if (page === 'register') {
    const form = $('#registerForm'), msg = $('#formMsg');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      showMsg(msg, '');
      showFieldErrors(form);
      if (form.password.value !== form.confirm.value) {
        showFieldErrors(form, [{ field: 'confirm', message: t('register.mismatch') }]);
        return;
      }
      const btn = form.querySelector('[type=submit]');
      setBusy(btn, true, t('register.busy'));
      try {
        const res = await api.register({ fullName: form.fullName.value, email: form.email.value, password: form.password.value });
        store.set(res.email);
        devHint(res.devCode);
        const next = param('next') ? `&next=${encodeURIComponent(param('next'))}` : '';
        setTimeout(() => location.assign(`verify.html?email=${encodeURIComponent(res.email)}${next}`), res.devCode ? 1200 : 0);
      } catch (err) {
        showFieldErrors(form, Array.isArray(err.details) ? err.details : []);
        if (err.code === 'EMAIL_TAKEN') {
          const link = (href, key) => Object.assign(document.createElement('a'), { className: 'link', href, textContent: t(key) });
          msg.hidden = false;
          msg.className = 'form-msg error';
          msg.replaceChildren(I18N.tNodes('register.taken', { login: link('login.html', 'register.takenLogin'), reset: link('forgot.html', 'register.takenReset') }));
        } else showMsg(msg, err.message);
        setBusy(btn, false);
      }
    });
  }

  /* ---------- Verify email ---------- */
  if (page === 'verify') {
    const form = $('#verifyForm'), msg = $('#formMsg');
    const email = param('email') || store.get();
    if (email) {
      const pill = Object.assign(document.createElement('span'), { className: 'email-pill', textContent: email });
      $('#verifyIntro').replaceChildren(I18N.tNodes('verify.sub', { email: pill }));
      form.email.value = email;
    } else {
      $('#verifyIntro').textContent = t('verify.subNoEmail');
      $('#emailField').hidden = false;
    }

    // 6 boxes: auto-advance, backspace, paste a whole code
    const boxes = $$('#codeInputs input');
    boxes.forEach((b, i) => b.setAttribute('aria-label', t('verify.digit', { n: i + 1 })));
    const fill = digits => {
      digits.slice(0, 6).split('').forEach((d, i) => { boxes[i].value = d; });
      boxes[Math.min(digits.length, 5)].focus();
    };
    boxes.forEach((box, i) => {
      box.addEventListener('input', () => {
        const digits = box.value.replace(/\D/g, '');
        if (digits.length > 1) { fill(digits); }
        else { box.value = digits; if (digits && boxes[i + 1]) boxes[i + 1].focus(); }
        if (boxes.every(b => b.value)) form.requestSubmit();
      });
      box.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !box.value && boxes[i - 1]) { boxes[i - 1].focus(); boxes[i - 1].value = ''; }
        if (e.key === 'ArrowLeft' && boxes[i - 1]) boxes[i - 1].focus();
        if (e.key === 'ArrowRight' && boxes[i + 1]) boxes[i + 1].focus();
      });
      box.addEventListener('paste', e => {
        const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '');
        if (digits) { e.preventDefault(); fill(digits); if (digits.length >= 6) form.requestSubmit(); }
      });
    });
    boxes[0].focus();

    let submitting = false;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (submitting) return;
      const code = boxes.map(b => b.value).join('');
      const addr = form.email.value.trim();
      if (!addr) { showMsg(msg, t('verify.enterEmail')); $('#emailField').hidden = false; return; }
      if (code.length !== 6) { showMsg(msg, t('verify.enterDigits')); return; }
      submitting = true;
      const btn = form.querySelector('[type=submit]');
      setBusy(btn, true, t('verify.busy'));
      try {
        await api.verifyEmail({ email: addr, code });
        showMsg(msg, t('verify.success'), 'success');
        setTimeout(() => location.assign(safeNext()), 700);
      } catch (err) {
        if (err.code === 'ALREADY_VERIFIED') { location.assign('login.html'); return; }
        showMsg(msg, err.message);
        boxes.forEach(b => { b.value = ''; });
        boxes[0].focus();
        setBusy(btn, false);
      } finally {
        submitting = false;
      }
    });

    const resend = $('#resendBtn');
    resend.addEventListener('click', async () => {
      const addr = form.email.value.trim();
      if (!addr) { $('#emailField').hidden = false; form.email.focus(); return; }
      resend.disabled = true;
      try {
        const res = await api.resendCode(addr);
        showMsg(msg, t('verify.newSent'), 'success');
        devHint(res.devCode);
        cooldown(resend, 60);
      } catch (err) {
        showMsg(msg, err.message);
        if (err.details?.retryAfter) cooldown(resend, err.details.retryAfter);
        else resend.disabled = false;
      }
    });
    // A code was just sent by register/login: wait out the rest of the 60 s before allowing a resend
    const wait = Math.ceil(60 - store.secondsSinceSent());
    if (wait > 0) cooldown(resend, wait);
  }

  /* ---------- Forgot / reset password ---------- */
  if (page === 'forgot') {
    const forgot = $('#forgotForm'), reset = $('#resetForm');
    let email = '';

    const sendCode = async btn => {
      const res = await api.forgotPassword(email);
      devHint(res.devCode);
      return res;
    };

    forgot.addEventListener('submit', async e => {
      e.preventDefault();
      email = forgot.email.value.trim();
      showMsg($('#formMsg'), '');
      const btn = forgot.querySelector('[type=submit]');
      setBusy(btn, true, t('forgot.sending'));
      try {
        await sendCode();
        forgot.hidden = true;
        reset.hidden = false;
        const pill = Object.assign(document.createElement('span'), { className: 'email-pill', textContent: email });
        $('#forgotIntro').replaceChildren(I18N.tNodes('forgot.sent', { email: pill }));
        reset.code.focus();
        cooldown($('#resendReset'), 60);
      } catch (err) {
        showFieldErrors(forgot, Array.isArray(err.details) ? err.details : []);
        showMsg($('#formMsg'), err.message);
      } finally {
        setBusy(btn, false);
      }
    });

    reset.addEventListener('submit', async e => {
      e.preventDefault();
      showMsg($('#resetMsg'), '');
      showFieldErrors(reset);
      const btn = reset.querySelector('[type=submit]');
      setBusy(btn, true, t('forgot.saving'));
      try {
        await api.resetPassword({ email, code: reset.code.value.trim(), password: reset.password.value });
        showMsg($('#resetMsg'), t('forgot.done'), 'success');
        setTimeout(() => location.assign('account.html'), 800);
      } catch (err) {
        showFieldErrors(reset, Array.isArray(err.details) ? err.details : []);
        showMsg($('#resetMsg'), err.message);
        setBusy(btn, false);
      }
    });

    $('#resendReset').addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try { await sendCode(); showMsg($('#resetMsg'), t('forgot.newSent'), 'success'); cooldown(btn, 60); }
      catch (err) { showMsg($('#resetMsg'), err.message); btn.disabled = false; }
    });
  }
})();
