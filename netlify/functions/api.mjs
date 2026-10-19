import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { v2 as cloudinary } from 'cloudinary';
import { getClient, getDb } from './lib/db.mjs';
import {
  ApiError, asId, cleanText, asBool, asInt, emailNorm, emailValid,
  mobileNorm, mobileValid, validHttpUrl, moneyPaise, requireJwtSecret,
  cookieHeader, signSession, requireUser, rateLimit, audit, safeUser, activeSubscription, now
} from './lib/security.mjs';

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const send = (statusCode, data, extraHeaders = {}) => ({ statusCode, headers: { ...headers, ...extraHeaders }, body: JSON.stringify(data) });
const ok = (data = {}, extraHeaders = {}) => send(200, { ok: true, ...data }, extraHeaders);
const created = (data = {}, extraHeaders = {}) => send(201, { ok: true, ...data }, extraHeaders);
const escId = (doc) => ({ ...doc, id: String(doc._id), _id: undefined });
const strip = (doc, fields = []) => {
  if (!doc) return null;
  const out = { ...doc, id: String(doc._id) };
  delete out._id;
  for (const field of fields) delete out[field];
  return out;
};
const publicPlan = p => ({ id: String(p._id), name: p.name, description: p.description, pricePaise: p.pricePaise, durationDays: p.durationDays, includedSiteIds: p.includedSiteIds || [], includedBatchIds: p.includedBatchIds || [], published: p.published, sortOrder: p.sortOrder });
const publicSite = s => ({ id: String(s._id), title: s.title, description: s.description, category: s.category, section: s.section, icon: s.icon || '🌐', badge: s.badge || '', accent: ['pink','cyan','blue'].includes(s.accent) ? s.accent : 'blue', theme: /^t[2-9]$/.test(s.theme || '') ? s.theme : 't8', hasDestinationUrl: !!s.destinationUrl, destinationUrl: s.requiresSubscription === false ? (s.destinationUrl || '') : '', requiresSubscription: s.requiresSubscription !== false, published: s.published !== false, sortOrder: s.sortOrder || 0, imageUrl: s.imageUrl || '' });
const publicBatch = b => ({ id: String(b._id), title: b.title, description: b.description, category: b.category, imageUrl: b.imageUrl || '', published: b.published !== false, sortOrder: b.sortOrder || 0 });
const getSettings = async (db) => await db.collection('siteSettings').findOne({ _id: 'main' }) || { _id: 'main', siteTitle: 'Study Premium', paymentQrUrl: '', paymentRecipient: '', paymentInstructions: 'Pay the exact amount shown. Submit your UTR only after completing the payment.', announcement: '', maintenance: false };
const ensureAdmin = async (event) => await requireUser(event, true);
const idList = (value) => Array.isArray(value) ? value.map(x => cleanText(x, 64)).filter(x => ObjectId.isValid(x)).slice(0, 200) : String(value || '').split(',').map(x => cleanText(x, 64)).filter(x => ObjectId.isValid(x)).slice(0, 200);
const safeDestination = (value) => {
  const url = cleanText(value, 2048);
  if (!url) return '';
  if (!validHttpUrl(url)) throw new ApiError(400, 'Destination URL must be a valid HTTP or HTTPS URL.');
  return url;
};
const requireCloudinary = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) throw new ApiError(503, 'Cloudinary is not configured yet. Add its environment variables first.', 'CONFIGURATION_REQUIRED');
  cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });
  return { cloudName: CLOUDINARY_CLOUD_NAME, apiKey: CLOUDINARY_API_KEY, apiSecret: CLOUDINARY_API_SECRET };
};

async function authSignup(body, event) {
  await rateLimit(event, 'signup', 6);
  requireJwtSecret();
  const db = await getDb();
  const name = cleanText(body.name, 80);
  const email = emailNorm(body.email);
  const mobile = mobileNorm(body.mobile);
  const password = String(body.password || '');
  if (name.length < 2) throw new ApiError(400, 'Enter your full name.');
  if (!emailValid(email)) throw new ApiError(400, 'Enter a valid email address.');
  if (!mobileValid(mobile)) throw new ApiError(400, 'Enter a valid mobile number including country code if needed.');
  if (password.length < 8 || password.length > 72) throw new ApiError(400, 'Password must contain 8–72 characters.');
  const existing = await db.collection('users').findOne({ $or: [{ emailLower: email }, { mobile }] }, { projection: { _id: 1 } });
  if (existing) throw new ApiError(409, 'An account with this email or mobile number already exists.');
  const user = { name, email, emailLower: email, mobile, passwordHash: await bcrypt.hash(password, 12), role: 'user', status: 'active', createdAt: now(), updatedAt: now() };
  try { const result = await db.collection('users').insertOne(user); user._id = result.insertedId; }
  catch (error) { if (error?.code === 11000) throw new ApiError(409, 'This email or mobile number is already registered.'); throw error; }
  return created({ user: safeUser(user) }, { 'Set-Cookie': cookieHeader(signSession(user)) });
}

