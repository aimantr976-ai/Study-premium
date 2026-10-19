import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { getDb } from '../netlify/functions/lib/db.mjs';

const name = String(process.env.INITIAL_ADMIN_NAME || '').trim();
const email = String(process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
const mobile = String(process.env.INITIAL_ADMIN_MOBILE || '').trim().replace(/[\s()-]/g, '');
const password = String(process.env.INITIAL_ADMIN_PASSWORD || '');
if (!name || !email || !mobile || !password) {
  console.error('Set INITIAL_ADMIN_NAME, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_MOBILE and INITIAL_ADMIN_PASSWORD in your local .env before running npm run create-admin. Never commit that .env file.');
  process.exit(1);
}
if (password.length < 12 || password.length > 72) {
  console.error('For initial admin setup, use a strong password between 12 and 72 characters.'); process.exit(1);
}
if (!/^\+?[0-9]{10,15}$/.test(mobile)) { console.error('INITIAL_ADMIN_MOBILE must be a valid 10–15 digit number (optional leading +).'); process.exit(1); }
const db = await getDb();
const existing = await db.collection('users').findOne({ $or: [{ emailLower: email }, { mobile }] });
if (existing) {
  console.error('An account with this email or mobile already exists. This script will not silently elevate it. Review the database and promote the intended account manually using a secure database operation.');
  process.exit(1);
}
const user = { name: name.slice(0, 80), email, emailLower: email, mobile, passwordHash: await bcrypt.hash(password, 12), role: 'admin', status: 'active', createdAt: new Date(), updatedAt: new Date() };
const result = await db.collection('users').insertOne(user);
console.log(`Administrator created: ${email} (record ${result.insertedId})`);
console.log('Remove INITIAL_ADMIN_PASSWORD from the shell/environment after setup. This script does not expose any public admin-creation endpoint.');
process.exit(0);
