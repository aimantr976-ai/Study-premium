# Fix for Purchased Batch Access Bug

## Issue
After a student purchases a batch and the admin approves the payment, the student's account shows the payment as approved. However, when clicking on the same purchased batch, the system asks for payment again, indicating that the batch access is not being granted despite an approved payment.

## Root Cause
In the `site/open` and `batch/open` API endpoints, the authorization check for accessing a site or batch was incorrectly querying the `subscriptions` collection. The code was using:
- `siteIds: String(site._id)` 
- `batchIds: String(batch._id)`

This attempted to match the `siteIds` or `batchIds` field (which stores an array of IDs) against a single string value. Since the field is an array, this query would never match, causing the system to think the user has no active subscription that includes the requested site or batch.

## Fix
Changed the query to use the `$in` operator to check if the requested site/batch ID is present in the subscription's siteIds/batchIds array:

**File:** `netlify/functions/api.mjs`

1. In `site/open` endpoint (line ~133):
   ```diff
   - const sub = await db.collection('subscriptions').findOne({ userId: user._id, status: 'active', startsAt: { $lte: now() }, expiresAt: { $gt: now() }, siteIds: String(site._id) });
   + const sub = await db.collection('subscriptions').findOne({ userId: user._id, status: 'active', startsAt: { $lte: now() }, expiresAt: { $gt: now() }, siteIds: { $in: [String(site._id)] } });
   ```

2. In `batch/open` endpoint (line ~146):
   ```diff
   - const sub = await db.collection('subscriptions').findOne({ userId: user._id, status: 'active', startsAt: { $lte: now() }, expiresAt: { $gt: now() }, batchIds: String(batch._id) });
   + const sub = await db.collection('subscriptions').findOne({ userId: user._id, status: 'active', startsAt: { $lte: now() }, expiresAt: { $gt: now() }, batchIds: { $in: [String(batch._id)] } });
   ```

## Verification
- The fix ensures that when checking access, the system looks for a subscription where the `siteIds` or `batchIds` array contains the specific site or batch ID being requested.
- Payment approval flow remains unchanged: subscriptions are still created with the correct arrays from `planSnapshot.includedSiteIds` and `planSnapshot.includedBatchIds`.
- No database seeding, demo data modification, or automatic payment approval was performed.
- Existing valid MongoDB records, admin panel, UI, Cloudinary uploads, and payment workflow are preserved.
- Unauthorized, pending, and expired access remain blocked as the query still requires `status: 'active'` and valid date ranges.

## Files Changed
- `netlify/functions/api.mjs` (2 lines changed)

## Remaining Issues
None identified. The fix addresses the specific batch access bug described.