async function authLogin(body, event) {
  await rateLimit(event, 'login', 10);
  requireJwtSecret();
  const db = await getDb();
  const identifier = cleanText(body.identifier || body.email || body.mobile, 254);
  const password = String(body.password || '');
  if (!identifier || !password) throw new ApiError(400, 'Enter your email/mobile and password.');
  const normalizedEmail = emailNorm(identifier);
  const normalizedMobile = mobileNorm(identifier);
  const user = await db.collection('users').findOne({ $or: [{ emailLower: normalizedEmail }, { mobile: normalizedMobile }] });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new ApiError(401, 'Incorrect login details.');
  if (user.status !== 'active') throw new ApiError(403, 'This account is suspended. Contact support.');
  if (user.role === 'admin') await audit(db, user, 'admin.login', 'user', user._id);
  return ok({ user: safeUser(user) }, { 'Set-Cookie': cookieHeader(signSession(user)) });
}

async function listPaymentsForUser(db, userId) {
  return (await db.collection('payments').find({ userId }).sort({ createdAt: -1 }).limit(50).toArray()).map(p => ({
    id: String(p._id), orderId: p.orderId, planName: p.planSnapshot?.name || 'Plan', amountPaise: p.amountPaise,
    status: p.status, utr: p.utr || '', rejectionReason: p.rejectionReason || '', createdAt: p.createdAt,
    reviewedAt: p.reviewedAt || null, hasScreenshot: !!p.screenshotPublicId
  }));
}

