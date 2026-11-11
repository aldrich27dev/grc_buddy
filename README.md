# GRCBuddy 🚀

Touching Hearts, Renewing Minds — a real-time student matching and chat platform for Global Reciprocal Colleges.

GRCBuddy pairs students based on shared interests, then gives them a private one-to-one chat room. Students use nicknames, so conversations stay anonymous without feeling impersonal.

## Tech stack

- **Frontend:** React 19 + Vite 8
- **Styling:** Tailwind CSS 4
- **Icons:** Lucide React
- **Backend:** Firebase Authentication (invisible anonymous guest session) + Cloud Firestore
- **Deployment:** GitHub Pages

## No sign-in or sign-up screens

GRCBuddy does not show a login or registration screen. On first load it opens an anonymous Firebase guest session in the background only so Firestore rules can identify each browser. Students go straight to the profile and matching screen. Clearing site data starts a new anonymous identity.

## How it works

1. On first load the app opens an invisible anonymous Firebase session. Students never create an account or enter a password.
2. A student picks a nickname, year, course, gender, city, and 3–5 interests.
3. The app looks for a waiting room with overlapping interests and claims it atomically with a Firestore transaction.
4. If nobody is waiting, the student gets a waiting room of their own. The room stays alive through a heartbeat and expires after about five minutes without one.
5. The waiting student sees the match immediately when someone claims the room, and both students enter the private chat.
6. Messages are limited to participants by Firestore security rules. Read receipts, typing indicators, replies, and reactions are all stored in Firestore.
7. Rooms and messages carry an `expiresAt` field. The free Spark plan does not include TTL deletes, so the matcher filters expired waiting rooms out with a server-side range query instead.

## Shoutout banner

Students can book a short message that appears on the lobby and chat banners.

| Duration | Price |
| --- | --- |
| 1 hour | ₱25 |
| 3 hours | ₱60 |
| 6 hours | ₱80 |
| 12 hours | ₱140 |

The payment contact is **@hotdogsasopas** on Telegram. To change it, edit `DEFAULT_TELEGRAM_USERNAME` in `src/constants/shoutouts.js` (or set `VITE_TELEGRAM_USERNAME` at build time) and redeploy.

### How a request works

1. A student taps **Book now** on the banner and writes up to 120 characters.
2. They choose a duration. The form checks active and scheduled banners:
   - If the current time is free, it says the banner can start after payment approval.
   - If a shoutout is already running or scheduled, it shows the next free start time and tells the student their banner will be queued there.
3. The app saves a `pending` document in the `shoutouts` collection with `requestedStartAt` and `requestedEndAt`.
4. The student opens Telegram with a prefilled message containing the request ID, duration, price, banner text, and requested slot, then sends the payment.
5. The owner verifies the payment on Telegram, then approves the request from the hidden admin page (or the Firebase Console as a fallback). Approval automatically places the banner after any active or scheduled banner, so only one shows at a time.
6. Only one shoutout shows at a time. The banner appears automatically and disappears when `endsAt` passes. No Cloud Function or TTL policy is needed.

### Approving requests from a phone

Approval works without a password or a laptop. Each device is authorized once by adding its Firebase UID to the `admins` collection.

1. On your phone, open `https://aldrich27dev.github.io/grc_buddy/#admin`.
2. The first visit shows **Authorize this device** with a **Device ID**.
3. In **Firebase Console → Firestore Database**, create a collection named `admins` and use that Device ID as the document ID. Any label fields are fine.
4. Tap **I added it — retry** on the phone. The dashboard opens and shows pending requests.
5. Match the request with the Telegram payment message, confirm the payment, then tap **Approve & post**. The page computes `startsAt`/`endsAt` from the queue, so you do not need to edit timestamps.
6. Use **Reject** for unpaid or invalid requests, and **Stop** to end a live banner early.
7. To revoke a device, delete its document from the `admins` collection.

The admin route is not linked from the student UI and is marked `noindex`. It only grants shoutout approval; students still have no sign-in or sign-up screen.

### Approving a request in the Firebase Console

The console remains a fallback if the admin page is unavailable.

1. Open **Firebase Console → Firestore Database → shoutouts**.
2. Open the pending request and match its **Request ID** with the Telegram payment message.
3. Edit these fields (keep the Firestore types shown):
   - `status`: string → `active`
   - `startsAt`: timestamp → the request's `requestedStartAt`
   - `endsAt`: timestamp → the request's `requestedEndAt`
   - `approvedAt`: timestamp → the current date/time
4. If the requested start time has already passed, use the current time for `startsAt` and add `durationMs` for `endsAt` instead.
5. If another banner was approved after the request was submitted, move the slot after that banner. The form's requested slot is an estimate, because two students can request at the same time.
6. Save the document. The banner updates within a few seconds.
7. To reject a request, set `status` to `rejected` or delete the document.

`startsAt` and `endsAt` are what control the queue. A future `startsAt` means the banner is scheduled but not visible yet. `endsAt` is required for the banner to show; an active request with no future `endsAt` is ignored by the public query and by Firestore rules.

The first deployment also creates the `shoutouts` composite index on `(status ASC, endsAt ASC)`. Wait for it to finish building before testing the banner.

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill in `.env.local` with the Firebase web app configuration from **Firebase Console → Project settings → Your apps**.

