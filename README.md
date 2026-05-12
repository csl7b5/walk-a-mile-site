# Walk a Mile
### Yale Department of Anesthesiology · Office of Collaborative Excellence

> *Every Step Has a Story. Walk It Together.*

---

## Table of Contents

1. [What This Is](#what-this-is)
2. [Architecture Overview](#architecture-overview)
3. [File Structure](#file-structure)
4. [Requirements](#requirements)
5. [How Data Works](#how-data-works)
6. [Deployment Instructions](#deployment-instructions)
   - [Option A — Netlify (Recommended, Free)](#option-a--netlify-recommended-free)
   - [Option B — GitHub Pages](#option-b--github-pages)
   - [Option C — WordPress Hosting / cPanel](#option-c--wordpress-hosting--cpanel)
   - [Option D — Any Static File Host](#option-d--any-static-file-host)
7. [Configuration — Qualtrics Links](#configuration--qualtrics-links)
8. [Admin Guide](#admin-guide)
9. [Monthly Maintenance](#monthly-maintenance)
10. [Upgrading to a Real Backend](#upgrading-to-a-real-backend)
11. [Browser Support](#browser-support)
12. [Credits & Contacts](#credits--contacts)

---

## What This Is

Walk a Mile is a **fully static, single-file web application** — a monthly storytelling campaign hub for the Yale Department of Anesthesiology. It requires no server, no database, no backend, and no build process. It is a single HTML file with embedded CSS and JavaScript.

The site includes five sections:

| Section | Description |
|---------|-------------|
| **Home Hub** | Campaign landing page with animated footprint hero, stats, featured Miles, and action cards |
| **Submit** | Multi-step submission form with two journeys: Conventional Mile (named story) and Mystery Mile (anonymous clues + shoe photo) |
| **Archive** | Filterable gallery of all published Miles with full story modal |
| **Mystery Mile** | Monthly anonymous clue display, department voting, and past mystery gallery |
| **Admin Dashboard** | Submission management (feature / archive / reject), CSV export |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Walk a Mile Website                     │
│                                                         │
│   index.html  ◄── Single file: HTML + CSS + JavaScript │
│                                                         │
│   ┌─────────────────────────────────────────────────┐  │
│   │              In-Browser Data Layer              │  │
│   │                                                 │  │
│   │   localStorage (key: wam_submissions_v2)        │  │
│   │   ├── Submission objects (JSON array)           │  │
│   │   └── Vote tallies (JSON object)                │  │
│   │                                                 │  │
│   │   ⚠ Data lives in the visitor's browser only.  │  │
│   │   See "Upgrading to a Real Backend" to persist  │  │
│   │   data across users and sessions.               │  │
│   └─────────────────────────────────────────────────┘  │
│                                                         │
│   External dependencies (loaded from CDN, no install):  │
│   └── Google Fonts (Cormorant Garamond, DM Sans,        │
│        DM Mono) — requires internet connection          │
└─────────────────────────────────────────────────────────┘
```

### Key design decisions

- **No framework.** Vanilla HTML, CSS, and JavaScript only. Zero npm, zero build step, zero dependencies to install.
- **No server required.** Open `index.html` in any browser and it works. Host it anywhere that serves HTML files.
- **localStorage for demo data.** Submissions, votes, and admin actions persist within a single browser session and across page refreshes on the same device. They do not sync across users or devices. This is intentional for the prototype — see [Upgrading to a Real Backend](#upgrading-to-a-real-backend) when you are ready to go live.
- **Single-page application (SPA).** All five sections are rendered inside one HTML file. Navigation is handled by showing and hiding `<div class="page">` elements — no page reloads.

---

## File Structure

```
walk-a-mile-site/
│
├── index.html              ← The entire application. This is the only file
│                             you MUST deploy. Everything else is optional.
│
├── sharepoint-embed.html   ← Simplified SharePoint-compatible version.
│                             Pure HTML/CSS, no JavaScript. For Yale intranet
│                             embed or Content Editor Web Part.
│
├── styles.css              ← Design token reference only. Styles are
│                             embedded in index.html for portability.
│
├── _redirects              ← Netlify routing config (SPA fallback)
├── netlify.toml            ← Netlify deployment config (headers, caching)
├── .htaccess               ← Apache config (cPanel, WordPress, shared hosting)
│
└── README.md               ← This file
```

> **The minimum deployment is a single file: `index.html`.** All other files are platform-specific helpers.

---

## Requirements

### To run the website

| Requirement | Details |
|-------------|---------|
| A web host | Any service that serves static HTML files (see Deployment Options) |
| Internet access for visitors | Required to load Google Fonts from CDN. The site functions without fonts but will fall back to system serif/sans-serif. |
| A modern browser | Chrome 90+, Firefox 88+, Safari 14+, Edge 90+ |

### What you do NOT need

- Node.js, Python, PHP, or any server-side language
- A database (MySQL, PostgreSQL, MongoDB, etc.)
- npm, yarn, or any package manager
- A build tool (Webpack, Vite, etc.)
- Docker or any container
- An API server

### For production use (connecting to Qualtrics)

Once your Qualtrics surveys are built, you replace three placeholder strings in `index.html` with your real survey URLs. No other code changes required.

| Placeholder | Replace with |
|-------------|-------------|
| `QUALTRICS_CONV_LINK` | Your Conventional Mile Qualtrics survey URL |
| `QUALTRICS_MYST_LINK` | Your Mystery Mile Qualtrics survey URL |
| `QUALTRICS_VOTE_LINK` | Your monthly Mystery Mile vote survey URL |

---

## How Data Works

### Current implementation (localStorage)

All submission data is stored in the visitor's browser using `localStorage`. This means:

- A submission made on Device A is visible only on Device A
- If a visitor clears their browser data, all submissions are lost
- The Admin dashboard only shows submissions made in the same browser
- This is correct for a **prototype or demo** — it lets you test the full flow without a backend

### localStorage keys

| Key | Contents |
|-----|----------|
| `wam_submissions_v2` | JSON array of all submission objects |
| `wam_votes_v1` | JSON object with vote tallies and current user vote |

### Submission object schema

```json
{
  "id": "sub_1715000000000",
  "submittedAt": "2025-05-09T12:00:00.000Z",
  "status": "pending",
  "type": "conv",
  "mileNumber": 1,
  "name": "Dr. Jane Smith",
  "campus": "Yale New Haven Hospital — York Street",
  "role": "Faculty",
  "theme": "Hidden Talents",
  "questions": ["Question 1 text", "Question 2 text", "Question 3 text"],
  "answers": ["Answer 1", "Answer 2", "Answer 3"]
}
```

For Mystery Mile submissions, additional fields:

```json
{
  "type": "myst",
  "promptSet": 2,
  "promptQuestions": ["Clue Q1", "Clue Q2", "Clue Q3"],
  "photo": "data:image/jpeg;base64,..."
}
```

---

## Deployment Instructions

### Option A — Netlify (Recommended, Free)

Netlify is the fastest way to get a public URL. Takes 2 minutes. Free tier is sufficient.

**Method 1: Drag and Drop (no account required initially)**

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag the entire `walk-a-mile-site/` folder onto the page
3. Netlify generates an instant URL (e.g. `https://cheerful-sundae-abc123.netlify.app`)
4. Share that URL

**Method 2: GitHub + Netlify (recommended for ongoing updates)**

1. Push this folder to a GitHub repository (see Option B below)
2. Go to [app.netlify.com](https://app.netlify.com) → New site from Git
3. Connect your GitHub account and select the repository
4. Build settings: leave blank (no build command, publish directory = `.`)
5. Click Deploy
6. Netlify auto-deploys every time you push to GitHub

**Custom domain on Netlify:**

1. Site Settings → Domain Management → Add custom domain
2. Add a CNAME record at your DNS provider pointing to your Netlify URL
3. Netlify provisions a free SSL certificate automatically

---

### Option B — GitHub Pages

Free hosting directly from a GitHub repository.

**Steps:**

1. Create a new repository at [github.com/new](https://github.com/new)
   - Name it `walk-a-mile` (or anything you like)
   - Set to Public (required for free GitHub Pages)
2. Upload all files from `walk-a-mile-site/` to the repository root
   - You can drag and drop files directly in the GitHub web interface
   - Or use Git: `git init`, `git add .`, `git commit -m "Initial deploy"`, `git push`
3. Go to your repository → Settings → Pages
4. Under Source, select: `Deploy from a branch` → `main` → `/ (root)`
5. Click Save
6. Your site will be live at `https://[your-username].github.io/walk-a-mile/` within 2 minutes

**Notes for GitHub Pages:**
- The `_redirects` file is Netlify-specific and not needed here
- GitHub Pages serves static files natively — no additional configuration required
- The `.htaccess` file is ignored by GitHub Pages (it uses nginx, not Apache)

---

### Option C — WordPress Hosting / cPanel

For shared hosting providers (Bluehost, SiteGround, DreamHost, HostGator, GoDaddy, etc.) or any cPanel environment.

**Steps:**

1. Log in to your hosting control panel (cPanel or equivalent)
2. Open File Manager → Navigate to `public_html/` (or your domain's root folder)
3. Create a new subfolder if desired (e.g. `walk-a-mile/`)
4. Upload these files into that folder:
   - `index.html` ← required
   - `.htaccess` ← required for routing
   - `netlify.toml` ← not needed, skip
   - `_redirects` ← not needed, skip
5. Your site is live at `https://yourdomain.com/walk-a-mile/`

**WordPress note:** If your domain runs WordPress, do NOT upload to `public_html/` root — that will conflict with WordPress. Upload to a subfolder (e.g. `public_html/walk-a-mile/`) instead.

**FTP alternative:** Use an FTP client (FileZilla is free) to upload files if File Manager is unavailable.

---

### Option D — Any Static File Host

Walk a Mile works on any service that hosts static HTML files. Upload `index.html` and the `.htaccess` or equivalent routing config for your platform.

| Platform | Instructions |
|----------|-------------|
| **Vercel** | `npx vercel` in the project folder, or drag-drop at vercel.com/new |
| **Firebase Hosting** | `firebase init hosting` → set public dir to `.` → `firebase deploy` |
| **AWS S3 + CloudFront** | Upload to S3 bucket with static website hosting enabled. Set index document to `index.html` |
| **Azure Static Web Apps** | Connect GitHub repo in Azure portal → auto-deploy on push |
| **Squarespace** | Not recommended — Squarespace does not support custom HTML application hosting |
| **Wix** | Not recommended — Wix does not allow external HTML file hosting |

---

## Configuration — Qualtrics Links

Once your Qualtrics surveys are live, open `index.html` in a text editor (VS Code, Notepad++, TextEdit) and find-and-replace the three placeholder strings:

```
Find:     QUALTRICS_CONV_LINK
Replace:  https://yalesurvey.ca1.qualtrics.com/jfe/form/YOUR_CONV_SURVEY_ID

Find:     QUALTRICS_MYST_LINK
Replace:  https://yalesurvey.ca1.qualtrics.com/jfe/form/YOUR_MYST_SURVEY_ID

Find:     QUALTRICS_VOTE_LINK
Replace:  https://yalesurvey.ca1.qualtrics.com/jfe/form/YOUR_VOTE_SURVEY_ID
```

Save the file and re-upload to your host. The links appear in multiple places in the file — find-and-replace will catch all of them.

---

## Admin Guide

The Admin Dashboard is accessible by clicking the **⚙️ Admin** button in the top-right navigation.

> ⚠️ **Security note:** In the current implementation, there is no password on the Admin panel. Anyone who visits the site can access it. For production use, see [Upgrading to a Real Backend](#upgrading-to-a-real-backend) for how to add authentication.

### Admin actions

| Action | What it does |
|--------|-------------|
| ⭐ Feature | Moves submission to Featured status — appears on Home Hub and Archive |
| 📦 Archive | Moves to Archive — visible in Archive grid, not on Home Hub |
| ✕ Reject | Hides from all public views |
| 👁 View | Opens full story modal |
| 🎉 Reveal (Mystery) | Prompts for the Mystery Miler's name and archives with reveal |
| ⬇ Export | Downloads all submission data as a CSV file |

### CSV Export

Click **Export All Data** in the Admin header. This downloads a `walk-a-mile-submissions.csv` file containing all submission fields. Open in Excel or Google Sheets.

---

## Monthly Maintenance

Each month, the following updates keep the site current:

### 1. Update stats (Home Hub)
In `index.html`, find the `buildHubStats()` function — stats update automatically from localStorage. In production with a real backend, this would pull from your API.

### 2. Feature submissions
Log in to Admin → Pending Review → click ⭐ Feature on selected submissions. Featured submissions automatically appear on the Home Hub.

### 3. Update Mystery Mile
Log in to Admin → Mystery Mile tab → click ⭐ Set as This Month's Mystery on the selected submission. The shoe photo and clues auto-populate the Mystery Mile voting page.

### 4. Reveal the Mystery Miler
At month end → Admin → Mystery Mile → click 🎉 Reveal → enter their name. The submission moves to the Past Mysteries gallery.

### 5. For SharePoint users
Update `sharepoint-embed.html` manually each month:
- Paste the new clue answers into the `.wam-clue-a` divs
- Update the shoe photo
- Update featured mile cards
- Update stats bar numbers

---

## Upgrading to a Real Backend

When you are ready to move from prototype to production — so that submissions are shared across all users and devices — replace the `localStorage` calls with API calls. All integration points are marked with comments in the code.

### Recommended stack

| Need | Recommended solution |
|------|---------------------|
| Database | Airtable (no-code, free tier) or Supabase (PostgreSQL, free tier) |
| File storage (shoe photos) | Cloudinary (free tier) or AWS S3 |
| Auth for Admin | Netlify Identity, Clerk, or Yale SSO |
| Backend API | Netlify Functions (serverless, free tier) or Supabase Edge Functions |

### What to replace in the code

Search for these comments in `index.html`:

```javascript
// IT NOTE: Replace localStorage calls with fetch() to your intranet API
// IT NOTE: Replace submission handlers with POST to your backend
// IT NOTE: Admin page should be gated by SSO role check
// IT NOTE: Photo uploads should go to your file storage (not base64)
// IT NOTE: Votes should be server-side deduplicated by user session
```

Each comment is immediately above the code that needs to be replaced.

### Minimal Airtable integration example

```javascript
// Replace addSubmission() in index.html with:
async function addSubmission(sub) {
  const response = await fetch('https://api.airtable.com/v0/YOUR_BASE_ID/Submissions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_AIRTABLE_API_KEY',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: sub }),
  });
  const data = await response.json();
  return data;
}
```

---

## Browser Support

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome | 90+ | Full support |
| Firefox | 88+ | Full support |
| Safari | 14+ | Full support |
| Edge | 90+ | Full support |
| Internet Explorer | ❌ Not supported | IE does not support CSS custom properties or modern JS |

The animated footprint canvas requires `requestAnimationFrame` — supported in all modern browsers.

---

## Credits & Contacts

**Campaign:** Walk a Mile  
**Organization:** Yale Department of Anesthesiology, Office of Collaborative Excellence  
**Campaign Lead:** Donna-Ann (fill in contact details)  
**Tagline:** Every Step Has a Story. Walk It Together.

**Technology:**
- Fonts: [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond), [DM Sans](https://fonts.google.com/specimen/DM+Sans), [DM Mono](https://fonts.google.com/specimen/DM+Mono) via Google Fonts
- No frameworks, libraries, or third-party JavaScript
- Built as a static single-page application

**Survey platform:** Yale Qualtrics  
**Intranet platform:** Yale SharePoint  
**Survey build specification:** See `walk-a-mile-qualtrics-spec.docx`

---

*Walk a Mile · Yale Department of Anesthesiology · Office of Collaborative Excellence*
