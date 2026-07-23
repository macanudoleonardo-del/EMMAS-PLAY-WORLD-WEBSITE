# EMMAS-PLAY-WORLD-WEBSITE

Official website for **Emma's Play World** — a parent-managed, multilingual children's movement led by Emma, a premature-heart survivor and little global leader. *Love Creates Harmony.*

- 🌐 Live: https://emmasplayworld.com
- 🗣️ Languages: English · Español · 中文 · 한국어 (header dropdown, English fallback)
- ⚙️ Static site — HTML / CSS / JS, **no build step**, no dependencies.

## Files
| File | Purpose |
|---|---|
| `index.html` | The full one-page site |
| `styles.css` | Styling (logo palette, light + dark) |
| `script.js` | Language switcher, dark mode, contact form |
| `robots.txt` / `sitemap.xml` | SEO + AI-crawler access |
| `images/` | Logo + photos (see `images/README.txt`) |
| `CNAME` | Binds the custom domain for GitHub Pages |

## Run locally
Open `index.html` in a browser, or serve the folder with any static server.

## Deploy — GitHub Pages
1. Push this repo to GitHub.
2. **Settings → Pages →** Deploy from branch **`main`**, folder **`/ (root)`**.
3. Custom domain: **emmasplayworld.com** (a `CNAME` file is included). Then add the DNS records at GoDaddy:
   - **A** `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - **CNAME** `www` → `macanudoleonardo-del.github.io`
4. In Pages settings, tick **Enforce HTTPS** once the certificate is issued.

(Alternative hosts: Vercel / Netlify / Cloudflare Pages — connect the repo, root directory = repository root.)

## Still to add
- Save `logo.png`, `emma-hero.jpg`, `emma-graduation.jpg` into `images/` (the site shows friendly placeholders until then).
