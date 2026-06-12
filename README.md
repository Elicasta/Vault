# Media Vault

Personal media gallery powered by Google Sheets. Each sheet tab = one collection.

## Deploy to Vercel (5 minutes)

### Option A: Vercel CLI (fastest)
```bash
npm i -g vercel
vercel
```
Follow the prompts. Done.

### Option B: GitHub + Vercel UI
1. Push this folder to a new GitHub repo
2. Go to vercel.com → New Project → Import that repo
3. Framework: Next.js (auto-detected)
4. Hit Deploy

No environment variables needed. Everything runs client-side.

---

## Google Sheet Setup

1. Create a Google Sheet
2. Name each tab whatever you want — that becomes the collection name
3. Row 1 of every tab must have these exact headers:

| url | title | note |
|-----|-------|------|
| https://... | My video | optional |

4. File → Share → **Anyone with the link can view**
5. File → **Publish to web** → Entire Document → Publish

Then paste your sheet URL into the app when prompted.

---

## Adding new collections

Add a new tab, name it, add URLs. Hit "Sync" in the app.