async function doAction(action, body, event) {
  if (action === 'public/bootstrap') {
    const db = await getDb();
    const [sites, batches, plans, settings] = await Promise.all([
      db.collection('sites').find({ published: true }).sort({ section: 1, sortOrder: 1, createdAt: 1 }).toArray(),
      db.collection('batches').find({ published: true }).sort({ sortOrder: 1, createdAt: 1 }).toArray(),
      db.collection('plans').find({ published: true }).sort({ sortOrder: 1, createdAt: 1 }).toArray(),
      getSettings(db)
    ]);
    return ok({ sites: sites.map(publicSite), batches: batches.map(publicBatch), plans: plans.map(publicPlan), settings: { siteTitle: settings.siteTitle || 'Study Premium', announcement: settings.announcement || '', maintenance: !!settings.maintenance, logoUrl: settings.logoUrl || '', faviconUrl: settings.faviconUrl || '', footerText: settings.footerText || '', whatsappUrl: settings.whatsappUrl || '', telegramUrl: settings.telegramUrl || '', supportEmail: settings.supportEmail || '' } });
  }
  if (action === 'public/plans') {
    const db = await getDb();
    const plans = await db.collection('plans').find({ published: true }).sort({ sortOrder: 1 }).toArray();
    return ok({ plans: plans.map(publicPlan) });
  }
  if (action === 'auth/signup') return authSignup(body, event);
  if (action === 'auth/login') return authLogin(body, event);
  if (action === 'auth/logout') return ok({ message: 'Signed out.' }, { 'Set-Cookie': cookieHeader('', true) });
  if (action === 'auth/me') {
    try {
      const user = await requireUser(event, false);
      return ok({ user: safeUser(user) });
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.statusCode)) return ok({ user: null });
      throw error;
    }
  }
  if (action === 'user/account') {
    const user = await requireUser(event);
    const db = await getDb();
    const [payments, subscriptions, notifications] = await Promise.all([
      listPaymentsForUser(db, user._id),
      db.collection('subscriptions').find({ userId: user._id }).sort({ createdAt: -1 }).limit(50).toArray(),
      db.collection('notifications').find({ userId: user._id }).sort({ createdAt: -1 }).limit(25).toArray()
    ]);
    return ok({ user: safeUser(user), payments, subscriptions: subscriptions.map(s => ({ id: String(s._id), planName: s.planName, status: s.status, startsAt: s.startsAt, expiresAt: s.expiresAt, siteIds: s.siteIds || [], batchIds: s.batchIds || [] })), notifications: notifications.map(n => strip(n, ['userId'])) });
  }
  if (action === 'site/open') {
    const user = await requireUser(event);
    const db = await getDb();
    const settings = await getSettings(db); if (settings.maintenance) throw new ApiError(503, 'Study Premium is under maintenance. Please try again later.');
    const site = await db.collection('sites').findOne({ _id: asId(body.siteId), published: true });
    if (!site) throw new ApiError(404, 'This site is not available.');
    if (!site.destinationUrl || !validHttpUrl(site.destinationUrl)) throw new ApiError(409, 'This site link has not been configured by the administrator yet.');
    if (site.requiresSubscription !== false) {
      const sub = await db.collection('subscriptions').findOne({ userId: user._id, status: 'active', startsAt: { $lte: now() }, expiresAt: { $gt: now() }, siteIds: { $in: [String(site._id)] } });
      const allowed = !!sub;
      if (!allowed) throw new ApiError(402, 'An approved active plan that includes this site is required.', 'PLAN_REQUIRED');
    }
    return ok({ destinationUrl: site.destinationUrl });
  }
  if (action === 'batch/open') {
    const user = await requireUser(event);
    const db = await getDb();
    const settings = await getSettings(db); if (settings.maintenance) throw new ApiError(503, 'Study Premium is under maintenance. Please try again later.');
    const batch = await db.collection('batches').findOne({ _id: asId(body.batchId), published: true });
    if (!batch) throw new ApiError(404, 'This batch is not available.');
    if (!batch.destinationUrl || !validHttpUrl(batch.destinationUrl)) throw new ApiError(409, 'This batch link has not been configured yet.');
    const sub = await db.collection('subscriptions').findOne({ userId: user._id, status: 'active', startsAt: { $lte: now() }, expiresAt: { $gt: now() }, batchIds: { $in: [String(batch._id)] } });
    if (!sub) throw new ApiError(402, 'An approved active plan that includes this batch is required.', 'PLAN_REQUIRED');
    return ok({ destinationUrl: batch.destinationUrl });
  }
  if (action === 'payment/create') {
    await rateLimit(event, 'payment-create', 10, 10 * 60 * 1000);
    const user = await requireUser(event);
    const db = await getDb();
    const planId = asId(body.planId);
    const plan = await db.collection('plans').findOne({ _id: planId, published: true });
    if (!plan) throw new ApiError(404, 'The selected plan is not available.');
    if (!Number.isInteger(plan.pricePaise) || plan.pricePaise < 1) throw new ApiError(400, 'This plan has not been configured with a valid positive price.');
    const settings = await getSettings(db);
    if (settings.maintenance) throw new ApiError(503, 'Checkout is paused while Study Premium is under maintenance.');
    if (!settings.paymentQrUrl) throw new ApiError(503, 'The administrator has not configured the payment QR yet. Please try again later.');
    const openOrder = await db.collection('payments').findOne({ userId: user._id, planId, status: 'awaiting_payment', createdAt: { $gt: new Date(Date.now() - 24 * 3600 * 1000) } });
    if (openOrder) return ok({ order: { id: String(openOrder._id), orderId: openOrder.orderId, amountPaise: openOrder.amountPaise, status: openOrder.status, createdAt: openOrder.createdAt }, qrUrl: settings.paymentQrUrl, recipient: settings.paymentRecipient || '', instructions: settings.paymentInstructions || '' });
    const orderId = `SP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const pay = { orderId, userId: user._id, planId, planSnapshot: { name: plan.name, durationDays: plan.durationDays, includedSiteIds: plan.includedSiteIds || [], includedBatchIds: plan.includedBatchIds || [] }, amountPaise: plan.pricePaise, status: 'awaiting_payment', createdAt: now(), updatedAt: now() };
    const ins = await db.collection('payments').insertOne(pay); pay._id = ins.insertedId;
    await audit(db, user, 'payment.order_created', 'payment', pay._id, { orderId, amountPaise: pay.amountPaise });
    return created({ order: { id: String(pay._id), orderId, amountPaise: pay.amountPaise, status: pay.status, createdAt: pay.createdAt }, qrUrl: settings.paymentQrUrl, recipient: settings.paymentRecipient || '', instructions: settings.paymentInstructions || '' });
  }
  if (action === 'payment/claim') {
    const user = await requireUser(event);
    const db = await getDb();
    const orderId = cleanText(body.orderId, 80);
    const utr = cleanText(body.utr, 64).replace(/\s/g, '');
    const screenshotPublicId = cleanText(body.screenshotPublicId, 300);
    const screenshotFormat = cleanText(body.screenshotFormat, 8).toLowerCase();
    if (!orderId || utr.length < 6 || utr.length > 64 || !/^[a-zA-Z0-9-]+$/.test(utr)) throw new ApiError(400, 'Enter a valid UTR/reference number (at least 6 letters or numbers).');
    if (screenshotPublicId && (!screenshotPublicId.startsWith('study-premium/payments/') || screenshotPublicId.includes('..') || !/^[a-zA-Z0-9_\/-]+$/.test(screenshotPublicId) || !['jpg','jpeg','png','webp','gif'].includes(screenshotFormat))) throw new ApiError(400, 'The optional screenshot upload reference is invalid.');
    if (screenshotPublicId) {
      requireCloudinary();
      let resource;
      try { resource = await cloudinary.api.resource(screenshotPublicId, { resource_type: 'image', type: 'authenticated' }); }
      catch { throw new ApiError(400, 'Could not verify the uploaded private screenshot. Upload it again and retry.'); }
      const maxBytes = Number(process.env.UPLOAD_MAX_BYTES || 5242880);
      const allowedFormats = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
      if (resource.public_id !== screenshotPublicId || !allowedFormats.includes(String(resource.format || '').toLowerCase()) || Number(resource.bytes || 0) > maxBytes) {
        try { await cloudinary.uploader.destroy(screenshotPublicId, { resource_type: 'image', type: 'authenticated', invalidate: true }); } catch (_) {}
        throw new ApiError(400, 'Screenshot must be a JPG, PNG, WebP, or GIF image up to 5 MB.');
      }
    }
    const pay = await db.collection('payments').findOne({ orderId, userId: user._id });
    if (!pay) throw new ApiError(404, 'Payment order not found.');
    if (pay.status !== 'awaiting_payment') throw new ApiError(409, 'This order has already been submitted or processed.');
    const duplicate = await db.collection('payments').findOne({ utrLower: utr.toLowerCase() }, { projection: { _id: 1 } });
    if (duplicate) throw new ApiError(409, 'This UTR has already been submitted.');
    try {
      await db.collection('payments').updateOne({ _id: pay._id, status: 'awaiting_payment' }, { $set: { status: 'pending', utr, utrLower: utr.toLowerCase(), ...(screenshotPublicId ? { screenshotPublicId, screenshotFormat } : {}), submittedAt: now(), updatedAt: now() } });
    } catch (error) { if (error?.code === 11000) throw new ApiError(409, 'This UTR has already been submitted.'); throw error; }
    await db.collection('notifications').insertOne({ userId: user._id, title: 'Payment submitted', message: `Payment ${orderId} is waiting for admin verification.`, type: 'payment', readAt: null, createdAt: now() });
    await audit(db, user, 'payment.claim_submitted', 'payment', pay._id, { orderId });
    return ok({ message: 'Payment claim submitted. Batch access remains locked until an administrator verifies the transaction.' });
  }
  if (action === 'payment/history') {
    const user = await requireUser(event); const db = await getDb();
    return ok({ payments: await listPaymentsForUser(db, user._id) });
  }
  if (action === 'notification/read') {
    const user = await requireUser(event); const db = await getDb();
    const ids = (Array.isArray(body.ids) ? body.ids : []).filter(ObjectId.isValid).slice(0, 100).map(x => new ObjectId(x));
    if (ids.length) await db.collection('notifications').updateMany({ _id: { $in: ids }, userId: user._id }, { $set: { readAt: now() } });
    return ok({});
  }
  if (action === 'media/signature') {
    await rateLimit(event, 'media-signature', 25, 10 * 60 * 1000);
    const user = await requireUser(event);
    const mode = body.mode === 'payment' ? 'payment' : 'admin';
    if (mode === 'admin' && user.role !== 'admin') throw new ApiError(403, 'Administrator access required.');
    const cfg = requireCloudinary();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = mode === 'payment' ? 'study-premium/payments' : 'study-premium/assets';
    const params = { timestamp, public_id: `${folder}/${crypto.randomUUID()}`, type: mode === 'payment' ? 'authenticated' : 'upload', allowed_formats: 'jpg,png,webp,gif' };
    const signature = cloudinary.utils.api_sign_request(params, cfg.apiSecret);
    return ok({ ...params, signature, apiKey: cfg.apiKey, cloudName: cfg.cloudName });
  }

  // Everything below this point requires a currently valid admin account.
  const admin = await ensureAdmin(event);
  const db = await getDb();

  if (action === 'admin/dashboard') {
    const t = now();
    const [users, sites, batches, plans, pendingPayments, activeSubs, expiredSubs, approved, pending, recentUsers, recentPayments, errors] = await Promise.all([
      db.collection('users').countDocuments({}),
      db.collection('sites').countDocuments({}),
      db.collection('batches').countDocuments({}),
      db.collection('plans').countDocuments({}),
      db.collection('payments').countDocuments({ status: 'pending' }),
      db.collection('subscriptions').countDocuments({ status: 'active', expiresAt: { $gt: t }, startsAt: { $lte: t } }),
      db.collection('subscriptions').countDocuments({ expiresAt: { $lte: t } }),
      db.collection('payments').aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, count: { $sum: 1 }, revenuePaise: { $sum: '$amountPaise' } } }]).toArray(),
      db.collection('payments').countDocuments({ status: 'pending' }),
      db.collection('users').find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).limit(6).toArray(),
      db.collection('payments').find({}).sort({ createdAt: -1 }).limit(8).toArray(),
      db.collection('auditLogs').find({ action: { $regex: 'error|failed', $options: 'i' } }).sort({ createdAt: -1 }).limit(5).toArray()
    ]);
    return ok({ stats: { users, sites, batches, plans, pendingPayments, activeSubs, expiredSubs, approvedCount: approved[0]?.count || 0, verifiedRevenuePaise: approved[0]?.revenuePaise || 0, pending }, recentUsers: recentUsers.map(safeUser), recentPayments: recentPayments.map(p => ({ id: String(p._id), orderId: p.orderId, status: p.status, amountPaise: p.amountPaise, createdAt: p.createdAt, planName: p.planSnapshot?.name || '' })), errors });
  }
  if (action === 'admin/sites/list') {
    const rows = await db.collection('sites').find({}).sort({ section: 1, sortOrder: 1, createdAt: 1 }).toArray();
    return ok({ items: rows.map(s => strip(s)) });
  }
  if (action === 'admin/sites/save') {
    const id = cleanText(body.id, 64);
    const title = cleanText(body.title, 100);
    if (title.length < 2) throw new ApiError(400, 'Site title is required.');
    const section = ['primary', 'official', 'mirror'].includes(body.section) ? body.section : 'official';
    const accent = ['pink','cyan','blue'].includes(body.accent) ? body.accent : 'blue'; const theme = /^t[2-9]$/.test(String(body.theme || '')) ? String(body.theme) : 't8';
    const doc = { title, description: cleanText(body.description, 500), category: cleanText(body.category, 80), section, icon: cleanText(body.icon || '🌐', 8), badge: cleanText(body.badge, 40), accent, theme, destinationUrl: safeDestination(body.destinationUrl), imageUrl: safeDestination(body.imageUrl), requiresSubscription: asBool(body.requiresSubscription, true), published: asBool(body.published, true), sortOrder: asInt(body.sortOrder, 0, 10000, 100), updatedAt: now() };
    let recordId;
    if (id) {
      recordId = asId(id);
      await db.collection('sites').updateOne({ _id: recordId }, { $set: doc });
    } else { doc.createdAt = now(); const res = await db.collection('sites').insertOne(doc); recordId = res.insertedId; }
    await audit(db, admin, id ? 'site.updated' : 'site.created', 'site', recordId, { title, section });
    return ok({ item: strip(await db.collection('sites').findOne({ _id: recordId })) });
  }
  if (action === 'admin/sites/delete') {
    const id = asId(body.id);
    const result = await db.collection('sites').deleteOne({ _id: id });
    if (!result.deletedCount) throw new ApiError(404, 'Site not found.');
    await audit(db, admin, 'site.deleted', 'site', id);
    return ok({});
  }
  if (action === 'admin/batches/list') {
    const rows = await db.collection('batches').find({}).sort({ sortOrder: 1, createdAt: -1 }).toArray(); return ok({ items: rows.map(row => strip(row)) });
  }
  if (action === 'admin/batches/save') {
    const id = cleanText(body.id, 64); const title = cleanText(body.title, 120); if (title.length < 2) throw new ApiError(400, 'Batch title is required.');
    const doc = { title, description: cleanText(body.description, 1000), category: cleanText(body.category, 80), imageUrl: safeDestination(body.imageUrl), destinationUrl: safeDestination(body.destinationUrl), published: asBool(body.published, true), sortOrder: asInt(body.sortOrder, 0, 10000, 100), updatedAt: now() };
    let recordId;
    if (id) { recordId = asId(id); await db.collection('batches').updateOne({ _id: recordId }, { $set: doc }); }
    else { doc.createdAt = now(); recordId = (await db.collection('batches').insertOne(doc)).insertedId; }
    await audit(db, admin, id ? 'batch.updated' : 'batch.created', 'batch', recordId, { title }); return ok({ item: strip(await db.collection('batches').findOne({ _id: recordId })) });
  }
  if (action === 'admin/batches/delete') {
    const id = asId(body.id); const result = await db.collection('batches').deleteOne({ _id: id }); if (!result.deletedCount) throw new ApiError(404, 'Batch not found.');
    await audit(db, admin, 'batch.deleted', 'batch', id); return ok({});
  }
  if (action === 'admin/plans/list') {
    const rows = await db.collection('plans').find({}).sort({ sortOrder: 1, createdAt: -1 }).toArray(); return ok({ items: rows.map(p => ({ ...publicPlan(p), description: p.description, createdAt: p.createdAt, updatedAt: p.updatedAt })) });
  }
  if (action === 'admin/plans/save') {
    const id = cleanText(body.id, 64); const name = cleanText(body.name, 100); const description = cleanText(body.description, 800);
    if (name.length < 2) throw new ApiError(400, 'Plan name is required.');
    const durationDays = asInt(body.durationDays, 1, 3650, 30); const pricePaise = moneyPaise(body.priceInr); const published = asBool(body.published, true);
    if (published && pricePaise < 1) throw new ApiError(400, 'Published paid plans must have a price greater than ₹0. Keep a zero-price draft unpublished.');
    const doc = { name, description, durationDays, pricePaise, includedSiteIds: idList(body.includedSiteIds), includedBatchIds: idList(body.includedBatchIds), published, sortOrder: asInt(body.sortOrder, 0, 10000, 100), updatedAt: now() };
    let recordId;
    if (id) { recordId = asId(id); await db.collection('plans').updateOne({ _id: recordId }, { $set: doc }); }
    else { doc.createdAt = now(); recordId = (await db.collection('plans').insertOne(doc)).insertedId; }
    await audit(db, admin, id ? 'plan.updated' : 'plan.created', 'plan', recordId, { name, durationDays, pricePaise }); return ok({ item: strip(await db.collection('plans').findOne({ _id: recordId })) });
  }
  if (action === 'admin/plans/delete') {
    const id = asId(body.id); const pendingOrders = await db.collection('payments').countDocuments({ planId: id, status: { $in: ['awaiting_payment', 'pending'] } }); if (pendingOrders) throw new ApiError(409, 'This plan has pending payment orders. Resolve them before deleting the plan.'); const result = await db.collection('plans').deleteOne({ _id: id }); if (!result.deletedCount) throw new ApiError(404, 'Plan not found.');
    await audit(db, admin, 'plan.deleted', 'plan', id); return ok({});
  }
  if (action === 'admin/payments/list') {
    const status = ['pending', 'approved', 'rejected', 'awaiting_payment'].includes(body.status) ? body.status : null;
    const query = status ? { status } : {};
    const payments = await db.collection('payments').find(query).sort({ createdAt: -1 }).limit(250).toArray();
    const userIds = [...new Set(payments.map(p => String(p.userId)))].filter(ObjectId.isValid).map(x => new ObjectId(x));
    const users = await db.collection('users').find({ _id: { $in: userIds } }, { projection: { passwordHash: 0 } }).toArray();
    const byId = new Map(users.map(u => [String(u._id), safeUser(u)]));
    const hasPrivateScreenshots = payments.some(p => p.screenshotPublicId);
    if (hasPrivateScreenshots) requireCloudinary();
    return ok({ items: payments.map(p => ({ id: String(p._id), orderId: p.orderId, user: byId.get(String(p.userId)) || null, planName: p.planSnapshot?.name || '', amountPaise: p.amountPaise, status: p.status, utr: p.utr || '', hasScreenshot: !!p.screenshotPublicId, screenshotUrl: p.screenshotPublicId ? cloudinary.utils.private_download_url(p.screenshotPublicId, p.screenshotFormat || 'jpg', { secure: true, type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 300, attachment: false }) : '', createdAt: p.createdAt, submittedAt: p.submittedAt || null, rejectionReason: p.rejectionReason || '', reviewedAt: p.reviewedAt || null })) });
  }
  if (action === 'admin/payments/review') {
    const id = asId(body.id); const decision = body.decision === 'approve' ? 'approve' : 'reject';
    const existing = await db.collection('payments').findOne({ _id: id });
    if (!existing) throw new ApiError(404, 'Payment claim not found.');
    if (existing.status !== 'pending') throw new ApiError(409, 'This payment claim has already been processed.');
    const client = await getClient(); const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const current = await db.collection('payments').findOne({ _id: id, status: 'pending' }, { session });
        if (!current) throw new ApiError(409, 'This payment claim has already been processed.');
        if (decision === 'approve') {
          if (body.confirmVerified !== true) throw new ApiError(400, 'Confirm that you verified this transaction against the payment-provider or bank record.');
          const startsAt = now(); const days = Number(current.planSnapshot?.durationDays || 0);
          if (!Number.isInteger(days) || days < 1 || days > 3650) throw new ApiError(400, 'The saved plan duration is invalid.');
          const expiresAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000);
          await db.collection('payments').updateOne({ _id: id, status: 'pending' }, { $set: { status: 'approved', verifiedBy: admin._id, reviewedAt: startsAt, updatedAt: startsAt } }, { session });
          await db.collection('subscriptions').insertOne({ orderId: current.orderId, userId: current.userId, paymentId: current._id, planId: current.planId, planName: current.planSnapshot.name, amountPaise: current.amountPaise, status: 'active', startsAt, expiresAt, siteIds: current.planSnapshot.includedSiteIds || [], batchIds: current.planSnapshot.includedBatchIds || [], approvedBy: admin._id, createdAt: startsAt }, { session });
          await db.collection('notifications').insertOne({ userId: current.userId, title: 'Payment approved', message: `Payment ${current.orderId} was approved. Your subscription is active until ${expiresAt.toISOString()}.`, type: 'payment', readAt: null, createdAt: startsAt }, { session });
          await db.collection('auditLogs').insertOne({ actorId: admin._id, actorEmail: admin.email, action: 'payment.approved', entityType: 'payment', entityId: String(id), details: { orderId: current.orderId, amountPaise: current.amountPaise, expiresAt: expiresAt.toISOString() }, createdAt: now() }, { session });
        } else {
          const reason = cleanText(body.reason, 400); if (reason.length < 3) throw new ApiError(400, 'Enter a rejection reason.');
          await db.collection('payments').updateOne({ _id: id, status: 'pending' }, { $set: { status: 'rejected', rejectionReason: reason, verifiedBy: admin._id, reviewedAt: now(), updatedAt: now() } }, { session });
          await db.collection('notifications').insertOne({ userId: current.userId, title: 'Payment rejected', message: `Payment ${current.orderId} was rejected: ${reason}`, type: 'payment', readAt: null, createdAt: now() }, { session });
          await db.collection('auditLogs').insertOne({ actorId: admin._id, actorEmail: admin.email, action: 'payment.rejected', entityType: 'payment', entityId: String(id), details: { orderId: current.orderId, reason }, createdAt: now() }, { session });
        }
      });
    } finally { await session.endSession(); }
    return ok({ message: decision === 'approve' ? 'Payment approved and subscription activated.' : 'Payment rejected.' });
  }
  if (action === 'admin/subscriptions/list') {
    const items = await db.collection('subscriptions').find({}).sort({ createdAt: -1 }).limit(500).toArray();
    const userIds = [...new Set(items.map(s => String(s.userId)))].filter(ObjectId.isValid).map(x => new ObjectId(x));
    const users = await db.collection('users').find({ _id: { $in: userIds } }, { projection: { passwordHash: 0 } }).toArray();
    const map = new Map(users.map(u => [String(u._id), safeUser(u)]));
    const t = now();
    return ok({ items: items.map(s => ({ id: String(s._id), orderId: s.orderId, user: map.get(String(s.userId)) || null, planName: s.planName, amountPaise: s.amountPaise, status: s.expiresAt > t ? s.status : 'expired', startsAt: s.startsAt, expiresAt: s.expiresAt, siteIds: s.siteIds || [], batchIds: s.batchIds || [] })) });
  }
  if (action === 'admin/users/list') {
    const q = cleanText(body.search, 100); const filter = q ? { $or: [{ name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { email: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { mobile: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }] } : {};
    const users = await db.collection('users').find(filter, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).limit(300).toArray();
    return ok({ items: await Promise.all(users.map(async u => { const sub = await activeSubscription(db, u._id); return { ...safeUser(u), activePlan: sub?.planName || '', expiresAt: sub?.expiresAt || null }; })) });
  }
  if (action === 'admin/users/status') {
    const id = asId(body.id); const status = body.status === 'suspended' ? 'suspended' : 'active';
    const target = await db.collection('users').findOne({ _id: id }); if (!target) throw new ApiError(404, 'User not found.');
    if (String(target._id) === String(admin._id)) throw new ApiError(400, 'You cannot suspend your own administrator account.');
    await db.collection('users').updateOne({ _id: id }, { $set: { status, statusReason: cleanText(body.reason, 300), updatedAt: now() } });
    await audit(db, admin, `user.${status}`, 'user', id, { reason: cleanText(body.reason, 300) }); return ok({});
  }
  if (action === 'admin/settings/get') {
    const s = await getSettings(db); const out = { ...s }; delete out._id; return ok({ settings: out });
  }
  if (action === 'admin/settings/save') {
    const current = await getSettings(db);
    const patch = {
      siteTitle: cleanText(body.siteTitle || current.siteTitle || 'Study Premium', 100),
      announcement: cleanText(body.announcement, 500),
      logoUrl: safeDestination(body.logoUrl),
      faviconUrl: safeDestination(body.faviconUrl),
      footerText: cleanText(body.footerText, 300),
      whatsappUrl: safeDestination(body.whatsappUrl),
      telegramUrl: safeDestination(body.telegramUrl),
      paymentQrUrl: safeDestination(body.paymentQrUrl),
      paymentRecipient: cleanText(body.paymentRecipient, 120),
      paymentInstructions: cleanText(body.paymentInstructions, 700),
      maintenance: asBool(body.maintenance, false),
      supportEmail: emailNorm(body.supportEmail),
      updatedAt: now(), updatedBy: admin._id
    };
    if (patch.supportEmail && !emailValid(patch.supportEmail)) throw new ApiError(400, 'Enter a valid support email.');
    await db.collection('siteSettings').updateOne({ _id: 'main' }, { $set: patch, $setOnInsert: { createdAt: now() } }, { upsert: true });
    await audit(db, admin, 'settings.updated', 'settings', 'main', { maintenance: patch.maintenance }); return ok({ settings: patch });
  }
  if (action === 'admin/notifications/list') {
    const items = await db.collection('notifications').find({}).sort({ createdAt: -1 }).limit(200).toArray(); return ok({ items: items.map(item => strip(item)) });
  }
  if (action === 'admin/audit/list') {
    const items = await db.collection('auditLogs').find({}).sort({ createdAt: -1 }).limit(300).toArray(); return ok({ items: items.map(item => strip(item)) });
  }
  if (action === 'admin/media/list') {
    const settings = await getSettings(db); const sites = await db.collection('sites').find({ imageUrl: { $ne: '' } }, { projection: { title: 1, imageUrl: 1, updatedAt: 1 } }).limit(100).toArray(); const batches = await db.collection('batches').find({ imageUrl: { $ne: '' } }, { projection: { title: 1, imageUrl: 1, updatedAt: 1 } }).limit(100).toArray();
    return ok({ items: [...sites, ...batches].map(item => strip(item)), paymentQrUrl: settings.paymentQrUrl || '' });
  }

  throw new ApiError(404, 'Unknown API action.');
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { ...headers, Allow: 'POST, OPTIONS' }, body: '' };
  if (event.httpMethod !== 'POST') return send(405, { ok: false, error: 'Use POST for this API.', code: 'METHOD_NOT_ALLOWED' }, { Allow: 'POST, OPTIONS' });
  let body;
  try { body = event.body ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : {}; }
  catch { return send(400, { ok: false, error: 'Invalid JSON request.' }); }
  try {
    const action = cleanText(body.action, 100);
    if (!action) throw new ApiError(400, 'Missing API action.');
    return await doAction(action, body, event);
  } catch (error) {
    const statusCode = error instanceof ApiError ? error.statusCode : (Number(error?.statusCode) || 500);
    if (!(error instanceof ApiError)) console.error('[Study Premium API]', error?.message || error);
    const message = error instanceof ApiError ? error.message : (statusCode === 503 ? error.message : 'Unexpected server error. Check function logs.');
    return send(statusCode, { ok: false, error: message, code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR' });
  }
}
