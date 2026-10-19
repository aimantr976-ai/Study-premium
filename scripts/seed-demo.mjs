import 'dotenv/config';
import { getDb } from '../netlify/functions/lib/db.mjs';

const db = await getDb();
const sitesCollection = db.collection('sites');
const currentCount = await sitesCollection.countDocuments();
let sites = await sitesCollection.find({}).toArray();
if (currentCount === 0) {
  const definitions = [
    ['Site 1','primary','⭐','Premium batches & resources — curated learning platform.','Learning','New',true,'pink','t8'],
    ['Site 2','primary','📖','Latest batches, notes & DPPs — your go-to portal.','Learning','Primary',true,'blue','t8'],
    ['Site 3','primary','📚','Free books and notes — PDFs and study material for JEE, NEET & Boards.','Books','Official',true,'cyan','t8'],
    ['Site 4','official','💼','Official learning platform. Configure its destination URL in admin.','Govt Exams','Official',true,'blue','t5'],
    ['Site 5','official','🚀','Learning resources. Configure its destination URL in admin.','Learning','Official',true,'blue','t8'],
    ['Site 6','official','🎓','Education resources. Configure its destination URL in admin.','Education','Official',true,'blue','t7'],
    ['Site 7','official','🖨️','Resource portal. Configure its destination URL in admin.','Resources','Official',true,'blue','t3'],
    ['Mirror 1','mirror','🌐','Temporary backup mirror.','JEE Only','Temporary',true,'blue','t2'],
    ['Mirror 2','mirror','🌐','Temporary backup mirror.','Competitive','Temporary',true,'blue','t3'],
    ['Mirror 3','mirror','🌐','Temporary backup mirror.','Academy','Temporary',true,'blue','t4'],
    ['Mirror 4','mirror','🌐','Temporary backup mirror.','Govt Exams','Temporary',true,'blue','t5'],
    ['Mirror 5','mirror','🌐','Temporary backup mirror.','JEE / NEET','Temporary',true,'blue','t6'],
    ['Mirror 6','mirror','🌐','Temporary backup mirror.','Selection','Temporary',true,'blue','t7'],
    ['Mirror 7','mirror','🌐','Temporary backup mirror.','Science & Fun','Temporary',true,'blue','t8'],
    ['Mirror 8','mirror','🌐','Temporary backup mirror.','JEE / NEET','Temporary',true,'blue','t9']
  ];
  const docs = definitions.map((x, index) => ({ title:x[0], section:x[1], icon:x[2], description:x[3], category:x[4], badge:x[5], requiresSubscription:x[6], accent:x[7] || 'blue', theme:x[8] || 't8', destinationUrl:'', imageUrl:'', published:true, sortOrder:index*10, createdAt:new Date(), updatedAt:new Date() }));
  const inserted = await sitesCollection.insertMany(docs);
  sites = docs.map((doc, i) => ({ ...doc, _id: inserted.insertedIds[i] }));
  console.log(`Seeded ${sites.length} editable site cards. Destination URLs are intentionally blank; configure real URLs in the admin panel.`);
} else {
  console.log(`Found ${currentCount} sites; left existing site records unchanged.`);
}
const planCount = await db.collection('plans').countDocuments();
if (!planCount) {
  const includedSiteIds = sites.map(s => String(s._id));
  await db.collection('plans').insertMany([
    { name:'Starter plan — EDIT BEFORE PUBLISHING', description:'Example draft. Set your real price and included sites/batches before publishing.', pricePaise:4900, durationDays:7, includedSiteIds, includedBatchIds:[], published:false, sortOrder:10, createdAt:new Date(), updatedAt:new Date() },
    { name:'Monthly plan — EDIT BEFORE PUBLISHING', description:'Example draft. Set your real price and included sites/batches before publishing.', pricePaise:14900, durationDays:30, includedSiteIds, includedBatchIds:[], published:false, sortOrder:20, createdAt:new Date(), updatedAt:new Date() },
    { name:'Annual plan — EDIT BEFORE PUBLISHING', description:'Example draft. Set your real price and included sites/batches before publishing.', pricePaise:79900, durationDays:365, includedSiteIds, includedBatchIds:[], published:false, sortOrder:30, createdAt:new Date(), updatedAt:new Date() }
  ]);
  console.log('Seeded three UNPUBLISHED sample plans. Edit real prices and entitlements before publishing them to users.');
} else console.log(`Found ${planCount} plans; left existing plan records unchanged.`);
const settingsCount = await db.collection('siteSettings').countDocuments({ _id:'main' });
if (!settingsCount) await db.collection('siteSettings').insertOne({ _id:'main', siteTitle:'Study Premium', announcement:'', paymentQrUrl:'', paymentRecipient:'', paymentInstructions:'Pay the exact amount shown. Submit your UTR only after completing the payment.', maintenance:false, createdAt:new Date(), updatedAt:new Date() });
console.log('Demo data ready. Configure Cloudinary, upload the real payment QR, edit links/plans, and test with a non-admin user before going live.');
