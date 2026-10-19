# Changes Made

## Root Cause
In the `site/open` and `batch/open` API endpoints, the authorization check was converting the MongoDB ObjectId from the site/batch document to a string and then checking if that string existed in the subscription's `siteIds` or `batchIds` array. Although the subscription stores these IDs as strings (copied from the plan snapshot at payment time), there was a potential mismatch due to subtle differences in string formatting (e.g., whitespace) between the validated request ID and the document-derived string.

## Fix
Changed the authorization checks to use the validated ID string directly from the request body (`body.siteId` or `body.batchId`) instead of converting the document's `_id` to a string. This ensures we are comparing the exact same string that was validated and used to fetch the document.

### Files Modified
- `netlify/functions/api.mjs`:
  - Line 133: Changed `siteIds: { $in: [site._id.toString()] }` to `siteIds: { $in: [body.siteId] }`
  - Line 146: Changed `batchIds: { $in: [batch._id.toString()] }` to `batchIds: { $in: [body.batchId] }`

## Verification
- Preserves existing valid purchase records (no data reset or seeding).
- Does not grant access to other batches/sites under the same plan/site.
- Maintains all other authorization checks (user ID, active status, expiry).
- Approved payments and active subscriptions are now correctly recognized for the exact batch/site purchased.