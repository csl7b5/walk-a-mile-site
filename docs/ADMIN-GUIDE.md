# Walk a Mile — Administrator Guide

Everything you need to run the campaign quarter to quarter. No code required for
day-to-day work; the only place you'll touch Supabase directly is when creating a
login for a new administrator.

- [Before launch](#before-launch)
- [Adding and removing administrators](#adding-and-removing-administrators)
- [Opening and closing the forms each quarter](#opening-and-closing-the-forms-each-quarter)
- [How Mystery Mile voting works](#how-mystery-mile-voting-works)
- [If the site says it can't reach the database](#if-the-site-says-it-cant-reach-the-database)
- [Applying the database migrations](#applying-the-database-migrations)

---

## Before launch

> **Deploy the site and the migrations together.** The migrations stop the live Mystery
> Mile from being publicly readable, and only the updated site knows to fetch it the new
> way. Apply the migrations to a Supabase project whose site is about to be updated, or
> update the site first and apply the migrations within the same maintenance window.
> Old site + new database means the Mystery Mile page looks empty.

Work through this once.

1. **Apply the database migrations.** See [the section below](#applying-the-database-migrations).
   Nothing else in this guide works until they're applied.
2. **Confirm the three administrator email addresses.** The migration seeds
   `lucy.nemcheck@yale.edu`, `isabella.palma@yale.edu`, and `lindsie.boerger@yale.edu`
   using the `firstname.lastname@yale.edu` convention. If anyone's real Yale address
   differs, fix it on the **Administrators** tab — remove the wrong one, add the right one.
3. **Create a Supabase login for each administrator** (step 2 of the next section).
4. **Set the current quarter** on the **Campaign Controls** tab.
5. **Open story submissions** and leave voting closed.
6. **Confirm the keepalive workflow is enabled** under the repository's Actions tab.

---

## Adding and removing administrators

Admin access is two separate things, and someone needs **both** to get in:

| | What it is | Where you set it |
|---|---|---|
| The access list | Permission to use the dashboard | Admin site → **Administrators** tab |
| The login | An email and password to sign in with | Supabase dashboard → Authentication → Users |

Having only the access list means their password never works. Having only a login
means they sign in and are immediately turned away with "This account is not
authorized for admin access."

### Adding someone

**Step 1 — put them on the access list.**
Sign in to `admin.html`, open the **Administrators** tab, enter their name and Yale
email, and click *Add administrator*.

**Step 2 — create their login.**
Open the Supabase dashboard → **Authentication** → **Users** → **Invite user**, and
enter the *same* email address. They'll get an email to set a password. The
Administrators tab links straight to this page.

Capitalisation doesn't matter — `Lucy.Nemcheck@yale.edu` and `lucy.nemcheck@yale.edu`
are treated as the same person. A typo does matter: the two halves won't line up and
they'll be refused at sign-in.

### Removing someone

Click *Remove* on the Administrators tab. They lose dashboard access immediately.

Two things to know:

- **You can't remove yourself.** Sign in as a different administrator to do it. This
  stops you locking yourself out mid-session.
- **You can't remove the last administrator.** If the list were empty, nobody could
  sign in to add anyone back and you'd need the Supabase SQL editor to recover.
- Removing someone from the list doesn't delete their Supabase login. If they've left
  the department entirely, delete the user in Supabase → Authentication → Users too.

---

## Opening and closing the forms each quarter

All of this lives on the **Campaign Controls** tab. There are two switches, and they
work independently:

- **Story submissions** — whether anyone can submit a Conventional Mile or a Mystery Mile.
- **Mystery Mile voting** — whether visitors can guess who the Mystery Miler is.

Both are enforced in the database, not just hidden on the page. Closing a form really
does stop new entries.

### The quarterly cycle

**1. Start of quarter — open for stories**

- Set the **quarter name** and **dates**. *Prefill next quarter* fills in sensible
  values; check them and click *Save quarter*.
- Turn **Story submissions** ON.
- Turn **Mystery Mile voting** OFF.

The dates matter: the voting ballot is built from the Mystery Milers who submitted
between them. Roll the quarter forward and last quarter's names drop off automatically.

**2. Collection closes — pick your features**

- Turn **Story submissions** OFF.
- Go to the **Pending Review** tab. For each Conventional Mile, choose *Feature*,
  *Archive*, or *Reject*.
- Go to the **Mystery Mile** tab and click *Set as the Live Mystery* on the one entry
  you want to run this quarter. Only one should be live at a time.

**3. Voting opens**

- Turn **Mystery Mile voting** ON.
- Announce it. The Mystery Mile page now shows the shoe photo, the three clues, and
  the ballot.

**4. Reveal**

- Turn **Mystery Mile voting** OFF first. Results stay visible; only new guesses stop.
- On the **Mystery Mile** tab, click *Reveal* on the live entry. It suggests the
  submitter's real name — confirm or edit it, and it's published to *Past Mystery Milers*.

Then start again at step 1 for the new quarter.

### What visitors see when a form is closed

- **Submissions closed** — the Submit page shows a "Submissions are closed right now"
  card pointing them at the Archive and the Mystery Mile.
- **Voting closed** — the Mystery Mile page still shows the shoe, the clues, and the
  running results, but the ballot and the vote button are gone.

### Common questions

**Can I open voting while submissions are still open?** Yes, they're independent. Be
aware the ballot grows as new people submit.

**What if I forget to close submissions?** Nothing breaks. Late entries land in
Pending Review, and anyone who submits a Mystery Mile inside the quarter window joins
the ballot — which can make the guess harder mid-vote. Closing on schedule is cleaner.

**Can I re-open voting after a reveal?** You can, but once an entry is revealed it's
archived and no longer the live mystery, so there's nothing to vote on. Feature a new
Mystery Mile instead.

---

## How Mystery Mile voting works

**The ballot** lists everyone who submitted a **Mystery Mile during the current
quarter**, in a shuffled order that carries no hint about who's who. It used to list
conventional storytellers from all time, which meant the correct answer often wasn't
even on the ballot.

Only entries inside the quarter window appear. The live mystery is always included even
if it was carried over from a previous quarter, so the right answer is always pickable.

**The answer stays hidden.** The live Mystery Mile is served without the submitter's
name attached, and it's identified publicly by a throwaway reference rather than its
real database id. Vote records aren't publicly readable either. There's no combination
of requests a visitor can make to work out which ballot entry is the mystery.

> This was previously not the case. The live mystery's row was readable through the
> public API with the submitter's real name in it, so anyone who opened the browser's
> network tab could spoil the game. Fixed as part of this work.

**One vote per browser**, tracked by a key stored in the visitor's browser. People can
change their guess while voting is open. Someone determined to vote twice can clear
their browser storage or use another device — the same as before. Fixing that properly
needs Yale SSO, which is the natural next step if the guessing ever becomes competitive
enough to matter.

---

## If the site says it can't reach the database

The Supabase free tier **pauses a project after about a week with no activity**. While
it's paused the site can't load stories and shows an amber banner explaining that the
database may be asleep, with a Retry button. The page also retries by itself a few
times in the background — a paused project usually wakes within a minute of the first
request.

**To stop it happening**, `.github/workflows/keepalive.yml` pings the database every
other day from GitHub Actions. It reads the project URL and key from
`js/supabase-config.js`, so there's nothing to configure, and you can trigger it by
hand any time from the repository's **Actions** tab → *Keep Supabase awake* → *Run workflow*.

**One catch worth diarising:** GitHub automatically disables scheduled workflows in
repositories that have had no activity for 60 days. If nobody commits for two months
the keepalive stops silently. Either push something occasionally or check the Actions
tab each quarter when you roll the campaign forward.

**If it's already paused**, open the Supabase dashboard and click *Restore project*.
It takes a couple of minutes.

**Belt and braces (optional).** A free external monitor is a reasonable backup because
it doesn't depend on repository activity. Point [UptimeRobot](https://uptimerobot.com)
or [cron-job.org](https://cron-job.org) at:

```
https://invkopcqflnncbxzvbif.supabase.co/rest/v1/submissions?select=id&limit=1
```

with an `apikey` header set to the publishable key from `js/supabase-config.js`, on a
daily interval. That key is already public — it ships to every visitor's browser — so
there's no secret to protect here.

---

## Applying the database migrations

Files live in `supabase/migrations/`. The four added for this round of work are:

| File | What it does |
|---|---|
| `20260728000000_admin_management.sql` | Case-insensitive admin checks, self-serve admin roster, seeds the three administrators |
| `20260728010000_campaign_settings.sql` | Quarter window and the open/close switches, enforced on submissions |
| `20260728020000_quarterly_mystery_voting.sql` | Quarter-scoped ballot, hides the mystery miler's identity |
| `20260728030000_mile_numbers.sql` | Assigns Mile numbers in the database |

**Easiest route — the SQL editor.** Open the Supabase dashboard → **SQL Editor**, paste
the contents of each file, and run them **in filename order**. They're written to be
safely re-runnable, so running one twice won't break anything.

**With the CLI**, if it's set up:

```bash
supabase link --project-ref invkopcqflnncbxzvbif
supabase db push
```

### Checking it worked

Run this in the SQL editor:

```sql
select quarter_label, submissions_open, voting_open from public.campaign_settings;
select email, display_name from public.app_admins order by email;
```

You should see one settings row (submissions and voting both closed, which is the safe
default) and your administrators.

---

## A note on Mile numbering

Mile numbers used to be worked out in the visitor's browser by counting the published
stories it could see. Because pending stories aren't publicly visible, everyone who
submitted between two publishes got the *same* number.

Numbers are now assigned by the database at the moment you **Feature** or **Archive** a
story, so:

- Pending stories show "Mile #—" until you publish them. That's expected.
- Numbers follow the order you publish in, with no gaps. Rejected stories never use one up.
- Re-publishing a story keeps its original number.

Existing numbers are left alone; new ones continue from the highest already in use.
