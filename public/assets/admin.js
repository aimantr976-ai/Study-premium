(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const state = { user: null, page: 'dashboard', rows: [], toastTimer: null };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = p => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((Number(p) || 0) / 100);
  const date = v => v ? new Date(v).toLocaleString() : '—';
  async function api(action, data = {}) {
    let res; try { res = await fetch('/api', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }) }); }
    catch (_) { throw new Error('Cannot reach backend. Run Netlify CLI and configure environment variables.'); }
    let result; try { result = await res.json(); } catch (_) { throw new Error('Server returned an unreadable response.'); }
    if (!res.ok || !result.ok) { const e = new Error(result.error || 'Request failed.'); e.code = result.code; throw e; }
    return result;
  }
  function toast(text, error = false) {
    const el = $('#adminToast'); el.textContent = text; el.classList.toggle('error', error); el.style.display = 'block';
    clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => { el.style.display = 'none'; }, 4200);
  }
  function showLogin(message = '') {
    $('#adminApp').style.display = 'none'; $('#adminLogin').style.display = 'block';
    $('#adminLoginMessage').innerHTML = message ? `<div class="sp-alert error">${esc(message)}</div>` : '';
  }
  function showApp() { $('#adminLogin').style.display = 'none'; $('#adminApp').style.display = 'grid'; }
  $('#adminLoginForm').addEventListener('submit', async e => {
    e.preventDefault(); const button = $('button[type="submit"]', e.currentTarget); button.disabled = true;
    try {
      const f = new FormData(e.currentTarget); const result = await api('auth/login', Object.fromEntries(f.entries()));
      if (result.user?.role !== 'admin') { await api('auth/logout'); showLogin('This account is not an administrator. Use the admin account created through the setup script.'); return; }
      state.user = result.user; showApp(); await loadPage('dashboard');
    } catch (error) { showLogin(error.message); }
    finally { button.disabled = false; }
  });
  $('#adminLogout').addEventListener('click', async () => { try { await api('auth/logout'); } catch (_) {} state.user = null; showLogin('You have signed out.'); });
  $('#adminNav').addEventListener('click', e => { const btn = e.target.closest('[data-page]'); if (!btn) return; loadPage(btn.dataset.page); });
  const meta = {
    dashboard: ['Dashboard', 'Website overview and recent activity.'], sites: ['Apps & Sites', 'Manage the primary, official and mirror cards shown on the homepage.'],
    batches: ['Courses & Batches', 'Manage batch resources and protected content destinations.'], plans: ['Subscription Plans', 'Set real prices, duration, visibility, and included resource IDs.'],
    payments: ['Payments & QR', 'Configure your QR and manually verify submitted payment claims.'], users: ['Users', 'Review accounts, account status, and active subscriptions.'],
    subscriptions: ['Subscriptions', 'Review access periods and expiry state.'], media: ['Media Library', 'Cloudinary-hosted images linked to sites and batches.'], analytics: ['Analytics & Reports', 'Verified payment totals, registrations and access metrics.'],
    notifications: ['Notifications', 'Recent user-facing and system notifications.'], audit: ['Audit Logs', 'A record of important administrator actions.'], settings: ['Website Settings', 'Brand, announcement, payment QR, instructions and maintenance settings.']
  };
  async function loadPage(page) {
    state.page = page; $$('#adminNav [data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    $('#adminPageTitle').textContent = meta[page]?.[0] || 'Admin'; $('#adminPageSubtitle').textContent = meta[page]?.[1] || '';
    $('#adminContent').innerHTML = '<div class="sp-loading">Loading…<div class="sp-progress"><i></i></div></div>';
    try {
      if (page === 'dashboard' || page === 'analytics') return await renderDashboard(page);
      if (page === 'sites') return await renderCrud('sites');
      if (page === 'batches') return await renderCrud('batches');
      if (page === 'plans') return await renderCrud('plans');
      if (page === 'payments') return await renderPayments();
      if (page === 'users') return await renderUsers();
      if (page === 'subscriptions') return await renderSubscriptions();
      if (page === 'settings') return await renderSettings();
      if (page === 'media') return await renderMedia();
      if (page === 'notifications') return await renderNotifications();
      if (page === 'audit') return await renderAudit();
    } catch (error) {
      $('#adminContent').innerHTML = `<div class="sp-alert error">${esc(error.message)}<p class="sp-muted">Confirm that MongoDB Atlas is configured and your administrator account has access.</p></div><button class="sp-btn secondary" id="adminRetry">Try again</button>`;
      $('#adminRetry').addEventListener('click', () => loadPage(page));
    }
  }
  function stat(label, value, detail = '') { return `<div class="admin-stat"><div class="label">${esc(label)}</div><div class="number">${esc(value)}</div><div class="detail">${esc(detail)}</div></div>`; }
  function table(headers, rows, empty = 'No records found.') {
    if (!rows.length) return `<div class="admin-empty">${esc(empty)}</div>`;
    return `<div class="sp-table-wrap"><table class="sp-table"><thead><tr>${headers.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  async function renderDashboard(page) {
    const r = await api('admin/dashboard'); const s = r.stats || {};
    let html = `<div class="admin-grid">${stat('Registered users', s.users ?? 0, 'All accounts')}${stat('Apps & sites', s.sites ?? 0, 'Content cards')}${stat('Batches', s.batches ?? 0, 'Learning resources')}${stat('Plans', s.plans ?? 0, 'Published and draft')}${stat('Pending payments', s.pendingPayments ?? 0, 'Manual review required')}${stat('Active subscriptions', s.activeSubs ?? 0, 'Not expired')}${stat('Expired subscriptions', s.expiredSubs ?? 0, 'Access denied after expiry')}${stat('Verified revenue', inr(s.verifiedRevenuePaise ?? 0), `${s.approvedCount ?? 0} approved payments only`)}</div>`;
    const users = (r.recentUsers || []).map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(date(u.createdAt))}</td><td><span class="admin-badge">${esc(u.role)}</span></td></tr>`);
    const payments = (r.recentPayments || []).map(p => `<tr><td>${esc(p.orderId)}</td><td>${esc(p.planName)}</td><td>${esc(inr(p.amountPaise))}</td><td><span class="sp-status ${esc(p.status)}">${esc(p.status)}</span></td><td>${esc(date(p.createdAt))}</td></tr>`);
    html += `<div class="admin-panel" style="margin-bottom:17px"><div class="admin-section-head"><h2>Recent registrations</h2><button class="sp-btn secondary" data-go="users">Manage users</button></div>${table(['Name','Email','Registered','Role'], users, 'No registered users yet.')}</div><div class="admin-panel"><div class="admin-section-head"><h2>Recent payment activity</h2><button class="sp-btn secondary" data-go="payments">Review payments</button></div>${table(['Order','Plan','Amount','Status','Created'], payments, 'No payment records yet.')}</div>`;
    if (page === 'analytics') html += `<div class="admin-panel" style="margin-top:17px"><h2>Reporting notes</h2><p class="sp-muted">Revenue is calculated only from payment records marked approved after manual transaction verification. Export payment history from Payments and use date filters in your records workflow. Subscription expiry is checked on protected backend requests.</p><button class="sp-btn secondary" data-go="payments">Open payment report</button></div>`;
    $('#adminContent').innerHTML = html;
    $$('[data-go]').forEach(b => b.addEventListener('click', () => loadPage(b.dataset.go)));
  }
  const definitions = {
    sites: { action: 'admin/sites', label: 'site', fields: [
      ['title','Title','text',true], ['description','Description','textarea'], ['category','Category/tag','text'], ['section','Homepage section','select',true,['primary','official','mirror']], ['icon','Emoji/icon','text'], ['badge','Badge label','text'], ['accent','Primary card accent','select',false,['blue','cyan','pink']], ['theme','Official/mirror icon theme','select',false,['t2','t3','t4','t5','t6','t7','t8','t9']], ['destinationUrl','Destination URL','url'], ['imageUrl','Image URL (Cloudinary)','url'], ['imageFile','Upload image','file'], ['requiresSubscription','Requires approved plan','checkbox'], ['published','Published','checkbox'], ['sortOrder','Display order','number']
    ], columns: ['title','id','section','category','destinationUrl','published'] },
    batches: { action: 'admin/batches', label: 'batch', fields: [
      ['title','Batch title','text',true], ['description','Description','textarea'], ['category','Category','text'], ['destinationUrl','Protected destination URL','url'], ['imageUrl','Thumbnail URL (Cloudinary)','url'], ['imageFile','Upload thumbnail','file'], ['published','Published','checkbox'], ['sortOrder','Display order','number']
    ], columns: ['title','id','category','destinationUrl','published'] },
    plans: { action: 'admin/plans', label: 'plan', fields: [
      ['name','Plan name','text',true], ['description','Plan description','textarea'], ['priceInr','Price in INR','number',true], ['durationDays','Duration (days)','number',true], ['includedSiteIds','Included site IDs (comma-separated)','textarea'], ['includedBatchIds','Included batch IDs (comma-separated)','textarea'], ['published','Published for users','checkbox'], ['sortOrder','Display order','number']
    ], columns: ['name','pricePaise','durationDays','published'] }
  };
  function normalizeItem(type, item = {}) {
    const out = { ...item };
    if (type === 'plans') { out.priceInr = (Number(item.pricePaise || 0) / 100).toFixed(2); out.includedSiteIds = (item.includedSiteIds || []).join(', '); out.includedBatchIds = (item.includedBatchIds || []).join(', '); }
    if (type === 'sites') out.includedSiteIds = (item.includedSiteIds || []).join(', ');
    return out;
  }
  async function renderCrud(type) {
    const def = definitions[type]; const result = await api(`${def.action}/list`); state.rows = result.items || [];
    const columns = def.columns; const rows = state.rows.map(item => `<tr>${columns.map(key => {
      let value = item[key]; if (key === 'pricePaise') value = inr(value); if (key === 'published' || key === 'requiresSubscription') value = value ? 'Yes' : 'No'; if (key === 'destinationUrl' && value) value = String(value).slice(0, 75); if (key === 'id') return `<td><code title="${esc(value)}">${esc(String(value || '').slice(0, 12))}…</code> <button class="sp-link" data-copy-id="${esc(value)}" type="button">Copy ID</button></td>`; return `<td>${key === 'published' ? `<span class="sp-status ${value === 'Yes' ? 'active' : 'pending'}">${esc(value)}</span>` : esc(value ?? '—')}</td>`;
    }).join('')}<td><div class="admin-toolbar"><button class="sp-btn secondary" data-edit="${esc(item.id)}">Edit</button><button class="sp-btn danger" data-delete="${esc(item.id)}">Delete</button></div></td></tr>`);
    $('#adminContent').innerHTML = `<div class="admin-panel"><div class="admin-section-head"><div><h2>${esc(meta[type === 'sites' ? 'sites' : type][0])}</h2><p class="sp-muted">Manage records stored in MongoDB Atlas.</p></div><div class="admin-toolbar"><button class="sp-btn secondary" id="spExportCsv">Export CSV</button><button class="sp-btn" id="spAddRecord">+ Add ${esc(def.label)}</button></div></div>${table([...columns.map(k => k === 'pricePaise' ? 'Price' : k), 'Actions'], rows, 'No records yet. Use Add to create your first record.')}</div>`;
    $('#spAddRecord').addEventListener('click', () => openForm(type, {}));
    $('#spExportCsv').addEventListener('click', () => exportCsv(type, state.rows));
    $$('[data-copy-id]').forEach(b => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.copyId); toast('Record ID copied.'); } catch (_) { toast(b.dataset.copyId); } }));
    $$('[data-edit]').forEach(b => b.addEventListener('click', () => openForm(type, state.rows.find(x => x.id === b.dataset.edit) || {})));
    $$('[data-delete]').forEach(b => b.addEventListener('click', () => deleteRecord(type, b.dataset.delete)));
  }
  function fieldHtml(field, value) {
    const [name, label, type = 'text', required = false, options = []] = field; const id = `adm_${name}`;
    if (type === 'checkbox') return `<label class="sp-checkbox admin-check"><input id="${id}" name="${name}" type="checkbox" ${value !== false ? 'checked' : ''}><span>${esc(label)}</span></label>`;
    if (type === 'textarea') return `<div class="sp-field ${name.toLowerCase().includes('included') ? 'full' : ''}"><label for="${id}">${esc(label)}</label><textarea id="${id}" name="${name}" ${required ? 'required' : ''} placeholder="${name.includes('Ids') ? 'Paste record IDs separated by commas' : ''}">${esc(value ?? '')}</textarea></div>`;
    if (type === 'select') return `<div class="sp-field"><label for="${id}">${esc(label)}</label><select id="${id}" name="${name}" ${required ? 'required' : ''}>${options.map(opt => `<option value="${esc(opt)}" ${String(value || options[0]) === opt ? 'selected' : ''}>${esc(opt)}</option>`).join('')}</select></div>`;
    if (type === 'file') return `<div class="sp-field full"><label for="${id}">${esc(label)}</label><input id="${id}" name="${name}" type="file" accept="image/jpeg,image/png,image/webp,image/gif"><span class="sp-small" id="${id}_status">Upload through Cloudinary; the URL field is filled automatically.</span></div>`;
    const inputType = type === 'url' ? 'url' : type === 'number' ? 'number' : 'text'; const step = name === 'priceInr' ? '0.01' : '1';
    return `<div class="sp-field"><label for="${id}">${esc(label)}</label><input id="${id}" name="${name}" type="${inputType}" value="${esc(value ?? '')}" ${required ? 'required' : ''} ${inputType === 'number' ? `min="0" step="${step}"` : ''} maxlength="${inputType === 'url' ? '2048' : '1000'}"></div>`;
  }
  function openForm(type, rawItem) {
    const def = definitions[type]; const item = normalizeItem(type, rawItem); const fields = def.fields.map(f => fieldHtml(f, item[f[0]])).join('');
    const title = (item.id ? 'Edit ' : 'Add ') + def.label;
    const overlay = document.createElement('div'); overlay.className = 'sp-overlay open'; overlay.style.zIndex = '5100';
    overlay.innerHTML = `<section class="sp-modal" role="dialog" aria-modal="true"><div class="sp-modal-head"><div><h2 class="sp-modal-title">${esc(title)}</h2><p class="sp-modal-subtitle">Changes are saved on the backend.</p></div><button class="sp-close" type="button">×</button></div><div class="sp-modal-body"><form id="spCrudForm" class="sp-form"><div class="admin-form-grid">${fields}</div><div id="spCrudError"></div><div class="admin-form-actions"><button class="sp-btn" type="submit">Save ${esc(def.label)}</button><button class="sp-btn secondary" type="button" id="spCancelCrud">Cancel</button></div><p class="sp-small">${type === 'plans' ? 'Included site/batch fields require MongoDB IDs. Unpublished plans are hidden from users.' : type === 'sites' ? 'A blank destination URL is allowed while you configure the card. Published resources still require a valid configured URL before opening.' : 'Protected batch links are checked on the backend.'}</p></form></div></section>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove(); $('.sp-close', overlay).addEventListener('click', close); $('#spCancelCrud', overlay).addEventListener('click', close); overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    def.fields.filter(f => f[2] === 'file').forEach(f => { const [key] = f; $(`#adm_${key}`, overlay).addEventListener('change', async e => {
      const file = e.target.files?.[0]; if (!file) return; const dest = type === 'sites' || type === 'batches' ? $(`#adm_${key === 'imageFile' ? 'imageUrl' : 'imageUrl'}`, overlay) : null;
      try { $(`#adm_${key}_status`, overlay).textContent = 'Uploading…'; const url = await uploadImage(file, 'admin', text => { $(`#adm_${key}_status`, overlay).textContent = text; }); if (dest) dest.value = url; $(`#adm_${key}_status`, overlay).textContent = 'Upload complete.'; }
      catch (err) { $(`#adm_${key}_status`, overlay).textContent = err.message; }
    }); });
    $('#spCrudForm', overlay).addEventListener('submit', async e => {
      e.preventDefault(); const button = $('button[type="submit"]', e.currentTarget); button.disabled = true;
      try {
        const form = new FormData(e.currentTarget); const payload = { id: item.id || '' };
        def.fields.forEach(f => { const name = f[0], type = f[2]; if (type === 'checkbox') payload[name] = $(`[name="${name}"]`, e.currentTarget).checked; else if (type !== 'file') payload[name] = form.get(name) || ''; });
        await api(`${def.action}/save`, payload); close(); toast(`${def.label[0].toUpperCase() + def.label.slice(1)} saved.`); await loadPage(type);
      } catch (error) { $('#spCrudError', overlay).innerHTML = `<div class="sp-alert error">${esc(error.message)}</div>`; }
      finally { button.disabled = false; }
    });
  }
  async function deleteRecord(type, id) {
    if (!confirm(`Delete this ${definitions[type].label}? This cannot be undone.`)) return;
    try { await api(`${definitions[type].action}/delete`, { id }); toast('Record deleted.'); await loadPage(type); } catch (error) { toast(error.message, true); }
  }
  async function uploadImage(file, mode, updateText = () => {}) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Choose JPG, PNG, WebP or GIF.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Image must be 5 MB or smaller.');
    const sign = await api('media/signature', { mode }); const form = new FormData(); form.append('file', file); form.append('api_key', sign.apiKey); form.append('timestamp', String(sign.timestamp)); form.append('public_id', sign.public_id); form.append('type', sign.type); form.append('allowed_formats', sign.allowed_formats);  form.append('signature', sign.signature);
    return await new Promise((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open('POST', `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`); xhr.upload.onprogress = e => { if (e.lengthComputable) updateText(`Uploading ${Math.round(e.loaded / e.total * 100)}%`); }; xhr.onload = () => { try { const r = JSON.parse(xhr.responseText); if (xhr.status >= 200 && xhr.status < 300 && r.secure_url) resolve(r.secure_url); else reject(new Error(r.error?.message || 'Upload failed.')); } catch (_) { reject(new Error('Upload failed.')); } }; xhr.onerror = () => reject(new Error('Image upload network error.')); xhr.send(form); });
  }
  async function renderPayments() {
    const status = $('#adminPaymentFilter')?.value || 'all'; const result = await api('admin/payments/list', { status }); state.rows = result.items || [];
    const rows = state.rows.map(p => `<tr><td><strong>${esc(p.orderId)}</strong><div class="sp-small">${esc(date(p.submittedAt || p.createdAt))}</div></td><td>${esc(p.user?.name || 'Unknown')}<div class="sp-small">${esc(p.user?.email || '')}</div><div class="sp-small">${esc(p.user?.mobile || '')}</div></td><td>${esc(p.planName)}<div>${esc(inr(p.amountPaise))}</div></td><td>${p.utr ? esc(p.utr) : '—'}${p.screenshotUrl ? `<div><a href="${esc(p.screenshotUrl)}" target="_blank" rel="noopener">View screenshot ↗</a></div>` : ''}</td><td><span class="sp-status ${esc(p.status)}">${esc(p.status)}</span>${p.rejectionReason ? `<div class="sp-small">${esc(p.rejectionReason)}</div>` : ''}</td><td>${p.status === 'pending' ? `<div class="admin-toolbar"><button class="sp-btn" data-approve="${esc(p.id)}">Approve</button><button class="sp-btn danger" data-reject="${esc(p.id)}">Reject</button></div>` : '—'}</td></tr>`);
    $('#adminContent').innerHTML = `<div class="admin-panel"><div class="admin-section-head"><div><h2>Payment claims</h2><p class="sp-muted">Approve only after verifying the transaction in legitimate bank/payment-provider records.</p></div><div class="admin-toolbar"><select class="admin-filter" id="adminPaymentFilter"><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="awaiting_payment">Awaiting payment</option></select><button class="sp-btn secondary" id="spExportPayments">Export CSV</button><button class="sp-btn secondary" id="spQrSettings">QR settings</button></div></div>${table(['Order / date','User','Plan / amount','UTR / screenshot','Status','Review'], rows, 'No payment claims yet.')}</div>`;
    $('#adminPaymentFilter').value = status; $('#adminPaymentFilter').addEventListener('change', () => renderPayments()); $('#spExportPayments').addEventListener('click', () => exportCsv('payments', state.rows)); $('#spQrSettings').addEventListener('click', () => loadPage('settings'));
    $$('[data-approve]').forEach(b => b.addEventListener('click', () => reviewPayment(b.dataset.approve, 'approve'))); $$('[data-reject]').forEach(b => b.addEventListener('click', () => reviewPayment(b.dataset.reject, 'reject')));
  }
  async function reviewPayment(id, decision) {
    if (decision === 'approve') {
      if (!confirm('Confirm you verified the UTR/transaction in the bank or payment-provider records. This action activates the subscription and cannot be reversed here.')) return;
      try { await api('admin/payments/review', { id, decision, confirmVerified: true }); toast('Payment approved; subscription activated.'); await renderPayments(); }
      catch (error) { toast(error.message, true); }
    } else {
      const reason = prompt('Enter the reason for rejection (visible to the user):'); if (!reason || reason.trim().length < 3) return;
      try { await api('admin/payments/review', { id, decision, reason }); toast('Payment rejected.'); await renderPayments(); }
      catch (error) { toast(error.message, true); }
    }
  }
  async function renderUsers() {
    $('#adminContent').innerHTML = '<div class="admin-panel"><div class="admin-section-head"><div><h2>Registered users</h2><p class="sp-muted">No passwords or password hashes are shown.</p></div><input class="admin-filter" id="spUserSearch" placeholder="Search name, email, mobile"><button class="sp-btn secondary" id="spUserRefresh">Search</button><button class="sp-btn secondary" id="spUserExport">Export CSV</button></div><div id="spUserRows" class="sp-loading">Loading users…</div></div>';
    async function load(search = '') { const result = await api('admin/users/list', { search }); state.rows = result.items || []; $('#spUserRows').innerHTML = table(['User','Contact','Role','Status','Plan / expiry','Action'], state.rows.map(u => `<tr><td>${esc(u.name)}<div class="sp-small">${esc(date(u.createdAt))}</div></td><td>${esc(u.email)}<div class="sp-small">${esc(u.mobile)}</div></td><td>${esc(u.role)}</td><td><span class="sp-status ${esc(u.status)}">${esc(u.status)}</span></td><td>${esc(u.activePlan || '—')}<div class="sp-small">${esc(date(u.expiresAt))}</div></td><td>${u.role === 'admin' ? 'Admin account' : `<button class="sp-btn ${u.status === 'active' ? 'danger' : 'secondary'}" data-toggle-user="${esc(u.id)}" data-next-status="${u.status === 'active' ? 'suspended' : 'active'}">${u.status === 'active' ? 'Suspend' : 'Reactivate'}</button>`}</td></tr>`), 'No users found.'); $$('[data-toggle-user]').forEach(b => b.addEventListener('click', async () => { const reason = b.dataset.nextStatus === 'suspended' ? prompt('Reason for suspending this user:') : 'Reactivated by admin'; if (reason === null || (b.dataset.nextStatus === 'suspended' && reason.trim().length < 3)) return; try { await api('admin/users/status', { id: b.dataset.toggleUser, status: b.dataset.nextStatus, reason }); toast('User status updated.'); load($('#spUserSearch').value); } catch (e) { toast(e.message, true); } })); }
    $('#spUserRefresh').addEventListener('click', () => load($('#spUserSearch').value)); $('#spUserSearch').addEventListener('keydown', e => { if (e.key === 'Enter') load(e.target.value); }); $('#spUserExport').addEventListener('click', () => exportCsv('users', state.rows)); await load();
  }
  async function renderSubscriptions() {
    const result = await api('admin/subscriptions/list'); state.rows = result.items || [];
    const rows = state.rows.map(s => `<tr><td>${esc(s.user?.name || 'Unknown')}<div class="sp-small">${esc(s.user?.email || '')}</div></td><td>${esc(s.planName)}</td><td>${esc(inr(s.amountPaise))}</td><td>${esc(date(s.startsAt))}</td><td>${esc(date(s.expiresAt))}</td><td><span class="sp-status ${esc(s.status)}">${esc(s.status)}</span></td><td>${esc(s.orderId)}</td></tr>`);
    $('#adminContent').innerHTML = `<div class="admin-panel"><div class="admin-section-head"><div><h2>Subscriptions</h2><p class="sp-muted">Expired access is denied by the backend on every protected request.</p></div><button class="sp-btn secondary" id="spSubExport">Export CSV</button></div>${table(['User','Plan','Amount','Starts','Expires','Status','Order'], rows, 'No subscriptions yet.')}</div>`; $('#spSubExport').addEventListener('click', () => exportCsv('subscriptions', state.rows));
  }
  async function renderSettings() {
    const { settings } = await api('admin/settings/get');
    $('#adminContent').innerHTML = `<div class="admin-panel"><h2>Website & payment configuration</h2><p class="sp-muted" style="margin-bottom:17px">The existing homepage appearance remains in place. Update text and payment details here.</p><form id="spSettingsForm" class="sp-form"><div class="admin-form-grid"><div class="sp-field"><label for="setSiteTitle">Website title</label><input id="setSiteTitle" name="siteTitle" value="${esc(settings.siteTitle || 'Study Premium')}" required></div><div class="sp-field"><label for="setSupportEmail">Support email</label><input id="setSupportEmail" name="supportEmail" type="email" value="${esc(settings.supportEmail || '')}" placeholder="support@example.com"></div><div class="sp-field full"><label for="setAnnouncement">Homepage announcement</label><textarea id="setAnnouncement" name="announcement" maxlength="500">${esc(settings.announcement || '')}</textarea></div><div class="sp-field"><label for="setLogoUrl">Website logo URL</label><input id="setLogoUrl" name="logoUrl" type="url" value="${esc(settings.logoUrl || '')}" placeholder="Cloudinary secure URL"><input id="setLogoFile" style="margin-top:7px" type="file" accept="image/jpeg,image/png,image/webp"><span class="sp-small" id="setLogoUploadStatus">Optional logo upload.</span></div><div class="sp-field"><label for="setFaviconUrl">Favicon URL</label><input id="setFaviconUrl" name="faviconUrl" type="url" value="${esc(settings.faviconUrl || '')}" placeholder="Cloudinary secure URL"><input id="setFaviconFile" style="margin-top:7px" type="file" accept="image/jpeg,image/png,image/webp"><span class="sp-small" id="setFaviconUploadStatus">Optional favicon upload.</span></div><div class="sp-field full"><label for="setFooterText">Footer text</label><input id="setFooterText" name="footerText" value="${esc(settings.footerText || '')}" maxlength="300" placeholder="© Study Premium. All rights reserved."></div><div class="sp-field"><label for="setWhatsappUrl">WhatsApp link</label><input id="setWhatsappUrl" name="whatsappUrl" type="url" value="${esc(settings.whatsappUrl || '')}" placeholder="https://chat.whatsapp.com/..."></div><div class="sp-field"><label for="setTelegramUrl">Telegram link</label><input id="setTelegramUrl" name="telegramUrl" type="url" value="${esc(settings.telegramUrl || '')}" placeholder="https://t.me/..."></div><div class="sp-field"><label for="setQrUrl">Payment QR image URL (Cloudinary)</label><input id="setQrUrl" name="paymentQrUrl" type="url" value="${esc(settings.paymentQrUrl || '')}" placeholder="https://res.cloudinary.com/..."><input id="setQrFile" style="margin-top:7px" type="file" accept="image/jpeg,image/png,image/webp"><span class="sp-small" id="setQrUploadStatus">Upload a QR image or paste its secure URL.</span></div><div class="sp-field"><label for="setRecipient">Payment recipient display name</label><input id="setRecipient" name="paymentRecipient" value="${esc(settings.paymentRecipient || '')}" maxlength="120"></div><div class="sp-field full"><label for="setInstructions">Payment instructions</label><textarea id="setInstructions" name="paymentInstructions" maxlength="700">${esc(settings.paymentInstructions || '')}</textarea></div><div class="full"><label class="sp-checkbox"><input name="maintenance" type="checkbox" ${settings.maintenance ? 'checked' : ''}> <span>Maintenance mode (display announcement / restrict website as configured)</span></label></div></div><div id="spSettingsError"></div><div class="admin-form-actions"><button class="sp-btn" type="submit">Save settings</button></div></form></div>`;
    for (const [inputId, urlId, statusId] of [['setLogoFile','setLogoUrl','setLogoUploadStatus'],['setFaviconFile','setFaviconUrl','setFaviconUploadStatus'],['setQrFile','setQrUrl','setQrUploadStatus']]) {
      $(`#${inputId}`).addEventListener('change', async e => { const file = e.target.files?.[0]; if (!file) return; try { $(`#${statusId}`).textContent = 'Uploading…'; const url = await uploadImage(file, 'admin', text => { $(`#${statusId}`).textContent = text; }); $(`#${urlId}`).value = url; $(`#${statusId}`).textContent = 'Upload complete.'; } catch (error) { $(`#${statusId}`).textContent = error.message; } });
    }
    $('#spSettingsForm').addEventListener('submit', async e => { e.preventDefault(); const f = new FormData(e.currentTarget); const data = Object.fromEntries(f.entries()); data.maintenance = $('input[name="maintenance"]', e.currentTarget).checked; try { await api('admin/settings/save', data); toast('Settings saved.'); await loadPage('settings'); } catch (error) { $('#spSettingsError').innerHTML = `<div class="sp-alert error">${esc(error.message)}</div>`; } });
  }
  async function renderMedia() {
    const result = await api('admin/media/list'); state.rows = result.items || [];
    const items = state.rows.filter(i => i.imageUrl).map(i => `<div class="sp-plan"><img src="${esc(i.imageUrl)}" alt="" style="width:100%;height:130px;object-fit:contain;background:#0a0715;border-radius:10px"><strong>${esc(i.title)}</strong><span class="sp-small">${esc(date(i.updatedAt))}</span><a href="${esc(i.imageUrl)}" target="_blank" rel="noopener">Open image ↗</a></div>`).join('');
    $('#adminContent').innerHTML = `<div class="admin-panel"><div class="admin-section-head"><div><h2>Media library</h2><p class="sp-muted">Images stored in Cloudinary and referenced by site/batch records.</p></div><button class="sp-btn secondary" id="spMediaRefresh">Refresh</button></div>${items ? `<div class="sp-plan-grid">${items}</div>` : '<div class="admin-empty">No linked Cloudinary images yet. Upload images while editing a site/batch or setting the QR.</div>'}</div>`; $('#spMediaRefresh').addEventListener('click', () => loadPage('media'));
  }
  async function renderNotifications() {
    const result = await api('admin/notifications/list'); state.rows = result.items || [];
    $('#adminContent').innerHTML = `<div class="admin-panel"><div class="admin-section-head"><div><h2>Notifications</h2><p class="sp-muted">Payment updates sent to users are stored here.</p></div></div>${table(['Title','Message','Created','Type'], state.rows.map(n => `<tr><td>${esc(n.title)}</td><td>${esc(n.message)}</td><td>${esc(date(n.createdAt))}</td><td>${esc(n.type)}</td></tr>`), 'No notifications yet.')}</div>`;
  }
  async function renderAudit() {
    const result = await api('admin/audit/list'); state.rows = result.items || [];
    $('#adminContent').innerHTML = `<div class="admin-panel"><div class="admin-section-head"><div><h2>Audit logs</h2><p class="sp-muted">Keep an operational record of sensitive admin actions.</p></div><button class="sp-btn secondary" id="spAuditExport">Export CSV</button></div>${table(['Time','Actor','Action','Entity','Details'], state.rows.map(l => `<tr><td>${esc(date(l.createdAt))}</td><td>${esc(l.actorEmail)}</td><td>${esc(l.action)}</td><td>${esc(l.entityType)} · ${esc(l.entityId)}</td><td>${esc(JSON.stringify(l.details || {}))}</td></tr>`), 'No admin actions logged yet.')}</div>`; $('#spAuditExport').addEventListener('click', () => exportCsv('audit', state.rows));
  }
  function exportCsv(name, rows) {
    if (!rows?.length) return toast('No rows to export.', true);
    const keys = Object.keys(rows[0]).filter(k => !['_id','passwordHash'].includes(k)); const csv = [keys.join(','), ...rows.map(row => keys.map(k => { let v = row[k]; if (v && typeof v === 'object') v = JSON.stringify(v); return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `study-premium-${name}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  // Sidebar-independent actions and initial session check.
  (async function init() {
    try { const result = await api('auth/me'); if (!result.user || result.user.role !== 'admin') { showLogin(); return; } state.user = result.user; showApp(); await loadPage('dashboard'); }
    catch (error) { showLogin(error.message); }
  })();
})();
