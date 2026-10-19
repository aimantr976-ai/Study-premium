# STUDY PREMIUM — Full-stack package

This project starts from the supplied `index.html` and preserves its dark purple/neon style, animated hero, Primary Sites, Official Sites, Temporary Mirrors, and responsive cards. It adds a same-origin backend, a themed admin panel, account/sign-up UI, plans, QR/UTR payment claims, subscriptions, expiry checks, MongoDB Atlas, Cloudinary image uploads, and Netlify deployment configuration.

## Important before using it

The ZIP is a **setup-ready codebase**, not a live configured service. It cannot connect to your private MongoDB/Cloudinary accounts until you provide environment variables and configure real site links and a real payment QR. Payment approval is manual: a UTR or screenshot alone is not payment proof. An administrator must verify the transaction in their bank/payment-provider records before approving it. No payment is automatically verified in this package.

The existing site cards have placeholder destination URLs. Configure actual authorized destination links in the admin panel before publishing access to users. The sample prices created by `seed:demo` are unpublished draft examples; change them to your real prices before publishing.

## Included features

- Existing `index.html` UI plus appended integration code and responsive modal UI.
- `/admin` — administrator sign-in and dashboard.
- `/account` — user sign-up/login, subscription status, payment history, plans, QR/UTR claim flow.
- MongoDB Atlas collections and indexes for users, sites, batches, plans, payments, subscriptions, settings, notifications, audit logs, and rate limits.
- Secure public signup (always creates a normal user), bcrypt password hashing, HttpOnly session cookie, expiring JWT, server-side admin authorization, database-backed authentication rate limits.
- Admin CRUD for sites, batches, and plans; payment review; users; subscriptions; Cloudinary-linked media; website settings; analytics; notifications; audit logs; CSV export.
- Cloudinary signed uploads for admin images and optional user payment screenshots.
- Subscription entitlements checked by the backend for protected site/batch access; expiration is checked on each access request.
- Manual QR payment workflow with server-side prices, order ID, UTR uniqueness check, approve/reject reason, audit trail, and transactional subscription activation.
- `.env.example`, `.gitignore`, Netlify Functions configuration, build checks, and validation tests.

## Requirements

- Node.js 20 or newer recommended.
- MongoDB Atlas database and connection URI.
- Cloudinary account (optional until you use image/QR uploads; add credentials to enable uploads).
- Netlify account for public deployment.

## Local setup (Windows PowerShell)

1. Extract the ZIP, open the project folder in VS Code, and open a terminal in the folder containing `package.json`.
2. Install dependencies:

   ```powershell
   npm install
   ```

3. Copy the environment example:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Edit `.env` locally and set `MONGODB_URI`, `MONGODB_DB`, and a unique random `JWT_SECRET` of at least 32 characters. Add the Cloudinary values when you are ready to enable image uploads. Never publish `.env` or place secrets in browser JavaScript.
5. Seed editable site cards and unpublished sample plans:

   ```powershell
   npm run seed:demo
   ```

   This only seeds collections that are empty; it does not overwrite existing records. Site destination URLs are intentionally blank, and example plans are unpublished. Update both in the admin panel.

6. Create the first administrator from your terminal environment. Set your actual values only on your own computer:

   ```powershell
   $env:INITIAL_ADMIN_NAME="Your Admin Name"
   $env:INITIAL_ADMIN_EMAIL="your-admin@example.com"
   $env:INITIAL_ADMIN_MOBILE="+919876543210"
   $env:INITIAL_ADMIN_PASSWORD="A-unique-strong-password-of-12plus-chars"
   npm run create-admin
   Remove-Item Env:INITIAL_ADMIN_NAME,Env:INITIAL_ADMIN_EMAIL,Env:INITIAL_ADMIN_MOBILE,Env:INITIAL_ADMIN_PASSWORD
   ```

   Use your own details; the example values are not credentials. The setup script refuses to silently convert an existing account into an administrator. There is no public admin-creation API.

7. Start the local website and Netlify Function runtime together:

   ```powershell
   npm run dev
   ```

   Open the local URL printed by Netlify CLI. Do not open `index.html` as a `file://` URL because a local static file cannot run the API functions.

8. Open `/admin`, sign in using the administrator account, then:
   - Edit each placeholder site and enter its real HTTPS destination URL.
   - Create or edit batches and set their destination URLs.
   - Edit unpublished sample plan names/prices/durations and include the IDs of the sites/batches that each plan grants access to. Copy IDs from the Sites/Batches tables.
   - In **Website Settings**, upload/configure the real payment QR and payment recipient/instructions.
   - Publish only plans whose prices, duration, entitlements, and payment instructions you have checked.
   - Test with a separate normal user account before sharing the site.

