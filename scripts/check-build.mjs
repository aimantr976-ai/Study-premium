import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
const required = [
  'index.html','admin.html','account.html','assets/app.css','assets/app.js','assets/admin.js','assets/account.js',
  'public/index.html','public/admin.html','public/account.html','public/assets/app.css','public/assets/app.js','public/assets/admin.js','public/assets/account.js','netlify.toml','netlify/functions/api.mjs','netlify/functions/lib/db.mjs','netlify/functions/lib/security.mjs','.env.example','README.md'
];
const missing = [];
for (const file of required) { try { await access(new URL(`../${file}`, import.meta.url), constants.R_OK); } catch { missing.push(file); } }
if (missing.length) { console.error('Build check failed. Missing files:', missing.join(', ')); process.exit(1); }
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
if (!html.includes('/assets/app.js') || !html.includes('/assets/app.css')) { console.error('Build check failed: index.html does not load the backend integration assets.'); process.exit(1); }
const cfg = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
if (!cfg.includes('publish = "public"') || !cfg.includes('netlify/functions') || !cfg.includes('from = "/api"')) { console.error('Build check failed: Netlify Functions/API routing missing.'); process.exit(1); }
console.log(`Build check passed: ${required.length} required project files found and frontend/API routing references verified.`);
console.log('This is a static/configuration check, not a live database, Cloudinary, payment or deployment test.');

// Prevent the deployed public bundle from drifting away from the editable source copies.
for (const pair of [
  ['index.html','public/index.html'],
  ['admin.html','public/admin.html'],
  ['account.html','public/account.html'],
  ['assets/app.js','public/assets/app.js'],
  ['assets/admin.js','public/assets/admin.js'],
  ['assets/account.js','public/assets/account.js'],
  ['assets/app.css','public/assets/app.css']
]) {
  const source = await readFile(new URL(`../${pair[0]}`, import.meta.url), 'utf8');
  const deployed = await readFile(new URL(`../${pair[1]}`, import.meta.url), 'utf8');
  if (source !== deployed) {
    console.error(`Build check failed: ${pair[0]} differs from ${pair[1]}. Sync the deployed public copy.`);
    process.exit(1);
  }
}
const appJs = await readFile(new URL('../public/assets/app.js', import.meta.url), 'utf8');
if (!appJs.includes('renderSites(Array.isArray(result.sites) ? result.sites : [])')) {
  console.error('Build check failed: homepage must always replace static site cards with admin-managed site data, including an empty result.');
  process.exit(1);
}