### Required Firebase setup

1. **Enable Anonymous Authentication**
   - Firebase Console → **Authentication** → **Sign-in method** → **Anonymous** → Enable.
   - This is backend-only: the app has no login or registration UI.
   - Without this step the app shows a setup screen instead of the lobby.

2. **Create a Firestore database**
   - Firebase Console → **Firestore Database** → Create database.

3. **Deploy the security rules and index**
   - Install/login to the Firebase CLI once:
     ```bash
     npx firebase-tools login
     ```
   - Deploy:
     ```bash
     npm run deploy:rules
     ```
   - This publishes both `firestore.rules` and `firestore.indexes.json`. The matcher needs the `(status ASC, expiresAt ASC)` composite index on `rooms`, and the shoutout banner needs `(status ASC, endsAt ASC)` on `shoutouts`; wait for both to finish building before testing.

4. **Optional: clear rooms from the previous version**
   - The new matcher stores participant UIDs and an `expiresAt` field on every room.
   - Rooms created by the old version do not have those fields. They are already ignored by the new matcher, so deleting them is only housekeeping.

### Free Spark plan notes

This project is designed to run without billing enabled:

- **No Cloud Functions and no TTL policies.** TTL deletes require a paid Firebase plan.
- Matching reads at most **25 active waiting rooms** per search and excludes expired or legacy rooms in the query.
- Heartbeats run every **60 seconds**. Waiting rooms expire after **5 minutes** without a heartbeat, and active chats expire after **10 minutes** without one.
- The chat loads **30 messages at a time** to keep reads low. Older messages load only when a student taps "Load earlier messages".
- The shoutout banner subscribes to at most **10 active banners**. Pending requests are checked only when a student opens the shoutout form.
- Spark quotas reset daily and include 50,000 document reads, 20,000 writes, 20,000 deletes, and 1 GiB of storage. If a daily quota is exceeded, that Firestore product is paused until the next reset.
- TTL cleanup is optional only after upgrading to Blaze. At that point, add TTL policies for `expiresAt` on the `rooms` and `messages` collection groups.

### Local preview with emulators (no Firebase setup needed)

For a fully local preview that never touches production data:

```bash
npm run emulators
```

Then, in a second terminal:

```bash
npm run dev:emulator
```

Open `http://127.0.0.1:5173/grc_buddy/`. The Auth and Firestore emulators use the same security rules as production, and the Emulator UI is available at `http://127.0.0.1:4000/`.

### Environment variables

See `.env.example`:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Firebase web API keys are public identifiers, not secrets. The security boundary is the Firestore rules and Firebase Authentication.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run emulators` | Start the local Auth and Firestore emulators |
| `npm run dev:emulator` | Start Vite against the local emulators |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |
| `npm run deploy:rules` | Deploy `firestore.rules` and `firestore.indexes.json` |
| `npm run deploy` | Build and publish `dist` with `gh-pages` |

## Deployment

The GitHub Actions workflow deploys `main` to GitHub Pages. Add these repository secrets under **Settings → Secrets and variables → Actions**:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

A separate CI workflow runs lint and build on pull requests.

## Security notes

- Every read/write requires an invisible anonymous Firebase session. There is no sign-in or sign-up UI.
- Waiting rooms are readable by signed-in students so they can be matched.
- Once a room is full, only its two participants can read it.
- Rooms and messages are tied to Firebase UIDs; a nickname is only a display name.
- Room claims run in a Firestore transaction, so two students cannot join the same room.
- Messages can only be read/created by participants, with a 1,000-character limit enforced in the rules.
- A user cannot claim a room that is already full, expired, or their own.
- Room and message updates are restricted to specific fields, so clients cannot inject extra data.
- Students can only create **pending** shoutout requests. Only authorized admin devices or the Firebase Console can approve, extend, reject, or stop a shoutout.
- Pending shoutout requests are readable only by the student who submitted them and by authorized admin devices. Active banners are readable by signed-in students until `endsAt`.
- Admin devices are listed as `admins/{uid}` documents created manually in the Firebase Console. A device can only check its own document; clients cannot list, create, or modify admin documents.
- Each browser keeps its own anonymous identity; clearing site data starts a new identity.

## Current limitations

- Moderation/reporting is not implemented yet.
- Shoutout payments are verified manually in Telegram and approved from the hidden admin page. Automatic payment verification would require a server or payment webhook outside the free Spark plan.
- Expired shoutout documents stay in Firestore until deleted manually. The banner query excludes them, so they do not appear or cost reads.
- On the Spark plan, expired waiting rooms are filtered out of matching, but expired rooms and messages are not automatically deleted. Delete old data manually or enable TTL after upgrading to Blaze.
- Matching scans at most 25 active waiting rooms per search, which is fine for a college-sized audience. Server-side matching can replace it if the queue grows much larger.
- Anonymous auth helps with rules and identity, but it is not a substitute for school-email verification or content moderation.
- The app is tuned for Spark quotas (50,000 reads, 20,000 writes, 20,000 deletes per day, 1 GiB storage). If a daily quota is exceeded, Firestore pauses until the next reset.
