# Before I die

A personal, shareable bucket list. 15 chapters and about 7,400 starter ideas, each one a page where you can write how it felt and attach any number of photos and videos. **View Bucket** plays your life as a full-screen story.

It is a static site (plain HTML, CSS and JavaScript, no build step), so it hosts free on GitHub Pages. Your data lives in a free Supabase project.

## Try it right now (preview mode)

```bash
cd digital-bucketlist
python3 -m http.server 8000      # then open http://localhost:8000
```

With `config.js` empty, everything is saved inside your browser only. Click **Load the starter list** on the first screen. Good for trying things out; nobody else can see it, and clearing site data erases it.

## Publish it (about 15 minutes)

### 1. Create the database
1. Make a free project at <https://supabase.com>.
2. Open `supabase/schema.sql`, change `you@example.com` to **your own email**, copy the whole file.
3. Supabase dashboard > **SQL Editor** > New query > paste > **Run**.

### 2. Create your owner login
Supabase dashboard > **Authentication > Users > Add user > Create new user**. Use the same email as in step 1 and a strong password. Tick "Auto confirm user".

Then **Authentication > Sign In / Providers > Email**: turn **off** "Allow new users to sign up". Only you can write anyway (the security rules check the owners table), but this keeps strangers out entirely.

### 3. Connect the site
Supabase dashboard > **Project Settings > API**. Copy the Project URL and the `anon` public key into `config.js`:

```js
SUPABASE_URL: "https://xxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJ...",
```
The anon key is safe to publish. The security rules decide what it may do.

### 4. Put it on GitHub Pages
1. Create a GitHub repository and upload everything in this folder (keep `.nojekyll`).
2. Repository > **Settings > Pages** > Source: *Deploy from a branch* > `main` / root > Save.
3. Your site opens at `https://<you>.github.io/<repo>/`.

### 5. Fill it
Open your site, click **Owner sign in**, sign in, then on the cover click **Load the starter list** (only shown while the database is empty).

## Using it

- **Home**: progress, chapters, Surprise me, View Bucket (all chapters). Owners can add, edit, delete and rearrange chapters.
- **Chapter page**: tick items, add lines to any section, rename or delete sections, filter, search. View Bucket plays this chapter.
- **Item page**: status stamp and date, place, rating, mood, your story, extra notes (how it tasted, who was there, cost…), tags, unlimited photos and videos with captions and a cover pick. View Bucket plays this chapter starting from this item.
- **Story mode**: tap right or press →, tap left or ←, hold or Space to pause, M for sound, Esc to close. Modes: *Lived* (ticked items), *Dreams* (random untouched ones), *Everything*.
- Press `/` anywhere to search all items.

## Good to know

- **Private chapter**: the "Love and intimacy" chapter starts private (only you see it when signed in). Toggle this per chapter under Edit chapter. Text is protected by the database rules. Photos and videos are stored in a public bucket under unguessable file names, so they are hidden by obscurity, not locks: don't share direct file links for anything sensitive.
- **Limits** on Supabase's free plan: 1 GB of file storage and 50 MB per file. Photos are shrunk in your browser before upload; keep videos short, or trim them first.
- The starter list leaves out meat, fish and egg dishes (see `data/excluded-nonveg.txt`).
- Rebuild the starter list from the markdown parts with `scripts/build_seed.py`.

## Files

```
index.html        page shell        config.js     your Supabase keys
css/styles.css    design            data/seed.json starter list
js/               app, views, data layer (db-supabase.js and db-local.js share one interface)
supabase/schema.sql   tables, security rules, storage bucket
```
