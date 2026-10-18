# Touchline Team

The app for sports teams and clubs: football, basketball, tennis, gymnastics or any other sport. Coaches and players each have their own account.

- **Food tracking**: every meal records calories, protein, carbs and fat. Players type the numbers, describe the meal and let AI work them out, or snap a photo and let AI recognise the food. They can correct the numbers before saving. Photos are not stored. Coaches set daily targets for each player.
- **Coaches** see what each player ate today against their targets, plus their workouts, attendance and form. They take the register after each session with an optional 1–10 rating, set plans, send feedback or instructions (players confirm them), update season stats, and post notices or match-day squads. Alerts flag missed sessions, players who can't make the next session, low protein late in the day, and instructions nobody has confirmed.
- **Players** log meals and workouts, say whether they can make each session, tick off their plan, confirm instructions and see their own attendance, ratings and stats.
- **Accounts**: email and password, with password reset by email. A coach creates a club and gets a 6-character code and an invite link. Players sign up and join with it. The club owner can make other members coaches.
- **Privacy**: players only see their own data. Coaches see everyone's. Only coaches can write ratings, attendance, stats and targets. This is enforced by `firestore.rules` on Firebase's servers.
- A demo team on the sign-in page lets anyone look around first.
- **Legal basics**: privacy policy and terms pages; at sign-up everyone confirms their age, agrees to the terms and separately agrees to coaches seeing their logs; players under 16 need a parent or guardian's name, email and agreement; AI food scanning is only offered to people 16 and over; anyone can download all their data or delete their account; club owners can delete a club and everything in it. If you change the policy or terms, bump `LEGAL_VERSION` in `app.js` and everyone is asked to agree again.

## Before you open it to the public

1. Fill in `site-info.js` (your name or business name, contact email, country, and your Firestore location). The legal pages show a yellow "Draft" warning until you do.
2. Have the privacy policy and terms checked by someone qualified for the country you operate in. They're a solid starting point, not legal advice.
3. Consider upgrading to Firebase's pay-as-you-go (Blaze) plan before selling. On the free plan, Google may use content sent to Gemini to improve its products; on paid plans it doesn't. Update section 3 of `privacy.html` if you switch.

Plain HTML, CSS and JavaScript. No build step.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Page shell |
| `style.css` | Styles |
| `app.js` | The whole app |
| `firebase-config.js` | Your Firebase project's web settings |
| `site-info.js` | Your name, contact email and country, shown in the legal pages |
| `privacy.html`, `terms.html`, `legal.js` | Privacy policy and terms of use |
| `firestore.rules` | Database security rules, pasted into Firebase |

## Set up Firebase (one time)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Create a project** (e.g. "touchline-team"). Google Analytics is optional.
2. **Add a web app**: on the project overview press the **</>** (Web) icon, give it a nickname, skip Hosting, press **Register app**. Copy the `firebaseConfig` values into `firebase-config.js`.
3. **Authentication** → **Get started** → **Email/Password** → enable → **Save**.
4. **Firestore Database** → **Create database** → choose a location near your players → start in **production mode**.
5. **Firestore Database → Rules**: replace everything with the contents of `firestore.rules` → **Publish**.
6. **AI Logic** (for photo and description scanning): open **AI Logic** in the left menu → **Get started** → choose **Gemini Developer API** → follow the prompts. This works on the free Spark plan. Without it, players type the numbers themselves.
7. **Authentication → Settings → Authorized domains**: add the domain the site runs on (e.g. `kassem210.github.io` and any custom domain).

Optional: **Authentication → Templates** changes the password-reset email. **AI Logic → Settings** can turn on App Check so only your website can use your AI allowance.

## Publish with GitHub Pages

1. In this repository: **Settings → Pages** → **Deploy from a branch** → branch `main`, folder `/ (root)` → **Save**.
2. A minute later it's live at `https://<your-username>.github.io/touchline-team/`.
3. For your own domain, type it under **Custom domain** in the same page and add the DNS record your domain company asks for (a CNAME pointing to `<your-username>.github.io`), then tick **Enforce HTTPS**. Remember to add that domain to Firebase's authorized domains too.

## Run it locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

`localhost` is on Firebase's authorized domains list by default.

## Data layout

`users/{uid}` (profile and clubs), `joinCodes/{code}`, and per club `clubs/{clubId}` with `members`, `sessions`, `announcements`, `registers` (coaches only), and per-player `logs`, `plans`, `feedback`, `attendance`, `stats` (stats and nutrition targets) and `rsvp`, each tagged with the player's `uid`.
