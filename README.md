# Skill Duels

Competitive daily mini-games app (React + Vite).

---

## 🚀 Γρήγορο ξεκίνημα (τοπικά)

```bash
npm install
npm run dev
```

Άνοιξε το link που εμφανίζεται (π.χ. `http://localhost:5173`).

---

## 📱 Δοκιμή στο κινητό (ίδιο WiFi — χωρίς deploy)

1. Βεβαιώσου ότι υπολογιστής και κινητό είναι στο **ίδιο WiFi**.
2. Τρέξε:
   ```bash
   npm run dev
   ```
3. Το Vite θα δείξει και ένα **Network** link, π.χ.:
   ```
   ➜  Network: http://192.168.1.5:5173/
   ```
4. Άνοιξε αυτό το link στον browser του κινητού.
5. (iPhone) Πάτα **Share → Add to Home Screen** για να φαίνεται σαν app fullscreen.

> Αν δεν φορτώνει: έλεγξε το firewall του υπολογιστή, ή δοκίμασε το deploy παρακάτω.

---

## ☁️ Deploy στο Vercel (μόνιμο link — ίδιο workflow με το TrackMate)

### Επιλογή A — μέσω GitHub (προτεινόμενο)

1. Φτιάξε ένα νέο repo στο GitHub (π.χ. `skillduels`).
2. Από τον φάκελο του project:
   ```bash
   git init
   git add .
   git commit -m "initial: skill duels app"
   git branch -M main
   git remote add origin https://github.com/nakoutsi-alexandros/skillduels.git
   git push -u origin main
   ```
3. Πήγαινε στο [vercel.com](https://vercel.com) → **Add New → Project** → διάλεξε το repo.
4. Το Vercel αναγνωρίζει αυτόματα Vite. Πάτα **Deploy**.
5. Σε ~1 λεπτό παίρνεις link τύπου `https://skillduels.vercel.app` — άνοιξέ το στο κινητό.

### Επιλογή B — μέσω Vercel CLI (χωρίς GitHub)

```bash
npm install -g vercel
vercel
```

Ακολούθησε τα prompts (login, project name). Σου δίνει το link κατευθείαν.

---

## 🛠 Δομή

```
skillduels-app/
├── index.html          # entry + mobile viewport/PWA meta
├── src/
│   ├── main.jsx        # React entry
│   └── App.jsx         # όλη η εφαρμογή
├── package.json
├── vite.config.js      # host:true για δοκιμή σε κινητό
└── vercel.json
```

---

## ➡️ Επόμενο βήμα: πραγματική native app (Capacitor)

Όταν θες App Store / Play Store + push notifications + Instagram share:

```bash
npm install @capacitor/core @capacitor/cli
npx cap init "Skill Duels" com.nak3d.skillduels
npm run build
npx cap add ios       # χρειάζεται Mac + Xcode
npx cap add android   # χρειάζεται Android Studio
npx cap sync
```

---

## ⚠️ Σημείωση

Τα avatar assets είναι ενσωματωμένα ως base64. Πριν το release, βεβαιώσου ότι έχεις
commercial license για αυτά. Για production, καλύτερα να σερβίρονται ως ξεχωριστά
αρχεία από CDN αντί για base64 (μικρότερο bundle).
