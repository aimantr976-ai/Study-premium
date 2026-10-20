(function () {
  'use strict';
  const state = { user: null, sites: [], plans: [], settings: {}, modal: null, notice: '', pendingSiteId: null };
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const inr = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((Number(paise) || 0) / 100);
  async function api(action, data = {}) {
    let response;
    try {
      response = await fetch('/api', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }) });
    } catch (_) { throw new Error('Cannot connect to the backend. Start Netlify CLI and configure your environment variables.'); }
    let result;
    try { result = await response.json(); } catch (_) { throw new Error('The server returned an unreadable response.'); }
    if (!response.ok || !result.ok) { const error = new Error(result.error || 'Request failed.'); error.code = result.code; error.status = response.status; throw error; }
    return result;
  }
  function ensureModal() {
    if ($('#spOverlay')) return;
    const overlay = document.createElement('div'); overlay.id = 'spOverlay'; overlay.className = 'sp-overlay'; overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<section class="sp-modal" role="dialog" aria-modal="true" aria-labelledby="spModalTitle"><div class="sp-modal-head"><div><h2 class="sp-modal-title" id="spModalTitle">Study Premium</h2><p class="sp-modal-subtitle" id="spModalSubtitle">Your learning access</p></div><button class="sp-close" type="button" aria-label="Close">×</button></div><div class="sp-modal-body" id="spModalBody"></div></section>';
    document.body.appendChild(overlay); state.modal = overlay;
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('.sp-close')) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  }
  function modal(title, subtitle, content, wide = false) {
    ensureModal(); const overlay = state.modal; const panel = $('.sp-modal', overlay);
    panel.classList.toggle('wide', wide); $('#spModalTitle', overlay).textContent = title; $('#spModalSubtitle', overlay).textContent = subtitle || '';
    $('#spModalBody', overlay).innerHTML = content; overlay.classList.add('open'); overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() { if (!state.modal) return; state.modal.classList.remove('open'); state.modal.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }
  function alertBox(text, type = 'error') { return `<div class="sp-alert ${type}">${escapeHtml(text)}</div>`; }
  function bindHeader() {
    const right = $('.header-right'); if (!right) return;
    const controls = document.createElement('div'); controls.className = 'sp-header-actions';
    controls.innerHTML = '<button class="sp-user-pill" id="spAccountButton" type="button">Sign in</button><a class="sp-admin-link" id="spAdminLink" href="/admin" style="display:none">Admin</a>';
    right.appendChild(controls);
    $('#spAccountButton').addEventListener('click', () => state.user ? showAccount() : showAuth('login'));
  }
  function makeArrow() { const span = document.createElement('span'); span.textContent = 'Open →'; span.className = 'primary-cta'; return span; }
  function renderPrimary(site) {
    const a = document.createElement('a'); a.href = '#'; a.className = 'primary-card'; a.dataset.siteId = site.id;
    if (site.section === 'primary' && site.accent === 'pink') a.classList.add('primary-card--pi');
    if (site.section === 'primary' && site.accent === 'cyan') a.classList.add('primary-card--eb');
    const badge = document.createElement('span'); badge.className = 'primary-badge'; badge.textContent = site.badge || (site.published ? 'Live' : 'Coming soon');
    const inner = document.createElement('span'); inner.className = 'card-inner';
    const logo = document.createElement('span'); logo.className = 'primary-logo'; logo.dataset.emoji = site.icon || '🌐';
    if (site.imageUrl) { const img = document.createElement('img'); img.src = site.imageUrl; img.alt = ''; img.loading = 'lazy'; logo.appendChild(img); }
    const info = document.createElement('span'); info.className = 'primary-info';
    const title = document.createElement('span'); title.className = 'primary-name'; title.textContent = site.title;
    const url = document.createElement('span'); url.className = 'primary-url';
    if (site.hasDestinationUrl && site.requiresSubscription) url.textContent = 'Premium access required';
    else if (site.destinationUrl) { try { url.textContent = new URL(site.destinationUrl).hostname; } catch (_) { url.textContent = 'Destination configured'; } }
    else url.textContent = site.hasDestinationUrl ? 'Open site' : 'link coming soon';
    const desc = document.createElement('span'); desc.className = 'primary-desc'; desc.textContent = site.description || site.category || 'Premium batches and study resources.';
    const cta = makeArrow(); info.append(title, url, desc, cta); inner.append(logo, info); a.append(badge, inner); return a;
  }
  function renderPlatform(site) {
    const a = document.createElement('a'); a.href = '#'; a.className = 'platform-card'; a.dataset.siteId = site.id;
    const inner = document.createElement('div'); inner.className = 'card-inner';
    const logo = document.createElement('span'); logo.className = 'platform-logo ' + (/^t[2-9]$/.test(site.theme || '') ? site.theme : (site.section === 'mirror' ? 't2' : 't8')); logo.dataset.emoji = site.icon || '🌐';
    if (site.imageUrl) { const img = document.createElement('img'); img.src = site.imageUrl; img.alt = ''; img.loading = 'lazy'; logo.appendChild(img); }
    const info = document.createElement('span'); info.className = 'platform-info';
    const row = document.createElement('span'); row.className = 'platform-name-row'; const name = document.createElement('span'); name.className = 'platform-name'; name.textContent = site.title;
    const status = document.createElement('span'); status.className = 'platform-status live'; status.innerHTML = '<span class="dot"></span>' + (!site.hasDestinationUrl ? 'Setup needed' : site.requiresSubscription ? 'Premium' : 'Live'); row.append(name, status);
    const tags = document.createElement('span'); tags.className = 'card-tags';
    if (site.category) { const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = site.category; tags.appendChild(tag); }
    const label = document.createElement('span'); label.className = 'tag ' + (site.section === 'mirror' ? 'temp' : 'official'); label.textContent = site.section === 'mirror' ? (site.badge || 'Temporary') : (site.badge || 'Official'); tags.appendChild(label);
    const cta = document.createElement('span'); cta.className = 'platform-cta'; cta.textContent = 'Visit Site →'; info.append(row, tags, cta); inner.append(logo, info); a.append(inner); return a;
  }
  function renderSites(sites) {
    const groups = { primary: $('.primary-grid'), official: $('#officialGrid'), mirror: $('#siteGrid') };
    Object.values(groups).forEach(g => { if (g) g.replaceChildren(); });
    sites.forEach(site => { const group = groups[site.section] || groups.official; if (!group) return; group.appendChild(site.section === 'primary' ? renderPrimary(site) : renderPlatform(site)); });
    state.sites = sites;
  }
  function renderBatches(batches) {
    const section = $('#spBatchesSection'); const grid = $('#spBatchGrid');
    if (!section || !grid || !Array.isArray(batches) || !batches.length) return;
    grid.replaceChildren();
    batches.forEach(batch => {
      const a = document.createElement('a'); a.href = '#'; a.className = 'platform-card'; a.dataset.batchId = batch.id;
      const inner = document.createElement('div'); inner.className = 'card-inner';
      const logo = document.createElement('span'); logo.className = 'platform-logo t7'; logo.dataset.emoji = '📚';
      if (batch.imageUrl) { const img = document.createElement('img'); img.src = batch.imageUrl; img.alt = ''; img.loading = 'lazy'; logo.appendChild(img); }
      const info = document.createElement('span'); info.className = 'platform-info';
      const row = document.createElement('span'); row.className = 'platform-name-row'; const name = document.createElement('span'); name.className = 'platform-name'; name.textContent = batch.title;
      const status = document.createElement('span'); status.className = 'platform-status live'; status.innerHTML = '<span class="dot"></span>Batch'; row.append(name, status);
      const category = document.createElement('span'); category.className = 'card-tags'; if (batch.category) { const tag = document.createElement('span'); tag.className = 'tag official'; tag.textContent = batch.category; category.appendChild(tag); }
      const desc = document.createElement('span'); desc.className = 'sp-muted'; desc.textContent = batch.description || 'Protected Study Premium learning resource.';
      // Display batch price
      const priceEl = document.createElement('span');
      priceEl.className = 'sp-price';
      if (batch.pricePaise === 0) {
        priceEl.textContent = '';
      } else {
        priceEl.textContent = `₹${(batch.pricePaise / 100).toFixed(0)}`;
      }
      info.append(priceEl);
      const cta = document.createElement('span'); cta.className = 'platform-cta'; cta.textContent = 'Access batch →';
      info.append(row, category, desc, priceEl, cta); inner.append(logo, info); a.append(inner); grid.appendChild(a);
    });
    section.style.display = ''; section.classList.add('visible');
  }
  function addAnnounce(text) {
    let el = $('#spAnnouncement');
    if (!el) { el = document.createElement('div'); el.id = 'spAnnouncement'; el.className = 'sp-announcement'; const main = $('main'); if (main) main.prepend(el); }
    el.textContent = text || ''; el.classList.toggle('show', !!text);
  }
  async function loadBootstrap() {
    try {
      const result = await api('public/bootstrap');
      state.settings = result.settings || {}; state.plans = result.plans || [];
      renderSites(Array.isArray(result.sites) ? result.sites : []);
      renderBatches(result.batches || []);
      if (state.settings.siteTitle) document.title = state.settings.siteTitle + ' · Official Sites';
      if (state.settings.logoUrl) $$( '[data-logo]' ).forEach(img => { img.src = state.settings.logoUrl; img.style.display = ''; });
      if (state.settings.faviconUrl) { let icon = $('link[rel="icon"]'); if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon); } icon.href = state.settings.faviconUrl; }
      if (state.settings.footerText) { const footer = $('.footer-credits span'); if (footer) footer.textContent = state.settings.footerText; }
      if (state.settings.whatsappUrl || state.settings.telegramUrl) { let links = $('#spFooterLinks'); if (!links) { links = document.createElement('div'); links.id = 'spFooterLinks'; links.className = 'sp-footer-links'; const credit = $('.footer-credits'); if (credit) credit.parentNode.insertBefore(links, credit); } links.replaceChildren(); [['WhatsApp',state.settings.whatsappUrl],['Telegram',state.settings.telegramUrl]].filter(x=>x[1]).forEach(x=>{ if (!/^https:\/\//i.test(x[1])) return; const a=document.createElement('a'); a.href=x[1]; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent=x[0]; links.appendChild(a); }); }
      addAnnounce(state.settings.maintenance ? 'Study Premium is under maintenance. Protected access and checkout are temporarily paused.' : (state.settings.announcement || ''));
      const chip = $('.status-chip'); if (chip) { chip.classList.remove('maintenance'); chip.classList.add(state.settings.maintenance ? 'maintenance' : 'online'); chip.innerHTML = `<span class="dot"></span>${state.settings.maintenance ? 'Under Maintenance' : 'Study Premium Online'}`; }
    } catch (error) {
      console.warn('[Study Premium] Backend is not connected yet:', error.message);
    }
  }
  async function loadUser() {
    try { const result = await api('auth/me'); state.user = result.user || null; }
    catch (_) { state.user = null; }
    updateHeader();
  }
  function updateHeader() {
    const button = $('#spAccountButton'); const admin = $('#spAdminLink');
    if (button) button.textContent = state.user ? (state.user.name.split(' ')[0] + ' · Account') : 'Sign in / Sign up';
    if (admin) admin.style.display = state.user?.role === 'admin' ? 'inline-flex' : 'none';
  }
  function showAuth(mode = 'login', message = '', after = null) {
    const isSignup = mode === 'signup';
    modal(isSignup ? 'Create your account' : 'Welcome back', 'Use your Study Premium account to continue.', `${message ? alertBox(message) : ''}<form id="spAuthForm" class="sp-form" novalidate>
      ${isSignup ? '<div class="sp-field"><label for="spName">Full name</label><input id="spName" name="name" autocomplete="name" required maxlength="80" placeholder="Your full name"></div>' : ''}
      ${isSignup ? '<div class="sp-field"><label for="spEmail">Gmail / Email address</label><input id="spEmail" name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div>' : '<div class="sp-field"><label for="spIdentifier">Email or mobile number</label><input id="spIdentifier" name="identifier" autocomplete="username" required placeholder="Email or mobile number"></div>'}
      ${isSignup ? '<div class="sp-field"><label for="spMobile">Mobile number</label><input id="spMobile" name="mobile" type="tel" inputmode="tel" autocomplete="tel" required placeholder="10-digit mobile number"></div>' : ''}
      <div class="sp-field"><label for="spPassword">Password</label><input id="spPassword" name="password" type="password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" required minlength="8" maxlength="72" placeholder="At least 8 characters"></div>
      ${isSignup ? '<p class="sp-muted">By creating an account, you agree to use the site responsibly. Do not enter your Gmail password here.</p>' : ''}
      <button class="sp-btn" type="submit">${isSignup ? 'Create account' : 'Sign in'}</button>
    </form><p class="sp-muted" style="margin-top:14px">${isSignup ? 'Already have an account?' : 'New to Study Premium?'} <button type="button" class="sp-link" id="spSwitchAuth">${isSignup ? 'Sign in' : 'Create an account'}</button></p>`, false);
    $('#spSwitchAuth').addEventListener('click', () => showAuth(isSignup ? 'login' : 'signup'));
    $('#spAuthForm').addEventListener('submit', async e => {
      e.preventDefault(); const btn = $('button[type="submit"]', e.currentTarget); btn.disabled = true; btn.textContent = 'Please wait…';
      try {
        const form = new FormData(e.currentTarget); const payload = Object.fromEntries(form.entries());
        const result = await api(isSignup ? 'auth/signup' : 'auth/login', payload); state.user = result.user; updateHeader();
        if (after) { await after(); return; }
        await showAccount('Account ready');
      } catch (error) { showAuth(mode, error.message, after); }
      finally { const b = $('#spAuthForm button[type="submit"]'); if (b) { b.disabled = false; b.textContent = isSignup ? 'Create account' : 'Sign in'; } }
    });
  }
  async function showPlans(message = '') {
    if (!state.user) { showAuth('login', 'Sign in before choosing a plan.', () => showPlans()); return; }
    if (!state.plans.length) { try { state.plans = (await api('public/plans')).plans || []; } catch (error) { modal('Plans unavailable', 'Backend setup required', alertBox(error.message)); return; } }
    const plans = state.plans.filter(p => p.published !== false);
    if (!plans.length) { modal('Subscription plans', 'Plans will appear here after the administrator publishes them.', `${message ? alertBox(message) : ''}<div class="sp-empty">No plans are currently available. Please check again later.</div>`); return; }
    const cards = plans.map(p => `<article class="sp-plan"><h3>${escapeHtml(p.name)}</h3><div class="sp-price">${inr(p.pricePaise)}</div><p class="sp-muted">${escapeHtml(p.description || 'Access to selected Study Premium resources.')}</p><span class="sp-status">${Number(p.durationDays)} days</span><button type="button" class="sp-btn" data-plan-id="${escapeHtml(p.id)}">Choose plan</button></article>`).join('');
    modal('Choose your plan', 'Check price, duration and access rules before paying.', `${message ? alertBox(message) : ''}<div class="sp-plan-grid">${cards}</div><p class="sp-muted" style="margin-top:14px">Payment claims are manually verified. Subscriptions remain locked until approval.</p>`, true);
    $$('[data-plan-id]').forEach(button => button.addEventListener('click', () => createOrder(button.dataset.planId)));
  }
  async function createOrder(planId) {
    modal('Preparing payment', 'Creating a secure order…', '<div class="sp-loading">Please wait…<div class="sp-progress"><i></i></div></div>');
    try {
      const result = await api('payment/create', { planId });
      state.currentOrder = result.order;
      const img = result.qrUrl ? `<img class="sp-qr" src="${escapeHtml(result.qrUrl)}" alt="Payment QR code">` : alertBox('Payment QR is not configured by the admin yet.');
      modal('Complete payment', `Order ${result.order.orderId}`, `${img}<div class="sp-kv"><div class="sp-kv-card"><span>Pay exactly</span><strong>${inr(result.order.amountPaise)}</strong></div><div class="sp-kv-card"><span>Recipient</span><strong>${escapeHtml(result.recipient || 'As shown in QR')}</strong></div></div><p class="sp-muted" style="margin:14px 0">${escapeHtml(result.instructions || 'Pay the exact amount. Then enter your UTR below.')}</p><form id="spPaymentForm" class="sp-form"><div class="sp-field"><label for="spUtr">UTR / transaction reference</label><input id="spUtr" name="utr" required minlength="6" maxlength="64" pattern="[A-Za-z0-9-]{6,64}" placeholder="Enter your payment reference"></div><div class="sp-field"><label for="spPayScreenshot">Payment screenshot (optional)</label><input id="spPayScreenshot" type="file" accept="image/jpeg,image/png,image/webp,image/gif"><span class="sp-small">Image only, max 5 MB. This is supporting information, not automatic payment proof.</span></div><div id="spUploadStatus" class="sp-muted"></div><button class="sp-btn" type="submit">Submit for admin approval</button><button class="sp-btn secondary" id="spBackPlans" type="button">Back to plans</button></form>`);
      $('#spBackPlans').addEventListener('click', () => showPlans());
      $('#spPaymentForm').addEventListener('submit', submitPaymentClaim);
    } catch (error) { modal('Payment setup needed', 'Order could not be created', `${alertBox(error.message)}<button class="sp-btn" id="spReturnPlans">Back to plans</button>`); $('#spReturnPlans').addEventListener('click', () => showPlans()); }
  }
  function uploadCloudinary(file, mode, progressSelector) {
    return new Promise(async (resolve, reject) => {
      if (!file) return resolve('');
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return reject(new Error('Choose JPG, PNG, WebP, or GIF.'));
      if (file.size > 5 * 1024 * 1024) return reject(new Error('Image must be 5 MB or smaller.'));
      let sign; try { sign = await api('media/signature', { mode }); } catch (e) { reject(e); return; }
      const data = new FormData(); data.append('file', file); data.append('api_key', sign.apiKey); data.append('timestamp', String(sign.timestamp)); data.append('public_id', sign.public_id); data.append('type', sign.type); data.append('allowed_formats', sign.allowed_formats);  data.append('signature', sign.signature);
      const xhr = new XMLHttpRequest(); xhr.open('POST', `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`);
      xhr.upload.onprogress = event => { const el = progressSelector ? $(progressSelector) : null; if (el && event.lengthComputable) el.textContent = `Uploading ${Math.round(event.loaded / event.total * 100)}%`; };
      xhr.onload = () => { try { const res = JSON.parse(xhr.responseText); if (xhr.status >= 200 && xhr.status < 300 && res.public_id) resolve({ publicId: res.public_id, format: res.format || 'jpg' }); else reject(new Error(res.error?.message || 'Image upload failed.')); } catch (_) { reject(new Error('Image upload failed.')); } };
      xhr.onerror = () => reject(new Error('Network error while uploading image.')); xhr.send(data);
    });
  }
  async function submitPaymentClaim(event) {
    event.preventDefault(); const button = $('button[type="submit"]', event.currentTarget); button.disabled = true; button.textContent = 'Submitting…';
    try {
      let screenshot = null; const file = $('#spPayScreenshot').files[0];
      if (file) screenshot = await uploadCloudinary(file, 'payment', '#spUploadStatus');
      await api('payment/claim', { orderId: state.currentOrder.orderId, utr: $('#spUtr').value, screenshotPublicId: screenshot?.publicId || '', screenshotFormat: screenshot?.format || '' });
      modal('Payment submitted', 'Your batch is still locked while the payment is verified.', `${alertBox('Payment claim sent. Wait for manual admin approval before expecting access.', 'success')}<div class="sp-kv"><div class="sp-kv-card"><span>Order ID</span><strong>${escapeHtml(state.currentOrder.orderId)}</strong></div><div class="sp-kv-card"><span>Status</span><strong><span class="sp-status pending">Pending</span></strong></div></div><button class="sp-btn" style="width:100%;margin-top:15px" id="spPaymentDone">View my account</button>`);
      $('#spPaymentDone').addEventListener('click', () => showAccount());
    } catch (error) { const message = error.message; showPlans(message); }
    finally { const b = $('#spPaymentForm button[type="submit"]'); if (b) { b.disabled = false; b.textContent = 'Submit for admin approval'; } }
  }
  async function tryOpenSite(siteId) {
    if (!state.user) { state.pendingSiteId = siteId; showAuth('login', 'Sign in to open this resource.', async () => { const pending = state.pendingSiteId; state.pendingSiteId = null; await tryOpenSite(pending); }); return; }
    try { const result = await api('site/open', { siteId }); window.location.assign(result.destinationUrl); }
    catch (error) { if (error.code === 'PLAN_REQUIRED') { await showPlans('This resource needs an approved active subscription.'); return; } modal('Unable to open site', 'Access check was not successful.', `${alertBox(error.message)}<button type="button" id="spTryPlans" class="sp-btn">View plans</button>`); $('#spTryPlans').addEventListener('click', () => showPlans()); }
  }
  async function tryOpenBatch(batchId) {
    if (!state.user) { showAuth('login', 'Sign in to open this batch.', async () => { await tryOpenBatch(batchId); }); return; }
    try { const result = await api('batch/open', { batchId }); window.location.assign(result.destinationUrl); }
    catch (error) { if (error.code === 'PLAN_REQUIRED') { await showPlans('This batch is not included in an approved active subscription.'); return; } modal('Unable to open batch', 'Access check was not successful.', `${alertBox(error.message)}<button type="button" id="spTryBatchPlans" class="sp-btn">View plans</button>`); $('#spTryBatchPlans').addEventListener('click', () => showPlans()); }
  }
  async function showAccount(message = '') {
    if (!state.user) { showAuth('login'); return; }
    modal('Your Study Premium account', message || `Signed in as ${state.user.name}`, '<div class="sp-loading">Loading your account…</div>');
    try {
      const result = await api('user/account'); state.user = result.user; updateHeader();
      const subs = result.subscriptions || []; const pays = result.payments || []; const notifications = result.notifications || [];
      const subHtml = subs.length ? subs.map(s => `<div class="sp-list-row"><div><strong>${escapeHtml(s.planName)}</strong><div class="sp-muted">Expires: ${new Date(s.expiresAt).toLocaleString()}</div></div><span class="sp-status ${new Date(s.expiresAt) > new Date() ? 'active' : 'expired'}">${new Date(s.expiresAt) > new Date() ? 'Active' : 'Expired'}</span></div>`).join('') : '<div class="sp-empty">No subscriptions yet.</div>';
      const payHtml = pays.length ? pays.map(p => `<div class="sp-list-row"><div><strong>${escapeHtml(p.planName)} · ${inr(p.amountPaise)}</strong><div class="sp-muted">${escapeHtml(p.orderId)} · ${new Date(p.createdAt).toLocaleString()}</div>${p.rejectionReason ? `<div class="sp-muted">Reason: ${escapeHtml(p.rejectionReason)}</div>` : ''}</div><span class="sp-status ${escapeHtml(p.status)}">${escapeHtml(p.status.replace('_', ' '))}</span></div>`).join('') : '<div class="sp-empty">No payment records yet.</div>';
      const notHtml = notifications.length ? notifications.map(n => `<div class="sp-list-row"><div><strong>${escapeHtml(n.title)}</strong><div class="sp-muted">${escapeHtml(n.message)}</div></div></div>`).join('') : '';
      modal('Your Study Premium account', `${state.user.name} · ${state.user.email}`, `${message ? alertBox(message, 'success') : ''}<div class="sp-kv"><div class="sp-kv-card"><span>Account</span><strong>${escapeHtml(state.user.status)}</strong></div><div class="sp-kv-card"><span>Mobile</span><strong>${escapeHtml(state.user.mobile)}</strong></div></div><div style="display:flex;gap:9px;flex-wrap:wrap;margin:15px 0"><button class="sp-btn" id="spRenew">Browse plans / renew</button><button class="sp-btn secondary" id="spLogout">Sign out</button></div><h3 style="font:750 14px Sora;margin:20px 0 10px">Subscriptions</h3><div class="sp-list">${subHtml}</div><h3 style="font:750 14px Sora;margin:20px 0 10px">Payments</h3><div class="sp-list">${payHtml}</div>${notHtml ? `<h3 style="font:750 14px Sora;margin:20px 0 10px">Notifications</h3><div class="sp-list">${notHtml}</div>` : ''}`, true);
      $('#spRenew').addEventListener('click', () => showPlans());
      $('#spLogout').addEventListener('click', async () => { try { await api('auth/logout'); } catch (_) {} state.user = null; updateHeader(); closeModal(); });
    } catch (error) { modal('Account unavailable', 'Could not load account details.', alertBox(error.message)); }
  }
  document.addEventListener('click', event => {
    const card = event.target.closest('a.primary-card,a.platform-card');
    if (card) { event.preventDefault(); event.stopPropagation(); if (card.dataset.siteId) tryOpenSite(card.dataset.siteId); else if (card.dataset.batchId) tryOpenBatch(card.dataset.batchId); else modal('Resource not connected', 'Backend setup needed', alertBox('Configure MongoDB Atlas, then run npm run seed:demo and add real site destination URLs in the admin panel.')); return; }
    const explore = event.target.closest('a.btn[href="javascript:void(0)"]');
    if (explore && !card) { event.preventDefault(); const section = $('.primary-grid'); if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });
  bindHeader();
  loadBootstrap().then(() => { const q = new URLSearchParams(location.search); if (q.get('login') === '1') showAuth('login'); });
  loadUser();

  // Anti-tampering protections as requested
  (function() {
    'use strict';

    // Block context menu (right-click)
    document.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      return false;
    }, false);

    // Block keyboard shortcuts for DevTools and view source
    document.addEventListener('keydown', function(e) {
      // Block F12
      if (e.key === 'F12') {
        e.preventDefault();
        return false;
      }

      // Block Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
      if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key)) {
        e.preventDefault();
        return false;
      }

      // Block Ctrl+U (View source)
      if (e.ctrlKey && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        return false;
      }

      // Block Ctrl+S (Save page)
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        return false;
      }

      // Block Ctrl+P (Print)
      if (e.ctrlKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        return false;
      }

      // Block Ctrl+C and Ctrl+A (Copy and Select All)
      if (e.ctrlKey && ['c', 'a'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        return false;
      }
    }, false);

    // Block text selection
    document.addEventListener('selectstart', function(e) {
      e.preventDefault();
      return false;
    }, false);

    // Block copy, cut, paste
    document.addEventListener('copy', function(e) {
      e.preventDefault();
      return false;
    }, false);

    document.addEventListener('cut', function(e) {
      e.preventDefault();
      return false;
    }, false);

    document.addEventListener('paste', function(e) {
      e.preventDefault();
      return false;
    }, false);

    // Block drag and drop
    document.addEventListener('dragstart', function(e) {
      e.preventDefault();
      return false;
    }, false);

    // DevTools detection - if DevTools open, show warning but don't break functionality
    // (Note: Completely blocking DevTools is impossible and harms user experience)
    function detectDevTools() {
      var devtools = {
        open: false,
        orientation: null
      };

      var threshold = 160;

      var emitEvent = function(state, orientation) {
        if (window.devtoolsCallback) {
          window.devtoolsCallback(state, orientation);
        }
      };

      setInterval(function() {
        var widthThreshold = window.outerWidth - window.innerWidth > threshold;
        var heightThreshold = window.outerHeight - window.innerHeight > threshold;
        var orientation = widthThreshold ? 'vertical' : 'horizontal';

        if (
          (heightThreshold && !widthThreshold) ||
          (widthThreshold && !heightThreshold)
        ) {
          if (!(devtools.open && devtools.orientation === orientation)) {
            emitEvent(true, orientation);
          }
          devtools.open = true;
          devtools.orientation = orientation;
        } else {
          if (devtools.open) {
            emitEvent(false, null);
          }
          devtools.open = false;
          devtools.orientation = null;
        }
      }, 500);

      // Override toString trick for console detection
      var element = new Image();
      Object.defineProperty(element, 'id', {
        get: function() {
          emitEvent(true, 'console');
        }
      });
      console.log(element);

      return devtools;
    }

    // Apply DevTools detection
    var devtools = detectDevTools();
    window.devtoolsCallback = function(isOpen, orientation) {
      if (isOpen) {
        // Show warning in console but don't break the page
        console.warn('DevTools detected. Please note that inspecting or tampering with this educational site may violate terms of use.');
        // Note: Actually blanking the page or redirecting would break functionality and frustrate legitimate users
        // For an educational site, it's better to warn than to break the experience
      }
    };

    // Additional notice in console
    console.info('Study Premium: This site contains educational content. ' +
                'Please respect the terms of use and do not tamper with the code.');
  })();
})();