## MongoDB Atlas setup

1. Create a database user with the minimum required permissions for the application database.
2. Add your development IP to the Atlas network access list, or use the narrowest appropriate hosted-service access rule. Avoid broad open network rules where possible.
3. Copy the driver connection string to `MONGODB_URI`; URL-encode special characters in the database password.
4. Set `MONGODB_DB=study_premium` (or your chosen database name).
5. The API creates required indexes when it first connects. It does not automatically seed real destination URLs or real payment settings.

## Cloudinary setup

1. Create a Cloudinary account and copy the cloud name, API key, and API secret from the dashboard.
2. Put those values in local `.env` and in Netlify environment variables for production.
3. Uploads are signed by the backend and restricted to separate folders: `study-premium/assets` for admin-managed media and `study-premium/payments` for logged-in payment screenshots. The browser never receives the API secret.
4. The client currently limits uploads to JPG, PNG, WebP, or GIF images up to 5 MB. Free-tier capacity and quotas are provider-controlled and not unlimited.

## Netlify deployment

1. Push this project to GitHub **without `.env` or credentials**.
2. Import the repository into Netlify. `netlify.toml` configures `public` as the publish directory and `netlify/functions` as the Functions directory.
3. In Netlify site settings, add the production values for `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
4. Set the production environment to `production` so the session cookie includes `Secure`.
5. Deploy, then run the seed and admin creation scripts in a trusted environment that has access to the same production MongoDB URI, or use a secured workstation with that URI temporarily configured.
6. Test `/`, `/admin`, `/account`, signup/login, plans, image uploads, and an end-to-end payment review using a small test transaction before inviting users.

The website uses Netlify Functions for the API; the static frontend lives in `public/`. The root `index.html` is also preserved for convenient reference. After deployment, `public/index.html` is the served homepage file. If you edit the homepage, edit `public/index.html` and keep the root copy synchronized if you want it to remain the same.

## Important payment and access behavior

- Prices and included resource IDs come from MongoDB, not from browser-submitted price fields.
- A user must be logged in before requesting a protected destination.
- A plan must be published and must explicitly include the relevant site or batch ID.
- A UTR is only a claim. Admin must personally verify the matching transaction before approving it.
- Approval creates a subscription exactly once in a MongoDB transaction; subscription timestamps are based on admin approval time.
- The backend denies access after `expiresAt`, even if the record has not been cleaned up. Historical payment/account data is not deleted on expiry.
- A link to an externally hosted website cannot stop users sharing a copied external URL. For strong protection, the destination platform must enforce authenticated entitlements too, or content should be served through a protected resource endpoint.
- A static QR image does not dynamically enforce the requested amount. Admin must configure a payment QR suitable for the intended payment process and manually verify the received amount and recipient.

## Test and build commands

```powershell
npm run build
npm test
```

`npm run build` verifies expected frontend/backend files and routing references. `npm test` runs basic input-validation tests. These are not a substitute for live MongoDB, Cloudinary, payment, security, or deployment tests. The project intentionally does not claim a live deployment or verified transaction until you perform those checks.

## API actions

All browser requests post JSON to the same-origin `/api` route with an `action` field. The Function routes are:

- Public/auth: `public/bootstrap`, `public/plans`, `auth/signup`, `auth/login`, `auth/logout`, `auth/me`, `user/account`.
- User access/payment: `site/open`, `batch/open`, `payment/create`, `payment/claim`, `payment/history`, `notification/read`.
- Upload signing: `media/signature` (admin upload or logged-in payment screenshot folder).
- Admin overview/content: `admin/dashboard`, `admin/sites/list|save|delete`, `admin/batches/list|save|delete`, `admin/plans/list|save|delete`.
- Admin finance/accounts: `admin/payments/list|review`, `admin/users/list|status`, `admin/subscriptions/list`.
- Admin management: `admin/settings/get|save`, `admin/media/list`, `admin/notifications/list`, `admin/audit/list`.

All admin actions check the current server-side user role. Unknown actions return an error.

## Known items to configure or extend

- Actual MongoDB Atlas/Cloudinary credentials, real site destinations, payment QR, plan prices, and entitlement mapping must be supplied by the site owner.
- Payment verification is manual. A payment-provider checkout/webhook flow is not configured because no payment provider account/keys were supplied.
- Email verification, email/SMS delivery, password-reset email flow, and automated customer-support integrations are not wired to an email/SMS provider; configure a provider before enabling those workflows.
- No actual production deploy, live credentials, or payment transaction has been tested from this package.
