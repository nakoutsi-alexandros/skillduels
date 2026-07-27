import { useState, useEffect, useRef } from "react";
import { hasSupabase, getExistingSession, signInAsGuest, signUpWithEmail, signInWithEmail, signInWithGoogle, linkGoogleIdentity, signOutAccount, getProfile, setNickname, updateAvatar, getMySeasonScore, claimDailyBonus, getWalletState, claimGameCoins, claimRewardDrop, purchaseCosmetic, equipCosmetic, saveDailyRun, getDailyRun, getMyStreak, fetchLeaderboard, deleteAccount, startGameAttempt, recordGameScore, getDuelableTargets, startDuel, settleDuel, getNotifications, markNotificationsRead } from "./lib/supabase";
import { pad2, utcDayKey, utcSeasonEnd, utcSeasonKey, utcSeasonName } from "./lib/time";

// ================= v3 design tokens — neo-brutalist =================
// Cream paper, ink outlines, hard offset shadows. Every surface is a sticker:
// white fill, 2.5px ink border, solid drop shadow. No blur, no glass, no gradients
// except on the loud accent blocks.
const INK = "#14120F";

const T = {
  bg: "#F3ECDC",
  card: "#FFFFFF",
  card2: "#E7E2D4",
  cardHi: "rgba(20,18,15,0.06)",
  border: INK,
  border2: INK,
  ink: INK,
  text: INK,
  sub: "#6E6A5E",
  sub2: "#8A8578",
  blue: "#2B4CF2",
  indigo: "#8B5CF6",
  green: "#23D18B",
  orange: "#FF8A3D",
  red: "#FF4D2E",
  purple: "#8B5CF6",
  yellow: "#FFD23F",
  gold: "#FFD23F",
  teal: "#2B4CF2",
  // Hard offset shadows — the signature of the whole system.
  shadow: `5px 5px 0 ${INK}`,
  shadowSm: `3px 3px 0 ${INK}`,
  shadowMd: `4px 4px 0 ${INK}`,
  bw: "2.5px",
  grad: "linear-gradient(135deg, #FFD23F, #FF4D2E 52%, #2B4CF2)",
  surface: "linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0))",
  font: `'Manrope', -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`,
  display: `'Archivo', -apple-system, BlinkMacSystemFont, sans-serif`,
  mono: `'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif`,
};

// Rarity / accent block colors used across shop + season.
const RARITY_BG = { common: "#E7E2D4", rare: "#9CC3FF", epic: "#D6B8FF", legendary: "#FFD23F" };

// Sticker surface — the one recipe every card, chip and button is built from.
const sticker = (fill = T.card, shadow = T.shadowMd) => ({
  background: fill,
  border: `${T.bw} solid ${INK}`,
  boxShadow: shadow,
});

const FontImport = () => (
  <style>{`
    /* Self-hosted, OFL 1.1 — see public/fonts/OFL.txt. Nothing is fetched from Google
       at runtime: dynamic Google Fonts embedding leaks every visitor's IP to Google
       without consent (LG Muenchen I, 20 O 11/22). Keep these URLs same-origin.
       All three ship as variable fonts, so one file per subset covers every weight. */
    @font-face {
      font-family: 'Archivo';
      font-style: normal;
      font-weight: 600 900;
      font-stretch: 100%;
      font-display: swap;
      src: url('/fonts/archivo-latin.woff2') format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @font-face {
      font-family: 'Archivo';
      font-style: normal;
      font-weight: 600 900;
      font-stretch: 100%;
      font-display: swap;
      src: url('/fonts/archivo-latin-ext.woff2') format('woff2');
      unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
    }
    @font-face {
      font-family: 'Space Grotesk';
      font-style: normal;
      font-weight: 500 700;
      font-display: swap;
      src: url('/fonts/space-grotesk-latin.woff2') format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @font-face {
      font-family: 'Space Grotesk';
      font-style: normal;
      font-weight: 500 700;
      font-display: swap;
      src: url('/fonts/space-grotesk-latin-ext.woff2') format('woff2');
      unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
    }
    @font-face {
      font-family: 'Manrope';
      font-style: normal;
      font-weight: 500 800;
      font-display: swap;
      src: url('/fonts/manrope-latin.woff2') format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @font-face {
      font-family: 'Manrope';
      font-style: normal;
      font-weight: 500 800;
      font-display: swap;
      src: url('/fonts/manrope-latin-ext.woff2') format('woff2');
      unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
    }
    @keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
    @keyframes pop { 0% { transform: scale(0.92); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
    @keyframes sheetup { 0% { transform: translateY(100%); } 100% { transform: translateY(0); } }
    @keyframes tilein { 0% { transform: translateY(16px) scale(0.96); opacity: 0; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
    @keyframes flamef { 0%, 100% { transform: scale(1) rotate(-2deg); } 50% { transform: scale(1.08) rotate(2deg); } }
    @keyframes burst { 0% { transform: scale(0.3); opacity: 0; } 55% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
    @keyframes dropwiggle { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
    @keyframes spinSlow { to { transform: rotate(360deg); } }
    @keyframes spriteRun { to { background-position-x: var(--sprite-end); } }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes toastIn {
      from { opacity: 0; transform: translate(-50%, 14px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
    .enter { animation: slideUp 460ms cubic-bezier(.22,1,.36,1) backwards; }
    /* Brutalist press: the sticker slides into its own shadow instead of scaling. */
    .pressable { transition: transform 110ms ease, box-shadow 110ms ease, filter 160ms ease; }
    .pressable:hover { filter: brightness(1.03); }
    .pressable:active { transform: translate(3px, 3px); box-shadow: 0 0 0 ${INK} !important; }
    .premium-card { position: relative; }
    button { -webkit-tap-highlight-color: transparent; }
    * { box-sizing: border-box; }
    html, body { margin: 0; overflow-x: hidden; overscroll-behavior: none; background: ${INK}; }
    input { font-size: 16px; }
    .sd-scroll::-webkit-scrollbar { width: 0; display: none; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
      /* Animated avatars are cosmetic content, not layout motion. Keep their
         identity visible at a gentler speed while reducing every other effect. */
      .sprite-avatar {
        animation: spriteRun 1.6s steps(8) infinite !important;
      }
    }
  `}</style>
);

// ================= Sound (WebAudio) =================
const Sound = {
  on: true,
  ctx: null,
  beep(freq = 880, dur = 0.09, type = "sine", vol = 0.07) {
    if (!this.on) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
      o.stop(this.ctx.currentTime + dur);
    } catch (e) {}
  },
  win() { this.beep(660, 0.1); setTimeout(() => this.beep(880, 0.1), 110); setTimeout(() => this.beep(1320, 0.18), 220); },
  lose() { this.beep(330, 0.15, "triangle"); setTimeout(() => this.beep(220, 0.25, "triangle"), 160); },
};

// ================= Custom SVG icons =================
const ICONS = {
  bolt: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  divide: (
    <>
      <circle cx="12" cy="6" r="1.3" />
      <line x1="5" y1="12" x2="19" y2="12" />
      <circle cx="12" cy="18" r="1.3" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M10 13h4M8 16h8" />
    </>
  ),
  shield: <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" />,
  trophy: (
    <>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </>
  ),
  swords: (
    <>
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
      <line x1="13" y1="19" x2="19" y2="13" />
      <line x1="16" y1="16" x2="20" y2="20" />
      <line x1="19" y1="21" x2="21" y2="19" />
      <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
      <line x1="5" y1="14" x2="9" y2="18" />
      <line x1="7" y1="17" x2="4" y2="20" />
      <line x1="3" y1="19" x2="5" y2="21" />
    </>
  ),
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
  sliders: (
    <>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="2" y1="14" x2="6" y2="14" />
      <line x1="10" y1="8" x2="14" y2="8" />
      <line x1="18" y1="16" x2="22" y2="16" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  share: (
    <>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </>
  ),
  crown: (
    <>
      <path d="M3 17 2 7l5.5 4L12 4l4.5 7L22 7l-1 10z" />
      <path d="M5 21h14" />
    </>
  ),
  gem: (
    <>
      <path d="M6 3h12l4 6-10 12L2 9z" />
      <path d="M2 9h20" />
      <path d="M12 3 8 9l4 12 4-12-4-6" />
    </>
  ),
  dumbbell: (
    <>
      <path d="M14.4 14.4 9.6 9.6" />
      <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z" />
      <path d="m21.5 21.5-1.4-1.4" />
      <path d="M3.9 3.9 2.5 2.5" />
      <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.6-3 4" />
      <path d="M12 17h.01" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v9M9.7 9.6c0-1 1-1.6 2.3-1.6s2.3.6 2.3 1.6-1 1.4-2.3 1.4-2.3.5-2.3 1.5 1 1.6 2.3 1.6 2.3-.6 2.3-1.6" />
    </>
  ),
  playAd: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M10 8.2l6 3.8-6 3.8z" fill="currentColor" stroke="none" />
    </>
  ),
  bag: (
    <>
      <path d="M5.5 8h13l1 11.5a2 2 0 0 1-2 2.2H6.5a2 2 0 0 1-2-2.2z" />
      <path d="M8.5 8a3.5 3.5 0 0 1 7 0" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  crownGlyph: <path d="M3 17 2 7l5.5 4L12 4l4.5 7L22 7l-1 10z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  heart: <path d="M12 20s-7-4.5-9.3-9C1.2 8 2.6 4.5 6 4.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3.4 0 4.8 3.5 3.3 6.5C19 15.5 12 20 12 20z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.5 3.8 5.7 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3.5 20c0-3.3 2.5-5.6 5.5-5.6s5.5 2.3 5.5 5.6" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 6" />
      <path d="M17.5 14.6c2.4.5 4 2.6 4 5.4" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.3" />
      <path d="M21 4v5h-5" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 6a8 8 0 0 1 0 12" />
    </>
  ),
  star: <path d="M12 2.5l2.9 5.9 6.6.9-4.8 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.5 9.8l6.6-.9L12 2.5z" />,
  medal: (
    <>
      <path d="M8 3h8l-2.5 6h-3z" />
      <circle cx="12" cy="15" r="6" />
      <path d="M12 12.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" fill="currentColor" stroke="none" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  skull: (
    <>
      <path d="M12 3c-4.4 0-8 3.3-8 7.5 0 2.4 1.2 4.3 3 5.6V19a1 1 0 0 0 1 1h1.5" />
      <path d="M20 10.5C20 6.3 16.4 3 12 3" />
      <path d="M20 10.5c0 2.4-1.2 4.3-3 5.6V19a1 1 0 0 1-1 1h-1.5" />
      <path d="M9.5 20v-2M12 20v-2.5M14.5 20v-2" />
      <circle cx="9" cy="11" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="11" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  chevron: <path d="M9 18l6-6-6-6" />,
  chevronLeft: <path d="M15 18l-6-6 6-6" />,
  menu: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
};

const Icon = ({ name, size = 22, color = "#fff", strokeWidth = 2, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {ICONS[name]}
  </svg>
);

const TIERS = [
  { name: "Bronze", min: 0, color: "#CD7F32" },
  { name: "Silver", min: 1000, color: "#C0C0C0" },
  { name: "Gold", min: 1200, color: T.yellow },
  { name: "Platinum", min: 1450, color: "#7FDBFF" },
  { name: "Diamond", min: 1700, color: T.purple },
];
const tierOf = (elo) => [...TIERS].reverse().find((t) => elo >= t.min);

// `bg` is the pastel block behind each game's icon — the tile keeps its ink outline,
// so the pastel is the only thing that distinguishes one game from another.
const GAMES = [
  { id: "draw",      name: "Duel Draw",   icon: "bolt",   emoji: "⚡️", desc: "React on green · hold on red", color: T.blue,   bg: "#FFB4A6" },
  { id: "bullseye",  name: "Bullseye",    icon: "target", emoji: "🎯", desc: "Stop it dead-center",          color: T.teal,   bg: "#C7B8FF" },
  { id: "numbers",   name: "Number Rush", icon: "grid",   emoji: "🔢", desc: "Tap 1→25 fast",                color: T.orange, bg: "#B7EFCF" },
  { id: "oddone",    name: "Odd One Out", icon: "target", emoji: "🎨", desc: "Spot the odd tile",            color: T.purple, bg: "#A9CCFF" },
  { id: "chimp",     name: "Chimp Test",  icon: "grid",   emoji: "🧠", desc: "Memorize the order",           color: T.green,  bg: "#E0C1FF" },
  { id: "quickmath", name: "Quick Math",  icon: "divide", emoji: "➗", desc: "True or false, fast",          color: T.yellow, bg: "#FFE08A" },
];

const BOTS = [
  { name: "nikos.dev", avatar: "flameorb", pts: 24820, friend: true, skill: 255 },
  { name: "maria_k", avatar: "seahorse", pts: 23180, friend: false, skill: 265 },
  { name: "SpirosGG", avatar: "sprout", pts: 21640, friend: true, skill: 270 },
  { name: "elena.p", avatar: "moth", pts: 19970, friend: false, skill: 280 },
  { name: "TheoFast", avatar: "dragon", pts: 18450, friend: false, skill: 262 },
  { name: "katerina__", avatar: "reaper", pts: 16720, friend: true, skill: 290 },
  { name: "GiorgosX", avatar: "knight", pts: 14380, friend: false, skill: 300 },
  { name: "dimitra.m", avatar: "cactusmage", pts: 12240, friend: false, skill: 310 },
  { name: "PanosOne", avatar: "orb", pts: 9870, friend: true, skill: 315 },
  { name: "vasilis_r", avatar: "comet", pts: 7640, friend: false, skill: 330 },
  { name: "IoannaZ", avatar: "mushroom", pts: 5310, friend: false, skill: 345 },
  { name: "kostas.gr", avatar: "starslime", pts: 3180, friend: true, skill: 360 },
];


const AVATAR_IMG = {"flameorb": "/avatars/ui/flameorb.png", "wizard": "/avatars/ui/wizard.png", "sprout": "/avatars/ui/sprout.png", "mushroom": "/avatars/ui/mushroom.png", "starslime": "/avatars/ui/starslime.png", "beefae": "/avatars/ui/beefae.png", "reaper": "/avatars/ui/reaper.png", "dragon": "/avatars/ui/dragon.png", "knight": "/avatars/ui/knight.png", "kitsune": "/avatars/ui/kitsune.png", "potion": "/avatars/ui/potion.png", "orb": "/avatars/ui/orb.png", "cactusmage": "/avatars/ui/cactusmage.png", "comet": "/avatars/ui/comet.png", "moth": "/avatars/ui/moth.png", "seahorse": "/avatars/ui/seahorse.png"};

// ================= Pixel-art avatars =================
// 16 pixel-art creatures. Each avatar id is just its key (e.g. "dragon").
const SHOP_AVATAR_IMG = {"lavacup": "/avatars/ui/lavacup.png", "galaxyslime": "/avatars/ui/galaxyslime.png", "frogmage": "/avatars/ui/frogmage.png", "acornknight": "/avatars/ui/acornknight.png", "catmask": "/avatars/ui/catmask.png", "ghostwiz": "/avatars/ui/ghostwiz.png", "crystalcactus": "/avatars/ui/crystalcactus.png", "bluebun": "/avatars/ui/bluebun.png", "tomatocomet": "/avatars/ui/tomatocomet.png", "moongolem": "/avatars/ui/moongolem.png", "sushidragon": "/avatars/ui/sushidragon.png", "stormcloud": "/avatars/ui/stormcloud.png", "mintwitch": "/avatars/ui/mintwitch.png", "sugarskull": "/avatars/ui/sugarskull.png", "battlebot": "/avatars/ui/battlebot.png", "ninjastar": "/avatars/ui/ninjastar.png", "coralaxolotl": "/avatars/ui/coralaxolotl.png", "eyeegg": "/avatars/ui/eyeegg.png", "pinkbot": "/avatars/ui/pinkbot.png", "frostflask": "/avatars/ui/frostflask.png"};
const FREE_AVATARS = Object.keys(AVATAR_IMG); // all 16 base art keys (render by key)
Object.assign(AVATAR_IMG, SHOP_AVATAR_IMG);   // shop art available for rendering by key
// You start by picking ONE of these; every other avatar is unlocked in the Shop
// (cheap ones earned with coins from your scores, premium ones bought).
const STARTERS = ["knight", "dragon", "flameorb", "kitsune", "starslime"];
const AVATARS = STARTERS;                       // the free starter set offered at onboarding
// Accent color per avatar (for frame glow / ring tinting)
const AV_ACCENT = {
  flameorb: "#0A84FF", wizard: "#5E5CE6", sprout: "#30D158", mushroom: "#BF5AF2",
  starslime: "#5E5CE6", beefae: "#FF9F0A", reaper: "#64D2FF", dragon: "#FF453A",
  knight: "#0A84FF", kitsune: "#FF375F", potion: "#30D158", orb: "#BF5AF2",
  cactusmage: "#30D158", comet: "#FF375F", moth: "#64D2FF", seahorse: "#0A84FF",
  lavacup: "#FF9F0A", galaxyslime: "#BF5AF2", frogmage: "#30D158", acornknight: "#C77A3C", catmask: "#FFD60A",
  ghostwiz: "#8E8E93", crystalcactus: "#FF375F", bluebun: "#0A84FF", tomatocomet: "#FF453A", moongolem: "#64D2FF",
  sushidragon: "#FF9F0A", stormcloud: "#5E5CE6", mintwitch: "#30D158", sugarskull: "#FF375F", battlebot: "#0A84FF",
  ninjastar: "#BF5AF2", coralaxolotl: "#FF375F", eyeegg: "#FFD60A", pinkbot: "#FF2D9B", frostflask: "#64D2FF",
  // animated sprite avatars (personality v3, 8-frame sheets in /public/avatars)
  moss_snail_alchemist: "#30D158", origami_crane_mage: "#5E5CE6", sunflower_golem: "#FFD60A",
  jellyfish_monk: "#64D2FF", mimic_bard: "#BF5AF2", candle_moth_keeper: "#FF9F0A",
  koi_bowl_oracle: "#FF453A", radish_explorer: "#FF375F", stained_glass_owl: "#0A84FF",
  volcano_turtle_astronomer: "#FF2D9B",
};

// ================= Animated sprite avatars =================
// Each is an 8-frame horizontal sheet (128×128 per frame) served from /public/avatars.
// Rendered by CSS steps() animation in the Avatar component below.
const SPRITE_FRAMES = 8, SPRITE_FRAME_MS = 120;
const SPRITE_AVATARS = Object.fromEntries(
  [
    "moss_snail_alchemist", "origami_crane_mage", "sunflower_golem", "jellyfish_monk",
    "mimic_bard", "candle_moth_keeper", "koi_bowl_oracle", "radish_explorer",
    "stained_glass_owl", "volcano_turtle_astronomer",
  ].map((key) => [key, { src: `${import.meta.env.BASE_URL}avatars/${key}.png`, frames: SPRITE_FRAMES, frameMs: SPRITE_FRAME_MS }])
);

const Avatar = ({ id, size = 44, ring = false, bare = true }) => {
  const sprite = SPRITE_AVATARS[id];
  const key = sprite ? id : (AVATAR_IMG[id] ? id : "dragon");
  const accent = AV_ACCENT[key] || "#0A84FF";
  const inner = Math.round(size * (bare ? 1 : 0.94));
  return (
    <div style={{ width: size, height: size, maxWidth: "100%", borderRadius: size * 0.28, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", boxSizing: "border-box",
      background: bare ? "transparent" : `linear-gradient(140deg, ${accent}22, ${accent}08)`,
      border: bare ? "none" : `1px solid ${accent}33`, boxShadow: ring && !bare ? `0 0 18px ${accent}55` : "none" }}>
      {sprite ? (
        <div className="sprite-avatar" aria-hidden="true"
          style={{ width: inner, height: inner, backgroundImage: `url(${sprite.src})`, backgroundRepeat: "no-repeat",
          backgroundSize: `${sprite.frames * inner}px ${inner}px`, "--sprite-end": `-${sprite.frames * inner}px`,
          animation: `spriteRun ${(sprite.frames * sprite.frameMs) / 1000}s steps(${sprite.frames}) infinite`,
          willChange: "background-position", imageRendering: "auto" }} />
      ) : (
        <img src={AVATAR_IMG[key]} alt="" width={inner} height={inner}
          style={{ maxWidth: bare ? "100%" : "94%", maxHeight: bare ? "100%" : "94%", imageRendering: "auto", objectFit: "contain" }} />
      )}
    </div>
  );
};

const WEEK_HISTORY = [1420, 1780, 2050, 1660, 2240, 1980]; // last 6 days, today is live

const ACTIVITY = [
  { avatar: "flameorb", text: "nikos.dev passed you on the leaderboard", time: "12m ago" },
  { avatar: "sprout", text: "SpirosGG set a 219ms Reaction record", time: "41m ago" },
  { avatar: "reaper", text: "katerina__ unlocked Full House", time: "2h ago" },
];

// ================= UI atoms =================
const Card = ({ children, style, onClick, delay = 0 }) => (
  <div onClick={onClick} className={`premium-card enter${onClick ? " pressable" : ""}`}
    style={{ ...sticker(), borderRadius: 14, padding: 16, animationDelay: `${delay}ms`,
      cursor: onClick ? "pointer" : undefined, ...style }}>
    {children}
  </div>
);

// Chips are solid color blocks with an ink outline — never translucent.
const Pill = ({ children, color = T.blue }) => {
  // Loud accents carry white text; pale ones keep the ink.
  const onDark = color === T.blue || color === T.red || color === T.purple || color === T.indigo;
  return (
    <span style={{ fontSize: 11.5, fontWeight: 800, color: onDark ? "#fff" : INK, background: color,
      border: `2px solid ${INK}`, borderRadius: 7, padding: "3px 9px", letterSpacing: 0.2, whiteSpace: "nowrap",
      display: "inline-block" }}>
      {children}
    </span>
  );
};



// Loud accents get white text; pale ones (yellow, green, cream) keep the ink.
const inkOn = (color) => (color === T.blue || color === T.red || color === T.purple || color === T.indigo ? "#fff" : INK);

const BigButton = ({ children, onClick, color = T.blue, style, disabled = false, type = "button" }) => (
  <button type={type} onClick={onClick} disabled={disabled} className="pressable"
    style={{ width: "100%", padding: "15px 0", borderRadius: 12, border: `${T.bw} solid ${INK}`,
      background: color, color: inkOn(color),
      fontSize: 16, fontWeight: 900, fontFamily: T.display, textTransform: "uppercase", letterSpacing: "0.01em",
      cursor: disabled ? "wait" : "pointer", opacity: disabled ? 0.65 : 1, boxShadow: T.shadowMd, ...style }}>
    {children}
  </button>
);

const Switch = ({ on, toggle, label }) => (
  <button type="button" onClick={toggle} role="switch" aria-checked={on} aria-label={label}
    style={{ width: 52, height: 30, padding: 0, borderRadius: 8, background: on ? T.green : T.card2,
    border: `${T.bw} solid ${INK}`, position: "relative", transition: "background 200ms", cursor: "pointer", flexShrink: 0 }}>
    <div style={{ position: "absolute", top: 2, left: on ? 24 : 2, width: 22, height: 22, borderRadius: 5,
      background: "#fff", border: `2px solid ${INK}`, transition: "left 200ms", pointerEvents: "none" }} />
  </button>
);

// Swipe-to-dismiss for bottom sheets. The grabber was previously decorative — it
// looked draggable and did nothing. Dragging from the grabber always works; dragging
// from the body only takes over once the content is scrolled to the top, so it never
// fights the scroll.
const DISMISS_PX = 110, DISMISS_VELOCITY = 0.5; // px, px/ms
function useSheetDrag(onClose) {
  const panel = useRef(null);
  const drag = useRef(null);
  const [dy, setDy] = useState(0);
  const [closing, setClosing] = useState(false);

  const down = (e, fromHandle = false) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { y0: e.clientY, t0: performance.now(), y: e.clientY, fromHandle, on: false };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d || closing) return;
    const delta = e.clientY - d.y0;
    d.y = e.clientY;
    if (delta <= 0 && !d.on) return;
    if (!d.on) {
      if (!d.fromHandle && panel.current && panel.current.scrollTop > 0) { drag.current = null; return; }
      d.on = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ }
    }
    setDy(Math.max(0, delta));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.on) { setDy(0); return; }
    const velocity = (d.y - d.y0) / Math.max(1, performance.now() - d.t0);
    // A short flick should dismiss as readily as a long slow drag.
    if (dy > DISMISS_PX || velocity > DISMISS_VELOCITY) { setClosing(true); setTimeout(onClose, 170); }
    else setDy(0);
  };

  const dragging = !!(drag.current && drag.current.on);
  return {
    panel,
    handleProps: { onPointerDown: (e) => down(e, true), onPointerMove: move, onPointerUp: up, onPointerCancel: up,
      style: { touchAction: "none", cursor: "grab" } },
    bodyProps: { onPointerDown: (e) => down(e, false), onPointerMove: move, onPointerUp: up, onPointerCancel: up },
    motion: {
      transform: closing ? "translateY(100%)" : `translateY(${dy}px)`,
      transition: dragging ? "none" : "transform 200ms cubic-bezier(.22,1,.36,1)",
      animation: dy || closing ? "none" : "sheetup 280ms cubic-bezier(.22,1,.36,1)",
    },
    backdropOpacity: closing ? 0 : Math.max(0.2, 0.5 - dy / 600),
  };
}

const Sheet = ({ onClose, children, label = "Dialog" }) => {
  const { panel, handleProps, bodyProps, motion, backdropOpacity } = useSheetDrag(onClose);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const node = panel.current;
    node?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = [...node.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )];
      if (!focusable.length) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, [panel]);
  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, background: `rgba(20,18,15,${backdropOpacity})`,
      transition: "background 200ms", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div ref={panel} onClick={(e) => e.stopPropagation()} {...bodyProps}
        role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        style={{ width: "100%", maxWidth: 400, boxSizing: "border-box", background: T.bg,
          borderRadius: "26px 26px 0 0", padding: "10px 20px 30px",
          borderTop: `3px solid ${INK}`, borderLeft: `3px solid ${INK}`, borderRight: `3px solid ${INK}`,
          maxHeight: "85vh", overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain",
          position: "relative", outline: "none", ...motion }}
        className="sd-scroll">
        <button type="button" className="pressable" onClick={onClose} aria-label={`Close ${label}`}
          style={{ position: "absolute", top: 12, right: 14, zIndex: 2, width: 34, height: 34,
            cursor: "pointer", ...sticker(T.card, `3px 3px 0 ${INK}`), borderRadius: 9,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="x" size={16} color={INK} strokeWidth={3} />
        </button>
        {/* Generous invisible hit area — a 6px bar is far too small a drag target. */}
        <div {...handleProps} style={{ ...handleProps.style, padding: "8px 0 14px", margin: "-8px 0 0" }}>
          <div style={{ width: 44, height: 6, borderRadius: 3, background: INK, margin: "0 auto" }} />
        </div>
        {children}
      </div>
    </div>
  );
};

// The orb's section switcher. Its own component so the drag state unmounts with it
// and every open starts from a clean slate.
const NavSheet = ({ sections, tab, onGo, onClose }) => {
  const { panel, handleProps, bodyProps, motion, backdropOpacity } = useSheetDrag(onClose);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const node = panel.current;
    node?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = [...node.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )];
      if (!focusable.length) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, [panel]);
  return (
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 45,
        transition: "background 200ms", background: `rgba(20,18,15,${backdropOpacity})` }} />
      <div ref={panel} {...bodyProps} role="dialog" aria-modal="true" aria-label="Navigation menu" tabIndex={-1}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 46, background: T.bg,
          borderTop: `3px solid ${INK}`, borderRadius: "26px 26px 0 0", padding: "10px 20px 30px",
          overscrollBehavior: "contain", outline: "none", ...motion }}>
        <div {...handleProps} style={{ ...handleProps.style, padding: "8px 0 14px", margin: "-8px 0 0" }}>
          <div style={{ width: 44, height: 6, borderRadius: 3, background: INK, margin: "0 auto" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 20, color: INK, textTransform: "uppercase" }}>Go to</div>
          <button className="pressable" onClick={onClose} aria-label="Close navigation menu"
            style={{ width: 34, height: 34, cursor: "pointer", ...sticker(T.card, `3px 3px 0 ${INK}`), borderRadius: 9,
              display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={16} color={INK} strokeWidth={3} />
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {sections.map(([id, label, color, icon], i) => (
            <button key={id} className="pressable" onClick={() => onGo(id)}
              style={{ textAlign: "left", cursor: "pointer", ...sticker(tab === id ? color : T.card, T.shadowMd),
                borderRadius: 14, padding: 15, display: "flex", flexDirection: "column", gap: 12, minHeight: 98,
                animation: "tilein 300ms ease both", animationDelay: `${i * 35}ms` }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, border: `${T.bw} solid ${INK}`, background: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={icon} size={22} color={INK} strokeWidth={2.2} />
              </div>
              <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 16, color: INK, textTransform: "uppercase",
                display: "flex", alignItems: "center", gap: 6 }}>
                {label}
                {tab === id && <span style={{ width: 8, height: 8, borderRadius: "50%", background: INK, display: "inline-block" }} />}
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

const BrandMark = ({ size = 76 }) => (
  // flexShrink:0 — it lives in a scrolling column flexbox that would otherwise squash it.
  <div style={{ width: size, height: size, flexShrink: 0, borderRadius: Math.round(size * 0.26),
    display: "flex", alignItems: "center", justifyContent: "center",
    background: T.yellow, border: `3px solid ${INK}`, boxShadow: `6px 6px 0 ${INK}`,
    animation: "bob 2.2s ease-in-out infinite" }}>
    <Icon name="swords" size={Math.round(size * 0.5)} color={INK} strokeWidth={2.6} />
  </div>
);

// ================= Season reward cosmetics =================
// Top-3 finishers each season unlock a permanent frame + exclusive avatar + badge.
const SEASON_REWARDS = [
  { place: 1, label: "Champion", frame: "gold", color: "#FFD60A",
    avatar: "seahorse", badge: "Season Champion",
    perks: ["Animated gold champion frame", "Exclusive Champion avatar", "Permanent Hall of Fame entry"] },
  { place: 2, label: "Runner-up", frame: "silver", color: "#C7CAD1",
    avatar: "potion", badge: "Silver Finalist",
    perks: ["Shimmering silver frame", "Exclusive Silver avatar", "Hall of Fame entry"] },
  { place: 3, label: "Bronze", frame: "bronze", color: "#E0965A",
    avatar: "comet", badge: "Bronze Finalist",
    perks: ["Bronze glow frame", "Exclusive Bronze avatar", "Hall of Fame entry"] },
];
const FRAME_COLORS = {
  // Season-only (earned by finishing top 3 — NOT purchasable)
  gold: ["#FFE87A", "#FFB800", "#FFD60A"],
  silver: ["#EEF1F6", "#AAB0BC", "#C7CAD1"],
  bronze: ["#F4B27A", "#C77A3C", "#E0965A"],
  // Shop-only purchasable frames (distinct palettes so they never look like championship frames)
  ocean: ["#64D2FF", "#0A84FF", "#5E5CE6"],
  aurora: ["#30D158", "#64D2FF", "#BF5AF2"],
  magma: ["#FF9F0A", "#FF453A", "#FF375F"],
  void: ["#BF5AF2", "#5E5CE6", "#2C2C2E"],
};

// Avatar wrapped in an animated seasonal champion frame
const FramedAvatar = ({ id, size = 64, frame }) => {
  if (!frame) return <Avatar id={id} size={size} />;
  const [c1, c2, c3] = FRAME_COLORS[frame] || FRAME_COLORS.gold;
  const pad = Math.round(size * 0.13);
  return (
    <div style={{ position: "relative", width: size + pad * 2, height: size + pad * 2,
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: (size + pad * 2) * 0.3,
        background: `conic-gradient(from 0deg, ${c1}, ${c2}, ${c3}, ${c1})`,
        animation: "spinSlow 6s linear infinite" }} />
      <div style={{ position: "relative", zIndex: 2 }}><Avatar id={id} size={size} /></div>
    </div>
  );
};

// ================= Cosmetic shop =================
// Cosmetics only — never power. Bought with coins earned in-game or via coin packs (IAP).
const SHOP_ITEMS = [
  // Coin-earnable avatars — cheap, unlocked with coins you earn from your scores
  { id: "av_sprout",      type: "avatar", name: "Sprout",       cost: 120,  glyph: "sprout",        rarity: "common" },
  { id: "av_beefae",      type: "avatar", name: "Bee Fae",      cost: 140,  glyph: "beefae",        rarity: "common" },
  { id: "av_moth",        type: "avatar", name: "Moon Moth",    cost: 160,  glyph: "moth",          rarity: "common" },
  { id: "av_seahorse",    type: "avatar", name: "Seahorse",     cost: 180,  glyph: "seahorse",      rarity: "common" },
  { id: "av_potion",      type: "avatar", name: "Lucky Potion", cost: 200,  glyph: "potion",        rarity: "common" },
  { id: "av_orb",         type: "avatar", name: "Arcane Orb",   cost: 220,  glyph: "orb",           rarity: "common" },
  { id: "av_comet",       type: "avatar", name: "Comet",        cost: 240,  glyph: "comet",         rarity: "common" },
  { id: "av_mushroom",    type: "avatar", name: "Mushroom Mage",cost: 260,  glyph: "mushroom",      rarity: "common" },
  { id: "av_cactusmage",  type: "avatar", name: "Cactus Mage",  cost: 280,  glyph: "cactusmage",    rarity: "common" },
  { id: "av_wizard",      type: "avatar", name: "Blue Wizard",  cost: 300,  glyph: "wizard",        rarity: "common" },
  { id: "av_reaper",      type: "avatar", name: "Lil Reaper",   cost: 320,  glyph: "reaper",        rarity: "common" },
  // Purchasable premium avatars
  { id: "av_lavacup",     type: "avatar", name: "Lava Brew",    cost: 350,  glyph: "lavacup",       rarity: "rare" },
  { id: "av_bluebun",     type: "avatar", name: "Fire Bun",     cost: 350,  glyph: "bluebun",       rarity: "rare" },
  { id: "av_tomatocomet", type: "avatar", name: "Tomato Dash",  cost: 350,  glyph: "tomatocomet",   rarity: "rare" },
  { id: "av_ninjastar",   type: "avatar", name: "Shadow Star",  cost: 350,  glyph: "ninjastar",     rarity: "rare" },
  { id: "av_ghostwiz",    type: "avatar", name: "Ghost Wizard", cost: 500,  glyph: "ghostwiz",      rarity: "rare" },
  { id: "av_acornknight", type: "avatar", name: "Acorn Knight", cost: 500,  glyph: "acornknight",   rarity: "rare" },
  { id: "av_crystalcac",  type: "avatar", name: "Gem Cactus",   cost: 500,  glyph: "crystalcactus", rarity: "rare" },
  { id: "av_frogmage",    type: "avatar", name: "Frog Mage",    cost: 650,  glyph: "frogmage",      rarity: "epic" },
  { id: "av_catmask",     type: "avatar", name: "Night Mask",   cost: 650,  glyph: "catmask",       rarity: "epic" },
  { id: "av_mintwitch",   type: "avatar", name: "Mint Witch",   cost: 650,  glyph: "mintwitch",     rarity: "epic" },
  { id: "av_stormcloud",  type: "avatar", name: "Storm Cloud",  cost: 650,  glyph: "stormcloud",    rarity: "epic" },
  { id: "av_moongolem",   type: "avatar", name: "Moon Golem",   cost: 800,  glyph: "moongolem",     rarity: "epic" },
  { id: "av_battlebot",   type: "avatar", name: "Battle Bot",   cost: 800,  glyph: "battlebot",     rarity: "epic" },
  { id: "av_pinkbot",     type: "avatar", name: "Pixel Pal",    cost: 800,  glyph: "pinkbot",       rarity: "epic" },
  { id: "av_frostflask",  type: "avatar", name: "Frost Flask",  cost: 800,  glyph: "frostflask",    rarity: "epic" },
  { id: "av_coralaxo",    type: "avatar", name: "Coral Axolotl",cost: 1100, glyph: "coralaxolotl",  rarity: "legendary" },
  { id: "av_sugarskull",  type: "avatar", name: "Sugar Skull",  cost: 1100, glyph: "sugarskull",    rarity: "legendary" },
  { id: "av_galaxyslime", type: "avatar", name: "Galaxy Slime", cost: 1300, glyph: "galaxyslime",   rarity: "legendary" },
  { id: "av_sushidragon", type: "avatar", name: "Sushi Dragon", cost: 1300, glyph: "sushidragon",   rarity: "legendary" },
  { id: "av_eyeegg",      type: "avatar", name: "Oracle Egg",   cost: 1500, glyph: "eyeegg",        rarity: "legendary" },
  // Animated flagship avatars (personality v3, 8-frame sprites)
  { id: "av_mossalch",    type: "avatar", name: "Moss Alchemist", cost: 1600, glyph: "moss_snail_alchemist",       rarity: "legendary" },
  { id: "av_origami",     type: "avatar", name: "Origami Mage",   cost: 1700, glyph: "origami_crane_mage",         rarity: "legendary" },
  { id: "av_sungolem",    type: "avatar", name: "Sunflower Golem",cost: 1800, glyph: "sunflower_golem",            rarity: "legendary" },
  { id: "av_jellymonk",   type: "avatar", name: "Jellyfish Monk", cost: 1900, glyph: "jellyfish_monk",             rarity: "legendary" },
  { id: "av_mimicbard",   type: "avatar", name: "Mimic Bard",     cost: 2000, glyph: "mimic_bard",                 rarity: "legendary" },
  { id: "av_candlemoth",  type: "avatar", name: "Candle Keeper",  cost: 2100, glyph: "candle_moth_keeper",         rarity: "legendary" },
  { id: "av_koioracle",   type: "avatar", name: "Koi Oracle",     cost: 2200, glyph: "koi_bowl_oracle",            rarity: "legendary" },
  { id: "av_radish",      type: "avatar", name: "Radish Explorer", cost: 2300, glyph: "radish_explorer",           rarity: "legendary" },
  { id: "av_glassowl",    type: "avatar", name: "Glass Owl",      cost: 2400, glyph: "stained_glass_owl",          rarity: "legendary" },
  { id: "av_volcano",     type: "avatar", name: "Volcano Sage",   cost: 2500, glyph: "volcano_turtle_astronomer",  rarity: "legendary" },
  { id: "fr_ocean",   type: "frame",  name: "Tidal",       cost: 1200, frame: "ocean",  rarity: "epic" },
  { id: "fr_aurora",  type: "frame",  name: "Aurora",      cost: 1600, frame: "aurora", rarity: "epic" },
  { id: "fr_magma",   type: "frame",  name: "Magma",       cost: 2000, frame: "magma",  rarity: "legendary" },
  { id: "fr_void",    type: "frame",  name: "Void",        cost: 2600, frame: "void",   rarity: "legendary" },
];
const RARITY = { common: "#9AA0AA", rare: "#0A84FF", epic: "#BF5AF2", legendary: "#FFD60A" };

const COIN_PACKS = [
  { id: "c1", coins: 500, price: "€0.99" },
  { id: "c2", coins: 1200, price: "€1.99", tag: "Popular" },
  { id: "c3", coins: 3000, price: "€3.99", tag: "Best value" },
  { id: "c4", coins: 8000, price: "€7.99" },
];

// ================= GAME 1: Reaction =================
function ReactionGame({ onFinish, rounds = 5 }) {
  const [phase, setPhase] = useState("intro");
  const [round, setRound] = useState(0);
  const [times, setTimes] = useState([]);
  const goAt = useRef(0);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const startRound = (r) => {
    setPhase("wait");
    setRound(r);
    timer.current = setTimeout(() => {
      goAt.current = performance.now();
      Sound.beep(1250, 0.06);
      setPhase("go");
    }, 1200 + Math.random() * 1900);
  };
  const record = (ms, next) => {
    const t = [...times, ms];
    setTimes(t);
    if (next >= rounds) {
      const avg = Math.round(t.reduce((a, b) => a + b, 0) / t.length);
      setPhase("done");
      setTimeout(() => onFinish(avg, Math.max(100, 1000 - avg), `${avg} ms`), 700);
    } else {
      setPhase("between");
      timer.current = setTimeout(() => startRound(next), 800);
    }
  };
  const tap = () => {
    if (phase === "intro") return startRound(0);
    if (phase === "wait") {
      clearTimeout(timer.current);
      Sound.beep(220, 0.2, "triangle");
      setPhase("early");
      timer.current = setTimeout(() => record(700, round + 1), 900);
      return;
    }
    if (phase === "go") {
      Sound.beep(880, 0.07);
      record(Math.round(performance.now() - goAt.current), round + 1);
    }
  };
  const colors = { intro: T.card2, wait: T.red, go: T.green, early: T.orange, between: T.card2, done: T.blue };
  const labels = {
    intro: "Tap to start", wait: "Wait for green…", go: "TAP NOW!",
    early: "Too early! +700ms penalty", between: times.length ? `${times[times.length - 1]} ms` : "", done: "Done!",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
      <div style={{ display: "flex", gap: 6 }}>
        {Array.from({ length: rounds }).map((_, i) => (
          <div key={i} style={{ width: 26, height: 5, borderRadius: 3, background: i < times.length ? T.blue : T.card2 }} />
        ))}
      </div>
      <button onClick={tap}
        style={{ width: "100%", height: 260, borderRadius: 18,
          border: `${T.bw} solid ${INK}`, boxShadow: T.shadow,
          background: phase === "intro" ? T.card : colors[phase],
          color: phase === "intro" ? INK : inkOn(colors[phase]),
          fontSize: 24, fontWeight: 900, fontFamily: T.display, textTransform: "uppercase",
          cursor: "pointer", transition: "background 120ms", WebkitTapHighlightColor: "transparent" }}>
        {phase === "intro" ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div style={{ width: 66, height: 66, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
              background: T.blue, border: `${T.bw} solid ${INK}` }}>
              <Icon name="bolt" size={32} color="#fff" strokeWidth={2.4} />
            </div>
            <span>Tap to start</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: T.sub }}>Tap the instant it turns green</span>
          </div>
        ) : (
          <>
            {labels[phase]}
            {phase !== "done" && (
              <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.75, marginTop: 6 }}>Round {Math.min(round + 1, rounds)}/{rounds}</div>
            )}
          </>
        )}
      </button>
      <div style={{ color: T.sub2, fontSize: 12, minHeight: 16 }}>{times.length > 0 && `Times: ${times.join(" · ")} ms`}</div>
    </div>
  );
}

// ================= GAME 2: Memory Grid =================
function MemoryGame({ onFinish }) {
  const [phase, setPhase] = useState("intro");
  const [seq, setSeq] = useState([]);
  const [idx, setIdx] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(3);
  const [flash, setFlash] = useState(-1);
  const [flashColor, setFlashColor] = useState(T.purple);
  const [timeLeft, setTimeLeft] = useState(0);
  const timers = useRef([]);
  const levelRef = useRef(1);
  const livesRef = useRef(3);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  // Time budget for the input phase, scales gently with sequence length.
  const budgetFor = (lv) => (lv + 2) * 1.6 + 2; // seconds

  // Countdown while it's the player's turn to input.
  useEffect(() => {
    if (phase !== "input") return;
    if (timeLeft <= 0) { onTimeout(); return; }
    if (timeLeft <= 3) Sound.beep(300, 0.05);
    const t = setTimeout(() => setTimeLeft((s) => Math.round((s - 0.1) * 10) / 10), 100);
    return () => clearTimeout(t);
  }, [phase, timeLeft]);

  const startLevel = (lv) => {
    levelRef.current = lv;
    const s = Array.from({ length: lv + 2 }, () => Math.floor(Math.random() * 9));
    setSeq(s); setIdx(0); setPhase("show"); setFlashColor(T.purple);
    s.forEach((cell, i) => {
      later(() => { setFlash(cell); Sound.beep(440 + cell * 60, 0.12); }, 500 + i * 620);
      later(() => setFlash(-1), 500 + i * 620 + 380);
    });
    later(() => { setTimeLeft(budgetFor(lv)); setPhase("input"); }, 500 + s.length * 620 + 150);
  };
  const endGame = (lv) => {
    setPhase("done");
    const len = Math.max(2, lv + 2);
    later(() => onFinish(len, Math.min(1000, len * 90), `sequence ${len}`), 800);
  };
  const loseLife = () => {
    const nl = livesRef.current - 1;
    livesRef.current = nl;
    setLives(nl);
    if (nl <= 0) return endGame(levelRef.current - 1);
    setPhase("show");
    later(() => startLevel(levelRef.current), 900);
  };
  const onTimeout = () => {
    Sound.beep(180, 0.3, "triangle");
    setFlashColor(T.red);
    loseLife();
  };
  const tap = (cell) => {
    if (phase !== "input") return;
    if (cell === seq[idx]) {
      setFlash(cell); setFlashColor(T.green); Sound.beep(440 + cell * 60, 0.1);
      later(() => setFlash(-1), 220);
      if (idx + 1 === seq.length) {
        if (level >= 8) return endGame(level);
        setLevel(level + 1); setPhase("show");
        later(() => startLevel(level + 1), 800);
      } else setIdx(idx + 1);
    } else {
      setFlash(cell); setFlashColor(T.red); Sound.beep(200, 0.25, "triangle");
      later(() => setFlash(-1), 350);
      loseLife();
    }
  };
  const budget = budgetFor(level);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Pill color={T.purple}>Level {level}</Pill>
        <Pill color={phase === "input" && timeLeft <= 3 ? T.red : T.teal}>{phase === "input" ? Math.max(0, timeLeft).toFixed(1) : budget.toFixed(0)}"</Pill>
        <span style={{ display: "flex", gap: 3 }}>{[0, 1, 2].map((n) => (
          <Icon key={n} name="heart" size={15} color={n < lives ? T.red : T.card2} strokeWidth={0} style={{ fill: n < lives ? T.red : T.card2 }} />
        ))}</span>
      </div>
      {/* time bar */}
      <div style={{ width: "100%", maxWidth: 300, height: 5, borderRadius: 3, background: T.card2, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 3, width: `${phase === "input" ? (timeLeft / budget) * 100 : 100}%`,
          background: timeLeft <= 3 && phase === "input" ? T.red : T.teal, transition: "width 100ms linear" }} />
      </div>
      <div style={{ color: T.sub, fontSize: 14, minHeight: 18 }}>
        {phase === "intro" && "Watch the sequence and repeat it — before time runs out"}
        {phase === "show" && "Watch closely…"}
        {phase === "input" && `Your turn · ${idx}/${seq.length}`}
        {phase === "done" && "Done!"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, width: "100%", maxWidth: 300 }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <button key={i} onClick={() => tap(i)}
            style={{ aspectRatio: "1", borderRadius: 18, border: `${T.bw} solid ${INK}`,
              background: flash === i ? flashColor : T.card2,
              boxShadow: flash === i ? `0 0 30px ${flashColor}88` : "none",
              transition: "background 140ms, box-shadow 140ms", cursor: "pointer", WebkitTapHighlightColor: "transparent" }} />
        ))}
      </div>
      {phase === "intro" && <BigButton color={T.purple} onClick={() => { livesRef.current = 3; startLevel(1); }}>Start</BigButton>}
    </div>
  );
}

// ================= GAME 3: Mental Math =================
const genQ = () => {
  const t = Math.floor(Math.random() * 3);
  if (t === 0) { const a = 10 + Math.floor(Math.random() * 50), b = 10 + Math.floor(Math.random() * 50); return { text: `${a} + ${b}`, ans: a + b }; }
  if (t === 1) { const a = 30 + Math.floor(Math.random() * 60), b = 10 + Math.floor(Math.random() * (a - 10)); return { text: `${a} − ${b}`, ans: a - b }; }
  const a = 3 + Math.floor(Math.random() * 10), b = 3 + Math.floor(Math.random() * 7);
  return { text: `${a} × ${b}`, ans: a * b };
};

function MathGame({ onFinish }) {
  const [started, setStarted] = useState(false);
  const [time, setTime] = useState(30);
  const [q, setQ] = useState(genQ());
  const [val, setVal] = useState("");
  const [correct, setCorrect] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const done = useRef(false);

  useEffect(() => {
    if (!started) return;
    const iv = setInterval(() => setTime((t) => t - 1), 1000);
    return () => clearInterval(iv);
  }, [started]);
  useEffect(() => {
    if (started && time <= 0 && !done.current) {
      done.current = true;
      onFinish(correct, Math.min(1000, correct * 60), `${correct} correct`);
    }
  }, [time, started, correct, onFinish]);

  const submit = (v) => {
    if (v === "") return;
    const ok = parseInt(v, 10) === q.ans;
    if (ok) { setCorrect((c) => c + 1); Sound.beep(880, 0.08); } else Sound.beep(220, 0.15, "triangle");
    setFeedback(ok);
    setTimeout(() => setFeedback(null), 250);
    setVal(""); setQ(genQ());
  };
  const key = (k) => {
    if (k === "⌫") return setVal((v) => v.slice(0, -1));
    if (k === "OK") return submit(val);
    if (val.length < 4) setVal((v) => v + k);
  };

  if (!started)
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        <div style={{ width: 84, height: 84, borderRadius: 26, display: "flex", alignItems: "center", justifyContent: "center",
          background: T.orange, border: `${T.bw} solid ${INK}` }}>
          <Icon name="divide" size={40} color={INK} strokeWidth={2.4} />
        </div>
        <div style={{ color: T.sub, textAlign: "center", fontSize: 15 }}>Solve as many problems as you can in 30 seconds.</div>
        <BigButton color={T.orange} onClick={() => setStarted(true)}>Start</BigButton>
      </div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
      <div style={{ display: "flex", gap: 14 }}>
        <Pill color={time <= 5 ? T.red : T.orange}>{Math.max(0, time)}"</Pill>
        <Pill color={T.green}>✓ {correct}</Pill>
      </div>
      <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: -1, fontFamily: T.display, padding: "14px 0",
        color: feedback === true ? T.green : feedback === false ? T.red : T.text, transition: "color 150ms" }}>
        {q.text} = {val || "?"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, width: "100%", maxWidth: 300 }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].map((k) => (
          <button key={k} onClick={() => key(k)}
            style={{ padding: "16px 0", borderRadius: 14, border: `${T.bw} solid ${INK}`,
              background: k === "OK" ? T.orange : T.card2, color: INK, fontSize: 20, fontWeight: 700,
              fontFamily: T.font, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

// ================= GAME 4: Speed Typing =================
const WORDS = ["speed", "victory", "code", "ocean", "star", "power", "fire", "dream", "time", "wave",
  "focus", "light", "game", "challenge", "motion", "energy", "target", "rhythm", "magic", "journey", "sky", "wind"];

function TypingGame({ onFinish }) {
  const [started, setStarted] = useState(false);
  const [time, setTime] = useState(30);
  const [word, setWord] = useState(WORDS[Math.floor(Math.random() * WORDS.length)]);
  const [val, setVal] = useState("");
  const [count, setCount] = useState(0);
  const done = useRef(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!started) return;
    const iv = setInterval(() => setTime((t) => t - 1), 1000);
    return () => clearInterval(iv);
  }, [started]);
  useEffect(() => {
    if (started && time <= 0 && !done.current) {
      done.current = true;
      onFinish(count, Math.min(1000, count * 75), `${count} words`);
    }
  }, [time, started, count, onFinish]);

  const change = (e) => {
    const v = e.target.value;
    if (v.trim().toLowerCase() === word.toLowerCase()) {
      setCount((c) => c + 1);
      Sound.beep(880, 0.08);
      setVal("");
      setWord(WORDS[Math.floor(Math.random() * WORDS.length)]);
    } else setVal(v);
  };

  if (!started)
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        <div style={{ width: 84, height: 84, borderRadius: 26, display: "flex", alignItems: "center", justifyContent: "center",
          background: T.green, border: `${T.bw} solid ${INK}` }}>
          <Icon name="keyboard" size={40} color={INK} strokeWidth={2.4} />
        </div>
        <div style={{ color: T.sub, textAlign: "center", fontSize: 15 }}>Type the words as fast as you can — 30 seconds.</div>
        <BigButton color={T.green} onClick={() => { setStarted(true); setTimeout(() => inputRef.current?.focus(), 50); }}>Start</BigButton>
      </div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
      <div style={{ display: "flex", gap: 14 }}>
        <Pill color={time <= 5 ? T.red : T.green}>{Math.max(0, time)}"</Pill>
        <Pill color={T.teal}>✓ {count}</Pill>
      </div>
      <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 1, fontFamily: T.display }}>{word}</div>
      <input ref={inputRef} value={val} onChange={change} autoFocus autoComplete="off" autoCorrect="off" spellCheck={false}
        placeholder="type here…"
        style={{ width: "100%", maxWidth: 300, padding: "16px 18px", borderRadius: 16,
          border: `1px solid ${word.toLowerCase().startsWith(val.toLowerCase()) ? T.border : T.red}`,
          background: T.card2, color: INK, fontSize: 20, fontFamily: T.font, outline: "none", textAlign: "center" }} />
    </div>
  );
}

// ================= Deterministic daily seed =================
// Same challenge for everyone each day → fair leaderboard + duels + anti-cheat.
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const daySeed = (id) => {
  const d = new Date();
  let s = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  for (let i = 0; i < id.length; i++) s = (Math.imul(s, 31) + id.charCodeAt(i)) >>> 0;
  return s >>> 0;
};
const shuffleSeeded = (arr, seed) => {
  const rng = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
};
// The scored daily attempt shares one seed so everyone plays the same challenge and
// the leaderboard means something. Practice and replays get a fresh seed — drilling
// the identical grid over and over teaches the answers, not the skill.
const runSeed = (id, fresh, attemptSeed) => (
  Number.isFinite(Number(attemptSeed))
    ? Number(attemptSeed) >>> 0
    : fresh ? (Math.random() * 4294967296) >>> 0 : daySeed(id)
);

// Timed rounds share one length and one clock reader.
const ROUND_S = 30, ROUND_MS = ROUND_S * 1000;
const msLeft = (endAt) => Math.max(0, Math.round(((endAt - performance.now()) / 1000) * 10) / 10);

const Dots = ({ n, done, color = T.blue }) => (
  <div style={{ display: "flex", gap: 6 }}>
    {Array.from({ length: n }).map((_, i) => (
      <div key={i} style={{ width: 24, height: 8, borderRadius: 3, border: `2px solid ${INK}`,
        background: i < done ? color : T.card2, transition: "background 200ms" }} />
    ))}
  </div>
);
const GameIntro = ({ icon, color, title, sub, onStart, cta = "Start" }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
    <div style={{ width: 84, height: 84, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center",
      ...sticker(color, T.shadow) }}>
      <Icon name={icon} size={40} color={inkOn(color)} strokeWidth={2.4} />
    </div>
    <div style={{ fontSize: 20, fontWeight: 900, fontFamily: T.display, color: INK, textTransform: "uppercase" }}>{title}</div>
    <div style={{ color: T.sub, textAlign: "center", fontSize: 13.5, fontWeight: 600, maxWidth: 280, lineHeight: 1.45 }}>{sub}</div>
    <BigButton color={color} onClick={onStart}>{cta}</BigButton>
  </div>
);

// ================= GAME: Duel Draw (signature) — react on green, HOLD on red =================
function DuelDrawGame({ onFinish, onBegin, rounds = 5, fresh, attemptSeed }) {
  const [phase, setPhase] = useState("intro"); // intro|wait|green|red|early|badhit|between|done
  const [shown, setShown] = useState(0);
  const res = useRef([]);
  const goAt = useRef(0);
  const t1 = useRef(null), t2 = useRef(null);
  // Seeded like the other games: which rounds are fakes, and how long each wait
  // runs, has to match for everyone on the daily or the scores aren't comparable.
  const rng = useRef(null);
  useEffect(() => () => { clearTimeout(t1.current); clearTimeout(t2.current); }, []);

  const commit = (ms) => {
    res.current.push(ms);
    setShown(res.current.length);
    if (res.current.length >= rounds) {
      const sum = res.current.reduce((a, b) => a + b, 0);
      const avg = Math.round(sum / res.current.length);
      // TIEBREAK secondary: the UNROUNDED average ms. pts round the average, so two
      // players can tie on pts while one is genuinely a hair faster. Lower = better.
      const avgExact = sum / res.current.length;
      setPhase("done");
      setTimeout(() => onFinish(avg, Math.max(100, 1000 - avg), `${avg} ms avg`, avgExact), 700);
    } else { setPhase("between"); t1.current = setTimeout(startRound, 720); }
  };
  const startRound = () => {
    if (!rng.current) rng.current = mulberry32(runSeed("draw", fresh, attemptSeed));
    setPhase("wait");
    const red = rng.current() < 0.32;
    const wait = 1100 + rng.current() * 1800;
    t1.current = setTimeout(() => {
      goAt.current = performance.now();
      if (red) {
        Sound.beep(300, 0.08, "triangle"); setPhase("red");
        t2.current = setTimeout(() => { Sound.beep(1050, 0.06); commit(210); }, 820); // held correctly
      } else { Sound.beep(1250, 0.06); setPhase("green"); }
    }, wait);
  };
  const tap = () => {
    if (phase === "intro") return startRound();
    if (phase === "done" || phase === "between") return;
    if (phase === "wait") { clearTimeout(t1.current); Sound.lose(); setPhase("early"); t2.current = setTimeout(() => commit(680), 800); return; }
    if (phase === "green") { Sound.beep(900, 0.07); commit(Math.round(performance.now() - goAt.current)); return; }
    if (phase === "red") { clearTimeout(t2.current); Sound.lose(); setPhase("badhit"); t2.current = setTimeout(() => commit(620), 800); return; }
  };
  const bg = { wait: "#2A2118", green: T.green, red: T.red, early: T.orange, badhit: T.red, between: T.card2, done: T.blue }[phase];
  const label = { wait: "Hold…", green: "FIRE!", red: "HOLD — fake!", early: "Too soon!", badhit: "That was a fake!", between: res.current.length ? `${res.current[res.current.length - 1]} ms` : "", done: "Done!" }[phase];
  if (phase === "intro")
    return <GameIntro icon="bolt" color={T.blue} title="Duel Draw" cta="Draw!"
      sub="Wait for GREEN, then fire. If it flashes RED — hold, don't shoot. 5 rounds, fastest average wins." onStart={() => { onBegin?.(); startRound(); }} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
      <Dots n={rounds} done={shown} />
      <button onClick={tap}
        style={{ width: "100%", height: 260, borderRadius: 18, border: `${T.bw} solid ${INK}`, cursor: "pointer",
          background: bg, color: inkOn(bg), boxShadow: T.shadow,
          fontSize: 26, fontWeight: 900, fontFamily: T.display, textTransform: "uppercase",
          transition: "background 90ms", WebkitTapHighlightColor: "transparent" }}>
        {label}
      </button>
      <div style={{ color: T.sub2, fontSize: 12, minHeight: 16 }}>{res.current.length > 0 && `${res.current.join(" · ")} ms`}</div>
    </div>
  );
}

// ================= GAME: Bullseye — stop the sweeper in the zone =================
function BullseyeGame({ onFinish, onBegin, rounds = 5, attemptSeed }) {
  const [phase, setPhase] = useState("intro"); // intro|play|hit|done
  const [pos, setPos] = useState(0);
  const [round, setRound] = useState(0);
  const [scores, setScores] = useState([]);
  const [lastAcc, setLastAcc] = useState(null);
  const posRef = useRef(0), dir = useRef(1), stopped = useRef(false), raf = useRef(null), markerRef = useRef(null);

  // Keep the hot animation path outside React rendering. Re-rendering this
  // component on every requestAnimationFrame can starve Chromium's paint step
  // on lower-power/mobile-sized production tabs: scoring keeps advancing, but
  // the marker looks frozen until STOP. The ref update paints independently,
  // while React state is only used to preserve the final stopped position.
  useEffect(() => {
    if (phase !== "play") return;

    const speed = 0.085 + round * 0.02; // %/ms — faster each round
    let last = performance.now();
    const loop = (t) => {
      if (stopped.current) return;
      const dt = Math.min(t - last, 64);
      last = t;
      let p = posRef.current + dir.current * speed * dt;
      if (p >= 100) { p = 100; dir.current = -1; }
      if (p <= 0) { p = 0; dir.current = 1; }
      posRef.current = p;
      if (markerRef.current) markerRef.current.style.left = `${p}%`;
      raf.current = requestAnimationFrame(loop);
    };

    if (markerRef.current) markerRef.current.style.left = `${posRef.current}%`;
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [phase, round]);

  const startRun = (r) => {
    setRound(r); stopped.current = false; posRef.current = 0; dir.current = 1; setPos(0); setLastAcc(null); setPhase("play");
  };
  const stop = () => {
    if (phase !== "play" || stopped.current) return;
    stopped.current = true; cancelAnimationFrame(raf.current);
    const dist = Math.abs(posRef.current - 50);
    const acc = Math.max(0, 1 - dist / 50);
    acc > 0.9 ? Sound.win() : acc > 0.6 ? Sound.beep(700, 0.08) : Sound.beep(320, 0.1, "triangle");
    setPos(posRef.current); setLastAcc(acc); setPhase("hit");
    const sc = [...scores, acc]; setScores(sc);
    setTimeout(() => {
      if (r_next(round) >= rounds) {
        const avg = sc.reduce((a, b) => a + b, 0) / sc.length;
        const pts = Math.round(120 + avg * 880);
        // TIEBREAK secondary: unrounded accuracy percent (pts round it). HIGHER = better.
        const accExact = avg * 100;
        setPhase("done"); setTimeout(() => onFinish(Math.round(avg * 100), pts, `${Math.round(avg * 100)}% accuracy`, accExact), 100);
      } else startRun(round + 1);
    }, 750);
  };
  const r_next = (r) => r + 1;
  const zone = Math.max(7, 18 - round * 2.2); // half-width %, shrinks
  if (phase === "intro")
    return <GameIntro icon="target" color={T.teal} title="Bullseye" cta="Start"
      sub="A marker sweeps back and forth. Tap to stop it dead-center. The target shrinks and speeds up each round." onStart={() => { onBegin?.(); startRun(0); }} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "center" }}>
      <Dots n={rounds} done={scores.length} color={T.teal} />
      <div style={{ width: "100%", height: 64, borderRadius: 18, position: "relative", overflow: "hidden",
        background: T.card2, border: `${T.bw} solid ${INK}` }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${50 - zone}%`, width: `${zone * 2}%`,
          background: `linear-gradient(90deg, ${T.teal}22, ${T.teal}44, ${T.teal}22)`, borderLeft: `2px dashed ${T.teal}88`, borderRight: `2px dashed ${T.teal}88` }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 2, background: `${T.teal}`, transform: "translateX(-50%)" }} />
        <div ref={markerRef} data-testid="bullseye-marker" style={{ position: "absolute", top: 6, bottom: 6, left: `${pos}%`, width: 8, borderRadius: 4, transform: "translateX(-50%)",
          background: "#fff", boxShadow: "0 0 14px rgba(255,255,255,0.8)", willChange: "left" }} />
      </div>
      <div style={{ minHeight: 22, fontSize: 15, fontWeight: 700, fontFamily: T.display,
        color: lastAcc == null ? T.sub : lastAcc > 0.9 ? T.green : lastAcc > 0.6 ? T.teal : T.orange }}>
        {lastAcc != null ? (lastAcc > 0.97 ? "PERFECT!" : `${Math.round(lastAcc * 100)}%`) : " "}
      </div>
      <BigButton color={T.teal} onClick={stop} style={{ opacity: phase === "play" ? 1 : 0.6 }}>STOP</BigButton>
    </div>
  );
}

// ================= GAME: Number Rush — tap 1→25 in order (Schulte) =================
function NumberRushGame({ onFinish, onBegin, fresh, attemptSeed }) {
  const N = 25;
  const [phase, setPhase] = useState("intro"); // intro|play|done
  const [next, setNext] = useState(1);
  const [wrong, setWrong] = useState(-1);
  const [now, setNow] = useState(0);
  const t0 = useRef(0);
  const nums = useRef([]);
  useEffect(() => { if (phase !== "play") return; const id = setInterval(() => setNow(performance.now()), 97); return () => clearInterval(id); }, [phase]);
  const start = () => {
    nums.current = shuffleSeeded(Array.from({ length: N }, (_, i) => i + 1), runSeed("numbers", fresh, attemptSeed));
    setNext(1); t0.current = performance.now(); setNow(t0.current); setPhase("play");
  };
  const tap = (n) => {
    if (phase !== "play") return;
    if (n === next) {
      Sound.beep(680 + next * 14, 0.045);
      if (next === N) {
        const el = (performance.now() - t0.current) / 1000;
        const pts = Math.max(120, Math.min(1000, Math.round(1000 - (el - 9) * 42)));
        // TIEBREAK secondary: full-precision completion seconds (raw is rounded to
        // 0.1s). Lower = better. A time-to-finish game, so this is the natural finer
        // measure, read off performance.now() like the fairness model requires.
        setPhase("done"); setTimeout(() => onFinish(Math.round(el * 10) / 10, pts, `${el.toFixed(1)}s`, el), 500);
      } else setNext(next + 1);
    } else { Sound.beep(300, 0.09, "triangle"); setWrong(n); setTimeout(() => setWrong(-1), 220); }
  };
  if (phase === "intro")
    return <GameIntro icon="grid" color={T.orange} title="Number Rush" cta="Start"
      sub="Tap the numbers 1 to 25 in order, as fast as you can. Same grid for everyone today." onStart={() => { onBegin?.(); start(); }} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Pill color={T.orange}>Next: {next}</Pill>
        <Pill color={T.teal}>{((now - t0.current) / 1000).toFixed(1)}s</Pill>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 7, width: "100%", maxWidth: 320 }}>
        {nums.current.map((n) => {
          const found = n < next;
          return (
            <button key={n} onClick={() => tap(n)}
              style={{ aspectRatio: "1", minWidth: 0, borderRadius: 10, fontSize: 20, fontWeight: 900, fontFamily: T.display,
                cursor: "pointer", border: `${T.bw} solid ${INK}`, transition: "background 120ms",
                // White tile + ink numerals: the beige fill washed the digits out entirely.
                background: wrong === n ? T.red : found ? T.green : T.card,
                color: wrong === n ? "#fff" : INK, boxShadow: found ? "none" : `2px 2px 0 ${INK}`,
                WebkitTapHighlightColor: "transparent" }}>
              {found ? "" : n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ================= GAME: Odd One Out — spot the different tile =================
function OddOneGame({ onFinish, onBegin, fresh, attemptSeed }) {
  const [phase, setPhase] = useState("intro"); // intro|play|done
  const [level, setLevel] = useState(1);
  const [time, setTime] = useState(ROUND_S);
  const [correct, setCorrect] = useState(0);
  const [flash, setFlash] = useState(-2); // -2 none, -1 wrong-any, idx correct
  const rng = useRef(null);
  const [board, setBoard] = useState(null);
  const makeBoard = (lv) => {
    const size = Math.min(6, 2 + Math.floor(lv / 2)); // 2..6
    const cells = size * size;
    const hue = Math.floor(rng.current() * 360);
    const sat = 62, light = 56;
    const delta = Math.max(4, 24 - lv * 1.6); // lightness diff shrinks
    const odd = Math.floor(rng.current() * cells);
    return { size, cells, base: `hsl(${hue} ${sat}% ${light}%)`, odd, oddColor: `hsl(${hue} ${sat}% ${light + delta}%)` };
  };
  const endAt = useRef(0);
  // TIEBREAK secondary (fixed 30s window, so "faster to finish" is meaningless):
  // ms from start to the LAST correct tap. Same count found sooner = better. LOWER =
  // better. null when nothing was found (no comparable signal → dead-heat push).
  const startAt = useRef(0);
  const lastCorrectAt = useRef(null);
  const start = () => {
    rng.current = mulberry32(runSeed("oddone", fresh, attemptSeed));
    startAt.current = performance.now();
    lastCorrectAt.current = null;
    endAt.current = startAt.current + ROUND_MS;
    setLevel(1); setCorrect(0); setTime(ROUND_S); setBoard(makeBoard(1)); setPhase("play");
  };
  // Clock reads off performance.now() rather than counting ticks — a chained
  // setTimeout drifts by however long React takes to render, which made the round
  // run ~8% long on desktop and longer still on a slow phone.
  useEffect(() => {
    if (phase !== "play") return;
    const id = setInterval(() => setTime(msLeft(endAt.current)), 100);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => { if (phase === "play" && time <= 0) finish(); }, [phase, time]);
  const finish = () => { setPhase("done"); const pts = Math.max(120, Math.min(1000, correct * 55 + 100)); const sec = lastCorrectAt.current != null ? lastCorrectAt.current - startAt.current : null; setTimeout(() => onFinish(correct, pts, `${correct} found`, sec), 300); };
  const tap = (i) => {
    if (phase !== "play" || !board) return;
    if (i === board.odd) { Sound.beep(720, 0.05); lastCorrectAt.current = performance.now(); setFlash(i); const lv = level + 1; setCorrect((c) => c + 1); setLevel(lv); setTimeout(() => { setFlash(-2); setBoard(makeBoard(lv)); }, 130); }
    else {
      Sound.beep(300, 0.09, "triangle"); setFlash(-1);
      endAt.current -= 1500; // penalty comes off the deadline, not the displayed value
      setTime(msLeft(endAt.current));
      setTimeout(() => setFlash(-2), 200);
    }
  };
  if (phase === "intro")
    return <GameIntro icon="target" color={T.purple} title="Odd One Out" cta="Start"
      sub="One tile is a slightly different shade. Tap it. It gets harder every time — 30 seconds, as many as you can." onStart={() => { onBegin?.(); start(); }} />;
  if (!board) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Pill color={T.purple}>{correct} found</Pill>
        <Pill color={time <= 5 ? T.red : T.teal}>{Math.max(0, time).toFixed(1)}s</Pill>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${board.size}, minmax(0, 1fr))`, gap: 6, width: "100%", maxWidth: 320,
        outline: flash === -1 ? `2px solid ${T.red}` : "none", outlineOffset: 4, borderRadius: 12 }}>
        {Array.from({ length: board.cells }).map((_, i) => (
          <button key={i} onClick={() => tap(i)}
            style={{ aspectRatio: "1", minWidth: 0, borderRadius: 8, border: `2px solid ${INK}`, cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
              background: i === board.odd ? board.oddColor : board.base,
              transform: flash === i ? "scale(0.9)" : "none", transition: "transform 120ms" }} />
        ))}
      </div>
    </div>
  );
}

// ================= GAME: Chimp Test — memorize the order =================
function ChimpGame({ onFinish, onBegin, fresh, attemptSeed }) {
  const SIZE = 5, CELLS = 25;
  const [phase, setPhase] = useState("intro"); // intro|show|recall|done
  const [n, setN] = useState(4);
  const [lives, setLives] = useState(3);
  const [best, setBest] = useState(0);
  const [next, setNext] = useState(1);
  const [flash, setFlash] = useState(-1);
  const [placement, setPlacement] = useState([]); // [{cell, num}]
  // One base seed per run; each round length derives its layout from it.
  const baseSeed = useRef(0);
  // TIEBREAK secondary: chimp has no time limit and reached-length IS the raw, so
  // capacity can't be split finer. The finer measure of the SAME skill is recall
  // FLUENCY — average ms per correct recall tap. Same length recalled faster =
  // better. LOWER = better. null if no correct taps landed (→ dead-heat push).
  const recallAt = useRef(0);   // when the current recall window opened / last tap
  const sumTapMs = useRef(0);
  const nTaps = useRef(0);
  const buildRound = (num) => {
    const cells = shuffleSeeded(Array.from({ length: CELLS }, (_, i) => i), (baseSeed.current ^ (num * 2654435761)) >>> 0).slice(0, num);
    setPlacement(cells.map((cell, idx) => ({ cell, num: idx + 1 })));
    setNext(1); setPhase("show");
    setTimeout(() => { setPhase("recall"); recallAt.current = performance.now(); }, 600 + num * 260);
  };
  const start = () => { baseSeed.current = runSeed("chimp", fresh, attemptSeed); sumTapMs.current = 0; nTaps.current = 0; setN(4); setLives(3); setBest(0); buildRound(4); };
  const cellNum = (cell) => placement.find((p) => p.cell === cell)?.num;
  const tap = (cell) => {
    if (phase !== "recall") return;
    const num = cellNum(cell);
    if (num === next) {
      const t = performance.now(); sumTapMs.current += t - recallAt.current; nTaps.current += 1; recallAt.current = t;
      Sound.beep(660 + next * 30, 0.05); setFlash(cell); setTimeout(() => setFlash(-1), 120);
      if (next === n) { const reached = n; setBest((b) => Math.max(b, reached)); const nn = n + 1; setN(nn); setTimeout(() => buildRound(nn), 350); }
      else setNext(next + 1);
    } else {
      Sound.lose();
      const lv = lives - 1; setLives(lv);
      if (lv <= 0) { setPhase("done"); const reached = Math.max(best, next - 1 >= 3 ? next - 1 : best); const pts = Math.max(120, Math.min(1000, (Math.max(best, n - 1) - 3) * 140 + 140)); const sec = nTaps.current > 0 ? sumTapMs.current / nTaps.current : null; setTimeout(() => onFinish(Math.max(best, n - 1), pts, `reached ${Math.max(best, n - 1)}`, sec), 300); }
      else buildRound(n); // retry same length
    }
  };
  if (phase === "intro")
    return <GameIntro icon="grid" color={T.green} title="Chimp Test" cta="Start"
      sub="Numbers appear, then vanish. Tap the cells in order from memory. One more each round — 3 lives." onStart={() => { onBegin?.(); start(); }} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Pill color={T.green}>Length {n}</Pill>
        <span style={{ display: "flex", gap: 3 }}>{[0, 1, 2].map((h) => (
          <Icon key={h} name="heart" size={15} color={h < lives ? T.red : T.card2} strokeWidth={0} style={{ fill: h < lives ? T.red : T.card2 }} />
        ))}</span>
      </div>
      <div style={{ color: T.sub, fontSize: 13, minHeight: 16 }}>{phase === "show" ? "Memorize…" : "Repeat the order"}</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))`, gap: 7, width: "100%", maxWidth: 320 }}>
        {Array.from({ length: CELLS }).map((_, cell) => {
          const num = cellNum(cell);
          const filled = num != null;
          return (
            <button key={cell} onClick={() => tap(cell)}
              style={{ aspectRatio: "1", minWidth: 0, borderRadius: 10, cursor: filled ? "pointer" : "default", WebkitTapHighlightColor: "transparent",
                border: `${T.bw} solid ${INK}`,
                // Ink numerals — white ones disappeared against the pale fills.
                background: flash === cell ? T.green : filled ? (phase === "show" ? T.yellow : T.card) : T.card2,
                color: INK, fontSize: 20, fontWeight: 900, fontFamily: T.display, transition: "background 100ms" }}>
              {phase === "show" && filled ? num : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ================= GAME: Quick Math — true or false, fast =================
function QuickMathGame({ onFinish, onBegin, fresh, attemptSeed }) {
  const [phase, setPhase] = useState("intro"); // intro|play|done
  const [time, setTime] = useState(ROUND_S);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [q, setQ] = useState(null);
  const [flash, setFlash] = useState(null); // 'ok'|'no'
  const rng = useRef(null);
  const gen = () => {
    const r = rng.current;
    const op = ["+", "−", "×"][Math.floor(r() * 3)];
    let a, b, ans;
    if (op === "×") { a = 2 + Math.floor(r() * 11); b = 2 + Math.floor(r() * 11); ans = a * b; }
    else if (op === "−") { a = 10 + Math.floor(r() * 80); b = 1 + Math.floor(r() * a); ans = a - b; }
    else { a = 5 + Math.floor(r() * 70); b = 5 + Math.floor(r() * 70); ans = a + b; }
    const truth = r() < 0.5;
    const shown = truth ? ans : ans + (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 6));
    setQ({ text: `${a} ${op} ${b} = ${shown}`, truth });
  };
  const endAt = useRef(0);
  // TIEBREAK secondary (fixed 30s window): ms from start to the LAST correct answer.
  // Same count answered sooner = faster = better. LOWER = better. null when nothing
  // was answered correctly (no comparable signal → dead-heat push).
  const startAt = useRef(0);
  const lastCorrectAt = useRef(null);
  const start = () => {
    rng.current = mulberry32(runSeed("quickmath", fresh, attemptSeed));
    startAt.current = performance.now();
    lastCorrectAt.current = null;
    endAt.current = startAt.current + ROUND_MS;
    setCorrect(0); setStreak(0); setTime(ROUND_S); setPhase("play"); gen();
  };
  useEffect(() => {
    if (phase !== "play") return;
    const id = setInterval(() => setTime(msLeft(endAt.current)), 100);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => {
    if (phase !== "play" || time > 0) return;
    setPhase("done");
    const pts = Math.max(120, Math.min(1000, correct * 45 + 100));
    const sec = lastCorrectAt.current != null ? lastCorrectAt.current - startAt.current : null;
    setTimeout(() => onFinish(correct, pts, `${correct} correct`, sec), 300);
  }, [phase, time]);
  const answer = (val) => {
    if (phase !== "play" || !q) return;
    if (val === q.truth) { Sound.beep(720, 0.05); lastCorrectAt.current = performance.now(); setCorrect((c) => c + 1); setStreak((s) => s + 1); setFlash("ok"); }
    else {
      Sound.beep(300, 0.09, "triangle"); setStreak(0);
      endAt.current -= 2000; // penalty off the deadline so the clock stays truthful
      setTime(msLeft(endAt.current));
      setFlash("no");
    }
    setTimeout(() => setFlash(null), 140); gen();
  };
  if (phase === "intro")
    return <GameIntro icon="divide" color={T.yellow} title="Quick Math" cta="Start"
      sub="Is the equation right or wrong? Tap ✓ or ✗ as fast as you can. 30 seconds — wrong answers cost time." onStart={() => { onBegin?.(); start(); }} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Pill color={T.green}>{correct} correct</Pill>
        {streak >= 3 && <Pill color={T.orange}>{streak} streak</Pill>}
        <Pill color={time <= 5 ? T.red : T.teal}>{Math.max(0, time).toFixed(1)}s</Pill>
      </div>
      <div style={{ width: "100%", height: 150, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 40, fontWeight: 900, fontFamily: T.display, letterSpacing: 1, color: INK,
        background: flash === "ok" ? T.green : flash === "no" ? T.red : T.card,
        border: `${T.bw} solid ${INK}`, boxShadow: T.shadow, transition: "background 100ms" }}>
        {q?.text}
      </div>
      <div style={{ display: "flex", gap: 12, width: "100%" }}>
        <button onClick={() => answer(false)} className="pressable"
          style={{ flex: 1, height: 76, borderRadius: 14, border: `${T.bw} solid ${INK}`, background: T.red, boxShadow: T.shadowMd, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="x" size={34} color="#fff" strokeWidth={3} />
        </button>
        <button onClick={() => answer(true)} className="pressable"
          style={{ flex: 1, height: 76, borderRadius: 14, border: `${T.bw} solid ${INK}`, background: T.green, boxShadow: T.shadowMd, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="check" size={34} color={INK} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

// Friendly text for every settle/eligibility error code the backend can return.
// Used by the duel result screen and by App's stake/pre-flight guards. Kept at
// module scope so both share ONE mapping and can never drift.
const duelErrText = (code) => ({
  out_of_band: "That player is out of your matchmaking range now.",
  shielded: "That player is shielded right now — no points to take.",
  graced: "That player is too new to duel yet.",
  cooldown: "You already dueled this player today.",
  pair_cooldown: "You already dueled this player today.",
  no_target_score: "That player hasn't played this game today.",
  self: "You can't duel yourself.",
  bad_stake: "That stake isn't allowed.",
  daily_limit: "You've reached today's duel limit.",
  attempt_limit: "Too many attempts opened today — try again tomorrow.",
  invalid_attempt: "Game attempt couldn't be verified — reopen the game.",
  attempt_used: "That game attempt was already submitted.",
  attempt_expired: "Game attempt expired — reopen the game.",
  attempt_too_fast: "That result arrived too quickly to verify.",
  already_scored: "This game already has a scored attempt today.",
  inputs_too_large: "That duel result was too large to verify.",
  wrong_period: "The daily challenge rolled over — reopen the duel.",
  implausible_raw: "That result looked off and was rejected.",
  not_authenticated: "You need to be signed in to duel.",
  offline: "Duels need a connection — try again in a moment.",
  rejected: "That result looked off and was rejected.",
  unavailable: "That player isn't duelable right now.",
}[code] || "Couldn't settle the duel — no points changed.");

// ================= 1v1 Duel =================
// Two modes:
//   * SERVER mode (onSettle provided): the challenger plays a FRESH attempt and the
//     SERVER decides win/loss and moves points. The client sends only `raw`; it
//     renders whatever verdict comes back and NEVER computes points itself.
//   * OFFLINE fallback (no onSettle): the old fake-oppScore path, so the app still
//     works with no backend / no keys. Points here are display-only.
function DuelScreen({ opponent, onDone, avatar, username, stake = 0, gameId = "draw", onSettle = null, target = null, attemptSeed = null }) {
  const [phase, setPhase] = useState("vs"); // vs | play | settling | result | error
  const [count, setCount] = useState(3);
  const [myScore, setMyScore] = useState(null);   // {raw, pts, label}
  const [verdict, setVerdict] = useState(null);    // server verdict object (server mode)
  const [errCode, setErrCode] = useState(null);    // settle/eligibility error code (server mode)
  const settling = useRef(false);                  // guard: settle exactly once
  const game = GAMES.find((g) => g.id === gameId) || GAMES[0];
  const server = typeof onSettle === "function";

  useEffect(() => {
    if (phase !== "vs") return;
    if (count <= 0) { setPhase("play"); return; }
    Sound.beep(count === 1 ? 1000 : 600, 0.1);
    const t = setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(t);
  }, [count, phase]);

  // OFFLINE-ONLY opponent score. Derived from the opponent's season pts so a good
  // run can still win. Never used in server mode — the server owns the verdict.
  const oppScore = useRef((() => {
    const skill = typeof opponent.skill === "number"
      ? opponent.skill
      : 620 - Math.min(300, Math.round((opponent.pts || 0) / 14));
    const base = Math.max(150, Math.min(920, Math.round(1000 - skill + (Math.random() * 120 - 60))));
    const labels = {
      draw: `${Math.max(120, 1000 - base)} ms avg`,
      bullseye: `${Math.round(base / 10)}% accuracy`,
      numbers: `${(9 + (1000 - base) / 42).toFixed(1)}s`,
      oddone: `${Math.round((base - 100) / 55)} found`,
      chimp: `reached ${Math.max(4, Math.round((base - 140) / 140 + 3))}`,
      quickmath: `${Math.round((base - 100) / 45)} correct`,
    };
    return { pts: base, label: labels[gameId] || `${base} pts` };
  })());

  const finishPlay = async (raw, pts, label, secondary) => {
    setMyScore({ raw, pts, label });
    if (server) {
      if (settling.current) return; // never settle twice
      settling.current = true;
      setPhase("settling");
      let v;
      try {
        v = await onSettle({ raw, pts, label, secondary });
      } catch (e) {
        v = { ok: false, error: "unknown" };
      }
      if (!v || v.ok === false) {
        setErrCode(v && v.error ? v.error : "unknown");
        setPhase("error");
        return;
      }
      setVerdict(v);
      setPhase("result");
      // A push is neither a win nor a loss — give it its own soft cue.
      setTimeout(() => (v.tie ? Sound.beep(520, 0.12) : v.won ? Sound.win() : Sound.lose()), 300);
    } else {
      setPhase("result");
      const won = pts > oppScore.current.pts;
      setTimeout(() => (won ? Sound.win() : Sound.lose()), 300);
    }
  };

  if (phase === "vs") {
    const toBeat = server && target && target.snapshotLabel;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, paddingTop: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ marginBottom: 6 }}><Avatar id={avatar} size={84} ring /></div>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.blue }}>{username}</div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: T.red }}>VS</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ marginBottom: 6 }}><Avatar id={opponent.avatar} size={84} ring /></div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{opponent.name}</div>
          </div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: T.sub, fontSize: 14 }}>
          <Icon name={game.icon} size={16} color={game.color} /> {game.name} · best score wins
        </div>
        {toBeat && (
          <div style={{ ...sticker(T.card, T.shadowSm), borderRadius: 10, padding: "7px 13px", fontSize: 13, fontWeight: 800, color: T.text }}>
            Score to beat: <span style={{ color: T.red }}>{target.snapshotLabel}</span>
          </div>
        )}
        {stake > 0 && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: T.yellow,
            border: `1px solid ${T.yellow}44`, borderRadius: 999, padding: "6px 14px", color: T.yellow, fontSize: 14, fontWeight: 600 }}>
            <Icon name="trophy" size={14} color={T.yellow} /> {stake} points on the line
          </div>
        )}
        <div style={{ fontSize: 64, fontWeight: 700, color: T.yellow, fontFamily: T.display }}>{count > 0 ? count : "GO!"}</div>
      </div>
    );
  }

  if (phase === "play") {
    const on = (raw, pts, label, secondary) => finishPlay(raw, pts, label, secondary);
    // fresh={true} ALWAYS for duels. A duel is a separate, unscored attempt — it
    // must NOT reuse daySeed's grid (the one the challenger already memorized in
    // their own daily run). Passing fresh makes each seeded game draw a random
    // seed (runSeed → Math.random), closing the replay-a-memorized-grid exploit
    // once duel points are real. (Bullseye carries no seed, so fresh is a no-op
    // there — passed for consistency.)
    return (
      <div>
        {gameId === "draw" && <DuelDrawGame rounds={3} onFinish={on} fresh attemptSeed={attemptSeed} />}
        {gameId === "bullseye" && <BullseyeGame rounds={3} onFinish={on} fresh attemptSeed={attemptSeed} />}
        {gameId === "numbers" && <NumberRushGame onFinish={on} fresh attemptSeed={attemptSeed} />}
        {gameId === "oddone" && <OddOneGame onFinish={on} fresh attemptSeed={attemptSeed} />}
        {gameId === "chimp" && <ChimpGame onFinish={on} fresh attemptSeed={attemptSeed} />}
        {gameId === "quickmath" && <QuickMathGame onFinish={on} fresh attemptSeed={attemptSeed} />}
      </div>
    );
  }

  if (phase === "settling") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 50 }}>
        <div style={{ display: "inline-flex", animation: "spinSlow 0.7s linear infinite" }}>
          <Icon name="swords" size={40} color={T.red} strokeWidth={2.2} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.display, color: T.text }}>Settling duel…</div>
        <div style={{ color: T.sub, fontSize: 13, textAlign: "center", maxWidth: 240 }}>
          Checking your run against {opponent.name}'s score on the server.
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 30 }}>
        <div style={{ width: 88, height: 88, borderRadius: 28, display: "flex", alignItems: "center", justifyContent: "center",
          ...sticker(T.card2, "none") }}>
          <Icon name="shield" size={40} color={T.sub} strokeWidth={2} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: T.text, fontFamily: T.display, textTransform: "uppercase" }}>No result</div>
        <Card style={{ width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>{duelErrText(errCode)}</div>
          <div style={{ color: T.sub, fontSize: 12, marginTop: 8 }}>No points changed hands.</div>
        </Card>
        <BigButton onClick={() => onDone({ error: true, message: duelErrText(errCode) })}>Continue</BigButton>
      </div>
    );
  }

  // The finer, same-skill metric each game breaks a points tie on. Kept in words so
  // the result screen can explain WHY a dead-even score still had a winner.
  const metricWord = { draw: "speed", numbers: "speed", oddone: "speed", quickmath: "speed", chimp: "recall speed", bullseye: "precision" }[gameId] || "the tiebreak";

  // ---- exact push (dead heat) ---------------------------------------------
  // Equal points AND equal/incomparable secondary: nobody wins, nothing moves, and
  // the duel is refunded (App decrements challengesUsed on { tie: true }).
  if (server && verdict.tie) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 24 }}>
        <div style={{ width: 88, height: 88, borderRadius: 28, display: "flex", alignItems: "center", justifyContent: "center",
          ...sticker(T.yellow, T.shadow) }}>
          <Icon name="swords" size={42} color={INK} strokeWidth={2.2} />
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color: INK, fontFamily: T.display, textTransform: "uppercase" }}>Dead heat</div>
        <Card style={{ width: "100%", display: "flex", justifyContent: "space-around", textAlign: "center" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}><Avatar id={avatar} size={40} /></div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.text }}>{myScore.label}</div>
            <div style={{ color: T.sub, fontSize: 12 }}>{username}</div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}><Avatar id={opponent.avatar} size={40} /></div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.text }}>{verdict.defender_label}</div>
            <div style={{ color: T.sub, fontSize: 12 }}>{opponent.name}</div>
          </div>
        </Card>
        <div style={{ ...sticker(T.card, T.shadowSm), borderRadius: 12, padding: "12px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>No points moved — duel refunded</div>
          <div style={{ color: T.sub, fontSize: 12.5, marginTop: 4 }}>You and {opponent.name} tied on score and on {metricWord}. This one didn't cost you a duel.</div>
        </div>
        <BigButton onClick={() => onDone({ tie: true, won: false, transferred: 0, stake })}>Continue</BigButton>
      </div>
    );
  }

  // ---- result --------------------------------------------------------------
  const won = server ? !!verdict.won : myScore.pts > oppScore.current.pts;
  const oppLabel = server ? verdict.defender_label : oppScore.current.label;
  const moved = server ? (Number(verdict.transferred) || 0) : stake;
  const partial = server ? (won && moved < stake) : false;
  const pointsTie = server && !!verdict.points_tie; // equal score, secondary decided it
  const doneArg = server
    ? { won, transferred: moved, partial: !!verdict.partial || partial, stake }
    : { won, transferred: stake, partial: false, offline: true };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 20 }}>
      <div style={{ width: 88, height: 88, borderRadius: 28, display: "flex", alignItems: "center", justifyContent: "center",
        background: `linear-gradient(135deg, ${won ? T.green : T.red}30, ${won ? T.green : T.red}0d)`,
        border: `1px solid ${won ? T.green : T.red}44`, boxShadow: `0 8px 30px ${won ? T.green : T.red}33` }}>
        <Icon name={won ? "trophy" : "skull"} size={44} color={won ? T.gold : T.red} strokeWidth={2} />
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: won ? T.green : T.red, fontFamily: T.display }}>{won ? "WIN!" : "LOSS"}</div>
      {pointsTie && (
        <div style={{ ...sticker(T.yellow, T.shadowSm), borderRadius: 999, padding: "5px 14px", fontSize: 12.5, fontWeight: 800, color: INK, textAlign: "center" }}>
          {won ? `Tied on score — you won on ${metricWord}!` : `Tied on score — ${opponent.name} edged you on ${metricWord}`}
        </div>
      )}
      <Card style={{ width: "100%", display: "flex", justifyContent: "space-around", textAlign: "center" }}>
        <div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}><Avatar id={avatar} size={40} /></div>
          <div style={{ fontSize: 22, fontWeight: 800, color: won ? T.green : T.text }}>{myScore.label}</div>
          <div style={{ color: T.sub, fontSize: 12 }}>{username}</div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}><Avatar id={opponent.avatar} size={40} /></div>
          <div style={{ fontSize: 22, fontWeight: 800, color: !won ? T.green : T.text }}>{oppLabel}</div>
          <div style={{ color: T.sub, fontSize: 12 }}>{opponent.name}</div>
        </div>
      </Card>
      {stake > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 30, fontWeight: 700, fontFamily: T.display, color: won ? T.green : T.red }}>
            {won ? "+" : "−"}{moved} pts
          </div>
          <div style={{ color: T.sub, fontSize: 13, textAlign: "center", maxWidth: 280 }}>
            {won
              ? (moved === 0
                  ? `${opponent.name} was shielded — you won, but there were no points to take`
                  : partial
                    ? `You took ${moved} of ${stake} from ${opponent.name} (their shield/floor capped it)`
                    : `You took ${moved} points from ${opponent.name}`)
              : (moved === 0
                  ? `You had no points to lose`
                  : `${opponent.name} took ${moved} points from you`)}
          </div>
        </div>
      ) : (
        won && <Pill color={T.yellow}>+40 pts</Pill>
      )}
      <BigButton onClick={() => onDone(doneArg)}>Continue</BigButton>
    </div>
  );
}

// ================= Reward opening animation =================

// ================= Run reveal / points claim =================
// The one screen where points are actually banked. Full-bleed yellow panel:
// score → how you did against the field → what it moved → your drop → collect.
// Every drop pays out coins for real — nothing here is decorative. The mockup had
// a "2× booster" and a "frame shard" too, but neither exists in the game yet and a
// reward that silently does nothing is worse than no reward.
const DROPS = [
  { icon: "🪙", title: "+5 coins", sub: "Every bit counts", coins: 5 },
  { icon: "🪙", title: "+10 coins", sub: "Nice drop!", coins: 10 },
  { icon: "💰", title: "+15 coins", sub: "Good haul", coins: 15 },
  { icon: "💰", title: "+20 coins", sub: "Great drop!", coins: 20 },
  { icon: "💎", title: "+25 coins", sub: "Lucky drop!", coins: 25 },
  { icon: "👑", title: "+50 coins", sub: "Jackpot — rare one!", coins: 50 },
];
const DROP_AMOUNTS = [5, 5, 5, 10, 10, 10, 15, 15, 20, 25, 25, 50];
const dropForCoins = (coins) => DROPS.find((drop) => drop.coins === coins) || {
  icon: "🪙",
  title: `+${coins} coins`,
  sub: "Reward collected",
  coins,
};
const rollDrop = () => dropForCoins(DROP_AMOUNTS[Math.floor(Math.random() * DROP_AMOUNTS.length)]);

function RevealOverlay({ headline = "Run complete", result, score, pct, rankUp = 0, streak, drop, onOpenDrop, onCollect }) {
  const [openedDrop, setOpenedDrop] = useState(null);
  const [opening, setOpening] = useState(false);
  useEffect(() => { Sound.win(); }, []);

  const openDrop = async () => {
    if (opening || openedDrop) return;
    setOpening(true);
    const resolved = await onOpenDrop(drop);
    setOpening(false);
    if (resolved) {
      setOpenedDrop(resolved);
      Sound.win();
    }
  };

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 300, background: T.yellow,
      display: "flex", flexDirection: "column", padding: "30px 24px 26px",
      animation: "sheetup 300ms ease both", overflowY: "auto" }} className="sd-scroll">

      <div style={{ textAlign: "center", flexShrink: 0 }}>
        <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 12, letterSpacing: "0.2em", color: INK,
          textTransform: "uppercase", animation: "burst 500ms ease both" }}>{headline}</div>
        <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 68, color: INK, lineHeight: 1, marginTop: 8,
          animation: "burst 500ms 50ms ease both" }}>{score}</div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: INK, letterSpacing: "0.04em" }}>POINTS EARNED</div>
        {result && (
          <div style={{ fontSize: 12, fontWeight: 700, color: "#5C5320", marginTop: 4 }}>{result}</div>
        )}
      </div>

      {/* How you did against everyone else today */}
      {pct != null && (
        <div style={{ marginTop: 22, flexShrink: 0, ...sticker(T.card, T.shadowMd), borderRadius: 14, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 800, fontSize: 13 }}>
            <span style={{ color: INK }}>FASTER THAN</span>
            <span style={{ fontFamily: T.display, color: T.blue, fontSize: 17 }}>{pct}%</span>
          </div>
          <div style={{ height: 14, borderRadius: 5, border: `${T.bw} solid ${INK}`, background: T.bg,
            marginTop: 10, overflow: "hidden" }}>
            <div style={{ height: "100%", background: T.blue, width: `${pct}%`,
              transition: "width 800ms cubic-bezier(.22,1,.36,1)" }} />
          </div>
          <div style={{ fontSize: 11, color: T.sub2, fontWeight: 700, marginTop: 7 }}>of everyone who played today</div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12, flexShrink: 0 }}>
        <div style={{ ...sticker(T.green, T.shadowSm), borderRadius: 12, padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#083D28" }}>RANK</div>
          <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 22, color: INK, marginTop: 3 }}>
            {rankUp > 0 ? `▲ ${rankUp}` : "—"}
          </div>
        </div>
        <div style={{ ...sticker(T.red, T.shadowSm), borderRadius: 12, padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#fff" }}>STREAK</div>
          <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 22, color: "#fff", marginTop: 3 }}>🔥 {streak}</div>
        </div>
      </div>

      {/* The drop — the reason to sit through the reveal */}
      <div style={{ flex: 1, minHeight: 150, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: "16px 0" }}>
        {openedDrop ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
            animation: "burst 500ms ease both" }}>
            <div style={{ fontSize: 60 }}>{openedDrop.icon}</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 20, color: INK, textTransform: "uppercase" }}>{openedDrop.title}</div>
              <div style={{ fontSize: 13, color: T.sub, fontWeight: 700, marginTop: 2 }}>{openedDrop.sub}</div>
            </div>
          </div>
        ) : (
          <button onClick={openDrop} disabled={opening}
            style={{ border: "none", background: "none", cursor: opening ? "wait" : "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 78, animation: "dropwiggle 1.1s ease-in-out infinite" }}>🎁</div>
            <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 15, color: INK, textTransform: "uppercase" }}>
              {opening ? "Opening…" : "Tap to open your drop"}
            </div>
          </button>
        )}
      </div>

      <button className="pressable" onClick={() => onCollect(openedDrop)}
        style={{ width: "100%", flexShrink: 0, border: `${T.bw} solid ${INK}`, cursor: "pointer", padding: 16,
          borderRadius: 12, background: INK, color: T.yellow, boxShadow: "4px 4px 0 rgba(20,18,15,0.35)",
          fontFamily: T.display, fontWeight: 900, fontSize: 16, textTransform: "uppercase" }}>
        {openedDrop ? "Collect & continue" : "Skip drop"}
      </button>
    </div>
  );
}

// ================= Account gateway =================
function AuthGateway({ onGuest, onSignUp, onSignIn, onGoogle }) {
  const [mode, setMode] = useState("welcome");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const inputStyle = {
    width: "100%",
    padding: "14px 15px",
    borderRadius: 12,
    border: `${T.bw} solid ${INK}`,
    background: T.card,
    color: INK,
    fontFamily: T.font,
    fontSize: 15,
    fontWeight: 700,
    outline: "none",
    boxSizing: "border-box",
  };

  const run = async (action) => {
    if (busy) return;
    setError("");
    setNotice("");
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result?.ok) {
      setError(result?.message || "Something went wrong. Please try again.");
      return;
    }
    if (result.confirmationRequired) {
      setNotice("Check your email to confirm the account, then come back and sign in.");
      setPassword("");
    }
  };

  const submitEmail = (event) => {
    event.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    run(() => mode === "signup"
      ? onSignUp(cleanEmail, password)
      : onSignIn(cleanEmail, password));
  };

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setNotice("");
    setPassword("");
  };

  return (
    <div className="sd-scroll" style={{ height: "100%", overflowY: "auto", boxSizing: "border-box",
      padding: "52px 24px 34px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <BrandMark size={82} />
      <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 34, color: INK,
        textTransform: "uppercase", letterSpacing: "-0.03em", marginTop: 14 }}>Skill Duels</div>
      <div style={{ color: T.sub, fontWeight: 700, fontSize: 14, textAlign: "center",
        lineHeight: 1.5, marginTop: 5, marginBottom: 24 }}>
        Your score. Your rivals. Your account.
      </div>

      <div style={{ width: "100%", ...sticker(T.card, T.shadow), borderRadius: 18, padding: 18,
        boxSizing: "border-box" }}>
        {mode === "welcome" ? (
          <>
            <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 21, color: INK,
              textTransform: "uppercase", marginBottom: 5 }}>Ready to play?</div>
            <div style={{ color: T.sub, fontSize: 12.5, fontWeight: 700, lineHeight: 1.45, marginBottom: 17 }}>
              Create a new account, sign in, or try the game as a guest.
            </div>
            <BigButton color={T.yellow} onClick={() => switchMode("signup")} disabled={busy}>
              Create account
            </BigButton>
            <BigButton color={T.card2} onClick={() => switchMode("signin")} disabled={busy}
              style={{ marginTop: 11, boxShadow: T.shadowSm }}>
              Sign in with email
            </BigButton>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "17px 0",
              color: T.sub2, fontSize: 11, fontWeight: 800 }}>
              <div style={{ height: 2, background: T.card2, flex: 1 }} />OR<div style={{ height: 2, background: T.card2, flex: 1 }} />
            </div>
            <BigButton color={T.card} onClick={() => run(onGoogle)} disabled={busy}
              style={{ boxShadow: T.shadowSm }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
                <span aria-hidden="true" style={{ width: 23, height: 23, borderRadius: 7, background: "#fff",
                  border: `2px solid ${INK}`, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: T.blue, fontFamily: T.display, fontWeight: 900, fontSize: 14 }}>G</span>
                Continue with Google
              </span>
            </BigButton>
            <button type="button" onClick={() => run(onGuest)} disabled={busy}
              style={{ width: "100%", border: 0, background: "transparent", color: T.sub, cursor: busy ? "wait" : "pointer",
                padding: "15px 6px 2px", fontFamily: T.font, fontWeight: 800, fontSize: 13 }}>
              Continue as guest
            </button>
            <div style={{ color: T.sub2, fontSize: 10.5, lineHeight: 1.45, textAlign: "center", marginTop: 8 }}>
              Guest progress stays on this device until you secure it with Google.
            </div>
          </>
        ) : (
          <form onSubmit={submitEmail}>
            <button type="button" onClick={() => switchMode("welcome")}
              style={{ border: 0, background: "transparent", padding: "0 0 12px", cursor: "pointer",
                color: T.sub, fontFamily: T.font, fontWeight: 800, fontSize: 13 }}>
              ← Back
            </button>
            <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 21, color: INK,
              textTransform: "uppercase", marginBottom: 16 }}>
              {mode === "signup" ? "Create account" : "Welcome back"}
            </div>
            <label style={{ display: "block", color: T.sub, fontSize: 11, fontWeight: 800, marginBottom: 6 }}>
              EMAIL
            </label>
            <input aria-label="Email" type="email" autoComplete="email" value={email}
              onChange={(event) => setEmail(event.target.value)} style={inputStyle} />
            <label style={{ display: "block", color: T.sub, fontSize: 11, fontWeight: 800,
              marginTop: 13, marginBottom: 6 }}>PASSWORD</label>
            <input aria-label="Password" type="password" minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password} onChange={(event) => setPassword(event.target.value)} style={inputStyle} />
            <div style={{ color: T.sub2, fontSize: 10.5, fontWeight: 700, margin: "7px 0 15px" }}>
              Minimum 8 characters.
            </div>
            <BigButton type="submit" color={mode === "signup" ? T.yellow : T.blue} disabled={busy}>
              {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
            </BigButton>
            <button type="button" onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
              style={{ width: "100%", border: 0, background: "transparent", color: T.sub, cursor: "pointer",
                padding: "15px 6px 0", fontFamily: T.font, fontWeight: 800, fontSize: 12.5 }}>
              {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
            </button>
          </form>
        )}

        {error && (
          <div role="alert" style={{ ...sticker(T.red, "none"), borderRadius: 10, padding: "9px 11px",
            color: inkOn(T.red), fontSize: 12, fontWeight: 800, lineHeight: 1.4, marginTop: 14 }}>
            {error}
          </div>
        )}
        {notice && (
          <div role="status" style={{ ...sticker(T.green, "none"), borderRadius: 10, padding: "9px 11px",
            color: inkOn(T.green), fontSize: 12, fontWeight: 800, lineHeight: 1.4, marginTop: 14 }}>
            {notice}
          </div>
        )}
      </div>
      <div style={{ color: T.sub2, fontSize: 10.5, lineHeight: 1.45, textAlign: "center", marginTop: 17,
        maxWidth: 300 }}>
        Google sign-in requests only your basic profile and email. It does not read Gmail messages.
      </div>
    </div>
  );
}

// ================= Onboarding =================
// ================= Scoring guide =================
const SCORING = [
  { icon: "bolt",   color: T.blue,   name: "Duel Draw",   rule: "faster average time", ex: "300ms → 700 pts" },
  { icon: "target", color: T.teal,   name: "Bullseye",    rule: "closer to center",    ex: "90% → 900 pts" },
  { icon: "grid",   color: T.orange, name: "Number Rush", rule: "beat the clock",      ex: "18s → 630 pts" },
  { icon: "target", color: T.purple, name: "Odd One Out", rule: "tiles you spot",      ex: "12 found → 760 pts" },
  { icon: "grid",   color: T.green,  name: "Chimp Test",  rule: "longest sequence",    ex: "reach 8 → 840 pts" },
  { icon: "divide", color: T.yellow, name: "Quick Math",  rule: "correct answers",     ex: "15 → 775 pts" },
];

function PointsGuide() {
  return (
    <div style={{ width: "100%" }}>
      {SCORING.map((r) => (
        <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
          borderBottom: `2px solid ${INK}` }}>
          <div style={{ width: 42, height: 42, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, background: r.color, border: `${T.bw} solid ${INK}` }}>
            <Icon name={r.icon} size={20} color={inkOn(r.color)} strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{r.name}</div>
            <div style={{ color: T.sub, fontSize: 12.5 }}>{r.rule}</div>
          </div>
          <div style={{ color: r.color, fontSize: 11.5, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>{r.ex}</div>
        </div>
      ))}
      <div style={{ background: T.card2, border: `${T.bw} solid ${INK}`, borderRadius: 16,
        padding: "12px 14px", marginTop: 14, color: T.sub, fontSize: 12.5, lineHeight: 1.75 }}>
        <b style={{ color: T.text }}>Max:</b> 1000 pts per game, {GAMES.length * 1000} + bonus daily<br />
        <b style={{ color: T.text }}>ELO:</b> (pts − 480) ÷ 22 per duel · capped −15 to +28<br />
        <b style={{ color: T.text }}>Bonus:</b> +50 pts daily streak gift<br />
        <b style={{ color: T.text }}>Season Points:</b> one score for everything · ranking & rewards from it · resets monthly
      </div>
    </div>
  );
}

// Plain-player explainer for how duels work — kept short and scannable.
// One icon + one line per row; a worked example at the foot. Shown on demand
// (the ℹ buttons on the duel sheets) and auto-shown once on a player's first duel.
const DUEL_STEPS = [
  { icon: "swords",  color: T.blue,   title: "Challenge & stake",   line: "Pick a rival and stake 50, 100 or 200 Season Points." },
  { icon: "bolt",    color: T.red,    title: "Same game, your turn", line: "You play one mini-game fresh, racing their real score from today." },
  { icon: "trophy",  color: T.green,  title: "Winner takes the points", line: "Beat their score and you take the stake. Fall short and they take yours." },
  { icon: "shield",  color: T.purple, title: "You're always protected", line: "A daily shield caps what you can lose at 300 pts, one hit per rival, never below 0." },
  { icon: "target",  color: T.yellow, title: "Why some are greyed out", line: "You can only duel players who've played that game today." },
  { icon: "coin",    color: T.blue,   title: "Skill, not gambling",  line: "Better score wins. Points are just a score — they can't be cashed out." },
];

function DuelGuide() {
  return (
    <div style={{ width: "100%" }}>
      {DUEL_STEPS.map((r) => (
        <div key={r.title} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
          borderBottom: `2px solid ${INK}` }}>
          <div style={{ width: 42, height: 42, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, background: r.color, border: `${T.bw} solid ${INK}` }}>
            <Icon name={r.icon} size={20} color={inkOn(r.color)} strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{r.title}</div>
            <div style={{ color: T.sub, fontSize: 12.5, lineHeight: 1.35 }}>{r.line}</div>
          </div>
        </div>
      ))}
      {/* Worked example — the fastest way to make the mechanic click. */}
      <div style={{ background: T.card2, border: `${T.bw} solid ${INK}`, borderRadius: 16,
        padding: "12px 14px", marginTop: 14, fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.7 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, color: T.sub, marginBottom: 4 }}>FOR EXAMPLE</div>
        Stake <span style={{ color: T.text }}>100</span> → beat their score → <span style={{ color: T.green }}>+100 pts</span><br />
        Stake <span style={{ color: T.text }}>100</span> → lose → <span style={{ color: T.red }}>−100 pts</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.sub2, fontSize: 12,
        justifyContent: "center", marginTop: 12 }}>
        <Icon name="bolt" size={13} color={T.sub2} /> 3 free duels a day · watch ads for up to 8
      </div>
    </div>
  );
}

// Small "How it works" affordance that sits on the duel sheets and reopens the
// explainer. Real hit target (>=28px), reads as a link but is a proper button.
function DuelHelpLink({ onOpen }) {
  return (
    <button onClick={onOpen} className="pressable"
      style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
        padding: "6px 10px", minHeight: 30, borderRadius: 999, ...sticker(T.card, T.shadowSm),
        fontSize: 12, fontWeight: 800, color: T.text, whiteSpace: "nowrap" }}>
      <Icon name="help" size={14} color={T.red} strokeWidth={2.2} />How it works
    </button>
  );
}

// ================= Onboarding =================
function Onboarding({ onDone, onClaimNickname }) {
  const [step, setStep] = useState(0);
  const [avatar, setAvatar] = useState("knight");
  const [name, setName] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [nameErr, setNameErr] = useState(null);
  const next = () => { Sound.beep(720, 0.06); setStep((x) => x + 1); };

  // Step-0 Continue: claim the nickname against the DB (unique + validated) before
  // moving on. Success advances; a taken/invalid name shows an inline error.
  const submitName = async () => {
    if (!name.trim() || claiming) return;
    setNameErr(null);
    setClaiming(true);
    const res = onClaimNickname ? await onClaimNickname(name.trim(), avatar) : { ok: true };
    setClaiming(false);
    if (res.ok) { next(); return; }
    setNameErr(
      res.error === "taken" ? "That nickname is taken — try another." :
      res.error === "invalid" ? (res.message || "That nickname isn't allowed.") :
      "Couldn't reserve that name. Check your connection and try again."
    );
    Sound.beep(200, 0.12);
  };

  const GUIDE = [
    { icon: "bolt", color: T.blue, title: `${GAMES.length} games a day`, sub: "Reflex & brain challenges — the same for everyone, fresh at midnight" },
    { icon: "flame", color: T.orange, title: "One shot each", sub: "Your first try is scored. After that, practice all you want." },
    { icon: "swords", color: T.red, title: "Duel anyone 1v1", sub: "Stake your points, beat their score, take them" },
    { icon: "trophy", color: T.gold, title: "Climb the ranks", sub: "Daily leaderboard · monthly seasons · real rewards" },
  ];

  return (
    <div className="sd-scroll" style={{ padding: "56px 24px 36px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
      height: "100%", overflowY: "auto", boxSizing: "border-box" }}>
      {step === 0 && (
        <>
          <BrandMark size={82} />
          <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-0.02em", fontFamily: T.display,
            color: INK, textTransform: "uppercase", marginTop: 14 }}>Skill Duels</div>
          <div style={{ color: T.sub, fontSize: 15, textAlign: "center", marginBottom: 22 }}>
            One challenge a day.<br />One attempt. Who's the fastest?
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <Avatar id={avatar} size={110} ring />
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.sub, alignSelf: "flex-start", letterSpacing: 0.3, marginBottom: 8 }}>PICK AN AVATAR</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, width: "100%", marginBottom: 18 }}>
            {AVATARS.map((a) => (
              <button key={a} className="pressable" aria-label={`Select avatar ${a}`} onClick={() => { setAvatar(a); Sound.beep(700, 0.05); }}
                style={{ padding: 7, borderRadius: 12, cursor: "pointer", display: "flex", justifyContent: "center",
                  border: `${T.bw} solid ${INK}`, background: avatar === a ? T.yellow : T.card,
                  boxShadow: avatar === a ? T.shadowMd : T.shadowSm, transition: "background 150ms" }}>
                <Avatar id={a} size={54} />
              </button>
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.sub, alignSelf: "flex-start", letterSpacing: 0.3, marginBottom: 8 }}>USERNAME</div>
          <input value={name} onChange={(e) => { setName(e.target.value.slice(0, 16)); if (nameErr) setNameErr(null); }} autoComplete="off"
            placeholder="pick a nickname"
            style={{ width: "100%", padding: "15px 18px", borderRadius: 12,
              border: `${T.bw} solid ${nameErr ? T.red : INK}`,
              background: T.card, color: INK, fontSize: 17, fontWeight: 700, fontFamily: T.mono, outline: "none",
              marginBottom: 7, boxSizing: "border-box", boxShadow: T.shadowSm }} />
          <div style={{ width: "100%", alignSelf: "flex-start", color: T.sub, fontSize: 11.5, fontWeight: 600,
            lineHeight: 1.4, marginBottom: nameErr ? 10 : 22 }}>
            This is public — don't use your real name.
          </div>
          {nameErr && (
            <div style={{ width: "100%", ...sticker(T.red, T.shadowSm), borderRadius: 10, padding: "9px 13px",
              marginBottom: 18, color: "#fff", fontSize: 12.5, fontWeight: 800, lineHeight: 1.35 }}>
              {nameErr}
            </div>
          )}
          <BigButton onClick={submitName}>{claiming ? "Checking…" : "Continue"}</BigButton>
          <div style={{ color: T.sub2, fontSize: 12, marginTop: 12 }}>No signup · play in 30 seconds</div>
          <div style={{ color: T.sub, fontSize: 11.5, textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
            By continuing you confirm you're 15 or older (or have a parent or guardian's consent) and agree to our{" "}
            <a href="/terms.html" target="_blank" rel="noopener noreferrer"
              style={{ color: T.blue, fontWeight: 800, textDecoration: "underline" }}>Terms</a>{" "}and{" "}
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer"
              style={{ color: T.blue, fontWeight: 800, textDecoration: "underline" }}>Privacy Policy</a>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <div style={{ fontSize: 26, fontWeight: 900, fontFamily: T.display, color: INK, textTransform: "uppercase", margin: "8px 0 4px" }}>How it works</div>
          <div style={{ color: T.sub, fontSize: 14, textAlign: "center", marginBottom: 14, maxWidth: 300 }}>Quick daily games, everyone on the same challenges — race for the top.</div>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {GUIDE.map((g, i) => (
              <div key={g.title} className="enter" style={{ display: "flex", alignItems: "center", gap: 14,
                ...sticker(T.card, T.shadowSm), borderRadius: 14, padding: "14px 16px",
                animationDelay: `${i * 90}ms` }}>
                <div style={{ width: 44, height: 44, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, background: g.color, border: `${T.bw} solid ${INK}` }}>
                  <Icon name={g.icon} size={22} color={inkOn(g.color)} strokeWidth={2.2} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{g.title}</div>
                  <div style={{ color: T.sub, fontSize: 12.5 }}>{g.sub}</div>
                </div>
              </div>
            ))}
          </div>
          <BigButton onClick={next}>Continue</BigButton>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ fontSize: 26, fontWeight: 900, fontFamily: T.display, color: INK, textTransform: "uppercase", margin: "8px 0 4px" }}>The games</div>
          <div style={{ color: T.sub, fontSize: 14, textAlign: "center", marginBottom: 14, maxWidth: 300 }}>
            {GAMES.length} quick challenges — a fresh set every midnight.
          </div>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {GAMES.map((g, i) => (
              <div key={g.id} className="enter" style={{ display: "flex", alignItems: "center", gap: 12,
                ...sticker(T.card, T.shadowSm), borderRadius: 12, padding: "10px 14px",
                animationDelay: `${i * 60}ms` }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, background: g.bg, border: `${T.bw} solid ${INK}` }}>
                  <Icon name={g.icon} size={20} color={INK} strokeWidth={2.2} />
                </div>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>{g.name}</div>
                  <div style={{ color: T.sub, fontSize: 12 }}>{g.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ width: "100%", ...sticker(T.yellow, T.shadowSm), borderRadius: 12, padding: "12px 15px", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 800, marginBottom: 3, color: INK }}>
              <Icon name="trophy" size={15} color={INK} strokeWidth={2.4} /> Season Points
            </div>
            <div style={{ color: "#5C5320", fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>
              Every game scores up to 1,000. They add up to one number — your Season Points — that drives ranking, duels & rewards. Resets monthly.
            </div>
          </div>
          <BigButton color={T.green} onClick={() => onDone(name.trim() || "player", avatar)}>Start playing</BigButton>
        </>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 18 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: i === step ? 22 : 7, height: 7, borderRadius: 4,
            background: i === step ? INK : T.card2, border: `2px solid ${INK}`, transition: "all 250ms" }} />
        ))}
      </div>
    </div>
  );
}

// ================= Shop =================
function ShopScreen({ coins, owned, onBuy, onBuyCoins, onEquip, equippedAvatar, equippedFrame }) {
  const [shopTab, setShopTab] = useState("avatars");
  // The featured drop is the priciest animated avatar — the one worth vaulting.
  const featured = SHOP_ITEMS.find((it) => it.id === "av_volcano") || SHOP_ITEMS[SHOP_ITEMS.length - 1];
  const avatars = SHOP_ITEMS.filter((it) => it.type === "avatar");
  const frames = SHOP_ITEMS.filter((it) => it.type === "frame");

  const seg = (id, label) => (
    <button key={id} onClick={() => setShopTab(id)}
      style={{ flex: 1, border: "none", cursor: "pointer", padding: 9, borderRadius: 8, fontFamily: T.display,
        fontWeight: 800, fontSize: 12.5, textTransform: "uppercase",
        background: shopTab === id ? INK : "transparent", color: shopTab === id ? T.yellow : T.sub2 }}>
      {label}
    </button>
  );

  const priceTag = (cost, light) => (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
      <span style={{ width: 12, height: 12, borderRadius: "50%", background: T.yellow,
        border: `2px solid ${light ? "#fff" : INK}`, display: "inline-block", flexShrink: 0 }} />
      {cost.toLocaleString()}
    </span>
  );

  return (
    <>
      {/* The section header already names the screen — this row just carries the balance. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ color: T.sub, fontSize: 12.5, fontWeight: 700 }}>Cosmetics only — style, never advantage</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, ...sticker(T.yellow, T.shadowSm),
          borderRadius: 10, padding: "6px 11px", flexShrink: 0 }}>
          <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", border: `2px solid ${INK}` }} />
          <span style={{ fontWeight: 700, fontFamily: T.mono, color: INK, fontSize: 14 }}>{coins.toLocaleString()}</span>
        </div>
      </div>

      {/* Featured drop — the one thing above the fold */}
      <div style={{ ...sticker(T.red, T.shadow), borderRadius: 16, padding: "16px 18px", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 15 }}>
        <div style={{ flexShrink: 0, animation: "bob 1.7s ease-in-out infinite" }}>
          <Avatar id={featured.glyph} size={62} />
        </div>
        <div style={{ flex: 1, color: "#fff", minWidth: 0 }}>
          <div style={{ display: "inline-block", fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            color: INK, background: T.yellow, border: `2px solid ${INK}`, padding: "2px 7px", borderRadius: 6 }}>
            ⏳ VAULTS TONIGHT
          </div>
          <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 18, marginTop: 8, textTransform: "uppercase",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{featured.name}</div>
          <div style={{ fontSize: 11.5, color: "#FFDDD4", fontWeight: 700 }}>Legendary · animated</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", ...sticker(T.card, T.shadowMd), borderRadius: 12, padding: 4, marginBottom: 16 }}>
        {seg("avatars", "Avatars")}{seg("frames", "Frames")}{seg("coins", "Coins")}
      </div>

      {shopTab === "avatars" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 110 }}>
          {avatars.map((it) => {
            const isOwned = owned.includes(it.id);
            const isEquipped = equippedAvatar === it.id;
            const canAfford = coins >= it.cost;
            const animated = !!SPRITE_AVATARS[it.glyph];
            const btnBg = isEquipped ? T.green : isOwned ? T.card2 : canAfford ? T.blue : T.card2;
            return (
              <div key={it.id} style={{ ...sticker(), borderRadius: 14, padding: 14, position: "relative",
                display: "flex", flexDirection: "column", alignItems: "center", animation: "pop 300ms ease both" }}>
                {animated && (
                  <div style={{ position: "absolute", top: 11, right: 11, background: T.green, border: `2px solid ${INK}`,
                    color: INK, fontSize: 9, fontWeight: 800, padding: "2px 5px", borderRadius: 5 }}>ANIM</div>
                )}
                <div style={{ margin: "4px 0 10px" }}><Avatar id={it.glyph} size={60} /></div>
                <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 14, color: T.text, textAlign: "center",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{it.name}</div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: INK,
                  background: RARITY_BG[it.rarity], border: `2px solid ${INK}`, padding: "1px 6px", borderRadius: 5, marginTop: 5 }}>
                  {it.rarity}
                </div>
                <button className="pressable" disabled={!isOwned && !canAfford}
                  onClick={() => (isOwned ? onEquip(it.id) : canAfford && onBuy(it))}
                  style={{ marginTop: 11, width: "100%", border: `${T.bw} solid ${INK}`, borderRadius: 9, padding: 8,
                    fontFamily: T.mono, fontWeight: 700, fontSize: 13, background: btnBg, color: inkOn(btnBg),
                    cursor: isOwned || canAfford ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  {isEquipped ? "Equipped" : isOwned ? "Equip" : priceTag(it.cost, canAfford)}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {shopTab === "frames" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 110 }}>
          {frames.map((it) => {
            const isOwned = owned.includes(it.id);
            const isEquipped = equippedFrame === it.id;
            const canAfford = coins >= it.cost;
            const btnBg = isEquipped ? T.green : isOwned ? T.card2 : canAfford ? T.blue : T.card2;
            return (
              <div key={it.id} style={{ ...sticker(), borderRadius: 14, padding: 15,
                display: "flex", flexDirection: "column", alignItems: "center" }}>
                <FramedAvatar id="knight" size={54} frame={it.frame} />
                <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 14, color: T.text, marginTop: 10 }}>{it.name}</div>
                <button className="pressable" disabled={!isOwned && !canAfford}
                  onClick={() => (isOwned ? onEquip(it.id) : canAfford && onBuy(it))}
                  style={{ marginTop: 10, width: "100%", border: `${T.bw} solid ${INK}`, borderRadius: 9, padding: 8,
                    fontFamily: T.mono, fontWeight: 700, fontSize: 13, background: btnBg, color: inkOn(btnBg),
                    cursor: isOwned || canAfford ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  {isEquipped ? "Equipped" : isOwned ? "Equip" : priceTag(it.cost, canAfford)}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {shopTab === "coins" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 110 }}>
          {COIN_PACKS.map((pk) => {
            const best = pk.tag === "Best value";
            return (
              <div key={pk.id} style={{ display: "flex", alignItems: "center", gap: 14,
                ...sticker(T.card, best ? T.shadow : T.shadowSm), borderRadius: 14, padding: "14px 16px", position: "relative" }}>
                {pk.tag && (
                  <div style={{ position: "absolute", top: -11, left: 16, background: best ? T.green : T.yellow,
                    border: `${T.bw} solid ${INK}`, color: INK, fontSize: 9.5, fontWeight: 800, padding: "2px 7px",
                    borderRadius: 6, textTransform: "uppercase" }}>{pk.tag}</div>
                )}
                <div style={{ width: 50, height: 50, borderRadius: 12, border: `${T.bw} solid ${INK}`, background: T.yellow,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name="coin" size={26} color={INK} strokeWidth={2.2} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 16, color: T.text }}>{pk.coins.toLocaleString()} coins</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.sub }}>one-time purchase</div>
                </div>
                <button className="pressable" onClick={() => onBuyCoins(pk)}
                  style={{ border: `${T.bw} solid ${INK}`, cursor: "pointer", padding: "9px 16px", borderRadius: 10,
                    fontFamily: T.display, fontWeight: 800, fontSize: 14, background: T.blue, color: "#fff" }}>
                  {pk.price}
                </button>
              </div>
            );
          })}
          <div style={{ ...sticker(T.card2, "none"), borderRadius: 12, padding: "12px 14px", color: T.sub,
            fontSize: 12, fontWeight: 700, lineHeight: 1.5 }}>
            Champion frames are earned by finishing top 3 — they are never sold.
          </div>
        </div>
      )}
    </>
  );
}

// ================= Screens =================
function TodayScreen({ playedGames, openGame, openPractice, onPractice, streak, totalPts, countdown, rewardClaimed, claimReward, onShare, onDuel, onHelp, balance, challengesLeft, onWatchAd, canWatchAd, adSlotsLeft, username, avatar, coins, elo }) {
  const playedCount = Object.keys(playedGames).length;
  const total = GAMES.length;
  const allDone = playedCount >= total;
  const nextGame = GAMES.find((g) => !playedGames[g.id]) || GAMES[0];
  const tier = tierOf(elo);
  const gamesRef = useRef(null);

  return (
    <div style={{ paddingBottom: 130 }}>
      {/* Identity + coins */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        ...sticker(T.card, T.shadowMd), borderRadius: 14, padding: "10px 13px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Avatar id={avatar} size={38} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 15, color: T.text, lineHeight: 1,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{username}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.sub2, textTransform: "uppercase" }}>{tier.name}</div>
          </div>
        </div>
        <button onClick={onHelp} className="pressable"
          style={{ display: "flex", alignItems: "center", gap: 6, background: T.yellow, border: `${T.bw} solid ${INK}`,
            borderRadius: 10, padding: "6px 11px", cursor: "pointer", flexShrink: 0 }}>
          <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", border: `2px solid ${INK}` }} />
          <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 14, color: INK }}>{coins.toLocaleString()}</span>
        </button>
      </div>

      {/* Streak at risk — loudest thing on the screen until the run is done */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, ...sticker(allDone ? T.green : T.red, T.shadowMd),
        borderRadius: 14, padding: "11px 14px", marginBottom: 14 }}>
        <span style={{ fontSize: 24, display: "inline-block", animation: "flamef 1.5s ease-in-out infinite" }}>🔥</span>
        <div style={{ flex: 1, lineHeight: 1.2 }}>
          <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 16, color: allDone ? INK : "#fff" }}>
            {streak}-DAY STREAK
          </div>
          <div style={{ fontSize: 11.5, color: allDone ? "#083D28" : "#FFE1D8", fontWeight: 700 }}>
            {allDone ? "Banked for today — nice." : `Resets in ${countdown.split(" ").slice(1).join(" ")} — don't lose it`}
          </div>
        </div>
      </div>

      {/* Hero: today's run */}
      <div style={{ ...sticker(T.blue, T.shadow), borderRadius: 16, padding: 20, color: "#fff" }}>
        <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 12, letterSpacing: "0.14em", color: "#BFCBFF" }}>TODAY'S RUN</div>
        <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 26, lineHeight: 1, marginTop: 6, textTransform: "uppercase" }}>
          {allDone ? "Perfect day!" : playedCount ? `${total - playedCount} from a sweep` : "One shot each"}
        </div>
        <div style={{ fontSize: 13, color: "#D6DEFF", marginTop: 7, fontWeight: 600, lineHeight: 1.35 }}>
          {allDone ? "New run drops at midnight." : playedCount ? "Finish the run to bank the streak." : "Beat today's field before the timer."}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 15 }}>
          {GAMES.map((g) => (
            <div key={g.id} style={{ flex: 1, height: 14, borderRadius: 4, border: `${T.bw} solid ${INK}`,
              background: playedGames[g.id] ? T.yellow : T.card2 }} />
          ))}
        </div>
        {allDone ? (
          <div style={{ marginTop: 16, width: "100%", padding: 15, borderRadius: 12, background: "rgba(255,255,255,0.14)",
            border: `${T.bw} solid ${INK}`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            gap: 8, fontFamily: T.display, fontWeight: 800, fontSize: 14, textTransform: "uppercase" }}>
            🌙 Back at midnight
          </div>
        ) : (
          <button className="pressable" onClick={() => openGame(nextGame.id)}
            style={{ marginTop: 16, width: "100%", border: `${T.bw} solid ${INK}`, cursor: "pointer", padding: 15,
              borderRadius: 12, background: T.yellow, color: INK, boxShadow: T.shadowMd,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
            <Icon name="playAd" size={19} color={INK} strokeWidth={2.4} />
            <span style={{ fontFamily: T.display, fontWeight: 900, fontSize: 16, textTransform: "uppercase" }}>
              {playedCount ? `Continue · ${total - playedCount} left` : "Start run"}
            </span>
          </button>
        )}
      </div>

      {/* Social proof */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 14,
        ...sticker(T.green, T.shadowMd), borderRadius: 14, padding: "11px 14px" }}>
        <div style={{ display: "flex" }}>
          {ACTIVITY.map((a, i) => (
            <div key={i} style={{ marginLeft: i ? -10 : 0 }}><Avatar id={a.avatar} size={26} /></div>
          ))}
        </div>
        <div style={{ flex: 1, fontSize: 12.5, color: "#083D28", fontWeight: 800, lineHeight: 1.25 }}>
          nikos.dev, SpirosGG & katerina__ already played. Catch up!
        </div>
      </div>

      {/* Secondary actions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 14 }}>
        <button className="pressable" onClick={rewardClaimed ? undefined : claimReward}
          style={{ cursor: rewardClaimed ? "default" : "pointer", ...sticker(T.card, T.shadowSm), borderRadius: 12,
            padding: "12px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 19 }}>{rewardClaimed ? "✅" : "🎁"}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: T.text }}>{rewardClaimed ? "Claimed" : "Daily +50"}</span>
        </button>
        <button className="pressable" onClick={onPractice}
          style={{ cursor: "pointer", ...sticker(T.card, T.shadowSm), borderRadius: 12,
            padding: "12px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 19 }}>🎯</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: T.text }}>Practice</span>
        </button>
        <button className="pressable" onClick={onDuel}
          style={{ cursor: "pointer", ...sticker(INK, T.shadowSm), borderRadius: 12,
            padding: "12px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 19 }}>⚔️</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: T.yellow }}>Duel · {challengesLeft}</span>
        </button>
      </div>

      {/* The games */}
      <div ref={gamesRef} style={{ fontFamily: T.display, fontWeight: 800, fontSize: 17, color: T.text,
        textTransform: "uppercase", margin: "22px 2px 12px", scrollMarginTop: 12 }}>Or pick a game</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {GAMES.map((g, gi) => {
          const res = playedGames[g.id];
          return (
            <button key={g.id} className="pressable" onClick={() => openGame(g.id)}
              style={{ textAlign: "left", cursor: "pointer", ...sticker(T.card, T.shadowMd), borderRadius: 14, padding: 13,
                position: "relative", minHeight: 120, display: "flex", flexDirection: "column",
                animation: "pop 300ms ease both", animationDelay: `${gi * 45}ms` }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, border: `${T.bw} solid ${INK}`, display: "flex",
                alignItems: "center", justifyContent: "center", background: g.bg }}>
                <Icon name={g.icon} size={22} color={INK} strokeWidth={2.2} />
              </div>
              {res && (
                <div style={{ position: "absolute", top: 12, right: 12, width: 24, height: 24, borderRadius: 6,
                  border: `${T.bw} solid ${INK}`, background: T.green, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="check" size={12} color={INK} strokeWidth={3.5} />
                </div>
              )}
              <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 14.5, color: T.text, marginTop: 11 }}>{g.name}</div>
              <div style={{ fontSize: 11, color: T.sub2, fontWeight: 600, marginTop: 2, flex: 1 }}>{g.desc}</div>
              {res ? (
                <div style={{ marginTop: 9, display: "inline-flex", alignItems: "center", gap: 5, background: T.yellow,
                  border: `2px solid ${INK}`, padding: "4px 8px", borderRadius: 7, width: "fit-content" }}>
                  <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 13, color: INK }}>{res.pts}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: INK }}>PTS</span>
                </div>
              ) : (
                <div style={{ marginTop: 9, display: "inline-flex", alignItems: "center", gap: 4, color: T.blue }}>
                  <span style={{ fontWeight: 800, fontSize: 12 }}>PLAY</span>
                  <Icon name="chevron" size={14} color={T.blue} strokeWidth={3} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Extra tries / share */}
      <div style={{ display: "grid", gridTemplateColumns: canWatchAd && playedCount > 0 ? "1fr 1fr" : "1fr", gap: 10, marginTop: 14 }}>
        {canWatchAd && (
          <button className="pressable" onClick={onWatchAd}
            style={{ ...sticker(T.card, T.shadowSm), borderRadius: 12, padding: "12px 10px", cursor: "pointer",
              color: T.text, fontWeight: 800, fontSize: 12.5, fontFamily: T.font,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <Icon name="playAd" size={16} color={T.green} strokeWidth={2.4} /> +1 try ({adSlotsLeft})
          </button>
        )}
        {playedCount > 0 && (
          <button className="pressable" onClick={onShare}
            style={{ ...sticker(T.card, T.shadowSm), borderRadius: 12, padding: "12px 10px", cursor: "pointer",
              color: T.text, fontWeight: 800, fontSize: 12.5, fontFamily: T.font,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <Icon name="share" size={16} color={T.blue} strokeWidth={2.4} /> Share score
          </button>
        )}
      </div>

      {/* Live activity */}
      <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 17, color: T.text,
        textTransform: "uppercase", margin: "22px 2px 12px" }}>Live activity</div>
      <div style={{ ...sticker(T.card, T.shadowMd), borderRadius: 14, overflow: "hidden" }}>
        {ACTIVITY.map((a, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px",
            borderBottom: i < ACTIVITY.length - 1 ? `2px solid ${INK}` : "none" }}>
            <div style={{ flexShrink: 0 }}><Avatar id={a.avatar} size={34} /></div>
            <div style={{ flex: 1, lineHeight: 1.3, fontSize: 12.5, color: T.sub, fontWeight: 600 }}>{a.text}</div>
            <div style={{ fontSize: 10, color: T.sub2, fontWeight: 800, flexShrink: 0 }}>{a.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SeasonScreen({ seasonPts, username, avatar, countdown, seasonName, onRewards, board = BOTS }) {
  // `board` is the real leaderboard when Supabase is configured, otherwise BOTS.
  // Filter out my own server row so I'm not listed twice next to my live "me" row.
  const others = board.filter((b) => b.name !== username);
  const rows = [...others.map((b) => ({ name: b.name, avatar: b.avatar, pts: b.pts })), { name: username, avatar, pts: seasonPts, me: true }].sort((a, b) => b.pts - a.pts);
  const myRank = rows.findIndex((r) => r.me) + 1;
  const toTop = myRank > 3 ? rows[2].pts - seasonPts : 0;
  return (
    <div style={{ paddingBottom: 130 }}>
      {/* Season hero */}
      <div style={{ ...sticker(T.purple, T.shadow), borderRadius: 16, padding: 18, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 11, letterSpacing: "0.12em", color: "#E4D9FF",
            textTransform: "uppercase" }}>{seasonName} Season</div>
          <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 22, marginTop: 4, textTransform: "uppercase" }}>
            ENDS {countdown}
          </div>
        </div>
        <span style={{ fontSize: 32, flexShrink: 0 }}>🏆</span>
      </div>

      {/* Your standing */}
      <div style={{ marginTop: 12, ...sticker(T.card, T.shadowMd), borderRadius: 14, padding: "14px 16px",
        display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 24, color: myRank <= 3 ? T.red : T.blue }}>#{myRank}</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: T.sub2 }}>YOUR RANK</div>
        </div>
        <div style={{ width: 2.5, height: 34, background: INK, flexShrink: 0 }} />
        <div style={{ flex: 1, fontSize: 13, color: T.text, fontWeight: 700, lineHeight: 1.3 }}>
          {toTop > 0 ? (
            <><span style={{ background: T.yellow, padding: "1px 4px", border: `2px solid ${INK}` }}>{toTop.toLocaleString()} pts</span> from the podium</>
          ) : (
            <>You're in the reward zone — <span style={{ background: T.green, padding: "1px 4px", border: `2px solid ${INK}` }}>hold it</span></>
          )}
        </div>
      </div>

      {/* Top rewards */}
      <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 17, color: T.text,
        textTransform: "uppercase", margin: "22px 2px 12px" }}>Top rewards</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SEASON_REWARDS.map((rw, i) => (
          <button key={rw.place} className="pressable" onClick={onRewards}
            style={{ display: "flex", alignItems: "center", gap: 13, textAlign: "left", cursor: "pointer",
              ...sticker(T.card, T.shadowSm), borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, border: `${T.bw} solid ${INK}`, display: "flex",
              alignItems: "center", justifyContent: "center", fontFamily: T.display, fontWeight: 900, fontSize: 13,
              color: INK, background: [T.yellow, "#D6B8FF", "#9CC3FF"][i], flexShrink: 0 }}>{rw.place}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: T.text }}>{rw.perks[0]}</div>
              <div style={{ fontSize: 11.5, color: T.sub2, fontWeight: 600 }}>{rw.label} · {rw.badge}</div>
            </div>
            <div style={{ fontSize: 22, flexShrink: 0 }}>{["🥇", "🥈", "🥉"][i]}</div>
          </button>
        ))}
      </div>

      {/* Standings */}
      <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 17, color: T.text,
        textTransform: "uppercase", margin: "22px 2px 12px" }}>Standings</div>
      <div style={{ ...sticker(T.card, T.shadowMd), borderRadius: 14, overflow: "hidden" }}>
        {rows.map((r, i) => {
          const rw = i < 3 ? SEASON_REWARDS[i] : null;
          return (
            <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
              borderBottom: i < rows.length - 1 ? `2px solid ${INK}` : "none",
              background: r.me ? "#FFF6D6" : "#fff" }}>
              <div style={{ width: 26, textAlign: "center", fontFamily: T.display, fontWeight: 900, fontSize: 14,
                color: rw ? T.red : r.me ? T.blue : T.sub2 }}>{i + 1}</div>
              <div style={{ flexShrink: 0 }}>
                {rw ? <FramedAvatar id={r.avatar} size={30} frame={rw.frame} /> : <Avatar id={r.avatar} size={30} />}
              </div>
              <div style={{ flex: 1, fontWeight: 800, fontSize: 13.5, color: T.text, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}{r.me && " · you"}</div>
              <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 13.5, color: T.blue, flexShrink: 0 }}>
                {r.pts.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeaderboardScreen({ userEntry, onChallenge, onHelp, board = BOTS, onRefresh, refreshing, duelable = null, hasBackend = false }) {
  const [filter, setFilter] = useState("global");
  // `board` is real leaderboard rows { name, avatar, pts } when Supabase is on,
  // else the BOTS demo set. Drop my own server row so my live "me" row is unique.
  const others = board.filter((b) => !userEntry || b.name !== userEntry.name);
  let rows = [...others.map((b) => ({ name: b.name, avatar: b.avatar, pts: b.pts, me: false })), ...(userEntry ? [{ ...userEntry, me: true }] : [])];
  // No friends system in Phase 1 — real rows carry no `friend` flag, so this view
  // shows just you. (ui-ux owns the empty-state copy.)
  if (filter === "friends") rows = rows.filter((r) => r.friend || r.me);
  rows.sort((a, b) => b.pts - a.pts);
  // Phase 1 has no friend system, so the filtered set never carries a `friend`
  // row — the tab would otherwise show just you and a lonely rival card. Show a
  // warm empty state instead of a bare screen.
  const noFriends = filter === "friends" && !rows.some((r) => r.friend);

  const myIdx = rows.findIndex((r) => r.me);
  const rival = myIdx > 0 ? rows[myIdx - 1] : null;
  const gap = rival ? rival.pts - rows[myIdx].pts : 0;

  return (
    <div style={{ paddingBottom: 130 }}>
      {/* Pull latest rankings from the backend on demand. */}
      {onRefresh && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button onClick={onRefresh} disabled={refreshing}
            style={{ ...sticker(T.card, T.shadowSm), borderRadius: 10, padding: "7px 12px",
              cursor: refreshing ? "default" : "pointer", display: "flex", alignItems: "center", gap: 7,
              fontFamily: T.display, fontWeight: 800, fontSize: 12, textTransform: "uppercase", color: T.text }}>
            <span style={{ display: "inline-flex", animation: refreshing ? "spinSlow 0.7s linear infinite" : "none" }}>
              <Icon name="refresh" size={15} color={INK} strokeWidth={2.2} />
            </span>
            {refreshing ? "Updating" : "Refresh"}
          </button>
        </div>
      )}
      {/* Scope switch */}
      <div style={{ display: "flex", ...sticker(T.card, T.shadowMd), borderRadius: 12, padding: 4, marginBottom: 16 }}>
        {[["global", "Global"], ["friends", "Friends"]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            style={{ flex: 1, border: "none", cursor: "pointer", padding: 10, borderRadius: 8, fontFamily: T.display,
              fontWeight: 800, fontSize: 13.5, textTransform: "uppercase",
              background: filter === id ? INK : "transparent", color: filter === id ? T.yellow : T.sub2 }}>
            {label}
          </button>
        ))}
      </div>

      {noFriends ? (
        /* Empty Friends tab — no friend system yet, so celebrate the solo climb
           rather than showing a blank list. No invite button exists yet, so the
           copy only teases it (an affordance that does nothing would be worse). */
        <div style={{ ...sticker(T.card, T.shadow), borderRadius: 16, padding: "34px 24px",
          textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 13 }}>
          <div style={{ ...sticker(T.yellow, T.shadowSm), width: 62, height: 62, borderRadius: 16,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>👑</div>
          <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 21, color: T.text,
            textTransform: "uppercase", letterSpacing: "-0.01em", lineHeight: 1.05 }}>
            A leaderboard of one
          </div>
          <div style={{ fontSize: 13, color: T.sub, fontWeight: 600, lineHeight: 1.45, maxWidth: 262 }}>
            No friends here yet — so you're technically undefeated. Invites drop soon; enjoy the empty throne.
          </div>
        </div>
      ) : (
        <>
      {/* Rival gap */}
      <div style={{ ...sticker(T.yellow, T.shadowSm), borderRadius: 12, padding: "12px 14px", marginBottom: 14,
        display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>🎯</span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: INK, fontWeight: 700, lineHeight: 1.25 }}>
          {rival
            ? `${gap.toLocaleString()} pts behind ${rival.name} at #${myIdx}. Close it today.`
            : myIdx === 0
            ? "You're #1. Everyone below is coming for you."
            : "Play a duel to enter the ranking."}
        </div>
        {onHelp && <DuelHelpLink onOpen={onHelp} />}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r, i) => (
          <div key={r.name} className="enter" style={{ display: "flex", alignItems: "center", gap: 9,
            animationDelay: `${Math.min(i, 8) * 35}ms`,
            ...sticker(r.me ? T.yellow : T.card, r.me ? T.shadow : T.shadowSm), borderRadius: 12, padding: "10px 11px" }}>
            <div style={{ width: 20, flexShrink: 0, textAlign: "center", fontFamily: T.display, fontWeight: 900, fontSize: 15,
              color: r.me ? INK : i < 3 ? T.red : T.sub2 }}>{i + 1}</div>
            <div style={{ flexShrink: 0 }}><Avatar id={r.avatar || "knight"} size={34} /></div>
            {/* flex:1 + minWidth:0 so the name is the only thing that gives way when space runs out */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: T.text, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
              <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 12.5, color: r.me ? INK : T.blue }}>
                {r.pts.toLocaleString()}
              </div>
            </div>
            {!r.me && (() => {
              // Server path: only players in the duelable set are selectable. Others
              // are greyed with a short reason (the RPC only returns eligible players,
              // so we can't distinguish shield vs cooldown vs no-score here — the
              // honest generic reason covers all three). Offline path stays enabled.
              const eligible = !hasBackend || (duelable && duelable[r.name] && Object.keys(duelable[r.name].games).length);
              return (
                <button className="pressable" onClick={() => onChallenge(r)}
                  title={eligible ? "Challenge to a duel" : "Not duelable today — hasn't played, shielded, or on cooldown"}
                  style={{ border: `2px solid ${eligible ? INK : T.sub2}`, background: eligible ? T.red : T.card2,
                    color: eligible ? "#fff" : T.sub2, borderRadius: 8, padding: "5px 9px", fontSize: 10.5, fontWeight: 800,
                    fontFamily: T.font, cursor: "pointer", flexShrink: 0, opacity: eligible ? 1 : 0.7 }}>
                  DUEL
                </button>
              );
            })()}
          </div>
        ))}
      </div>
        </>
      )}
    </div>
  );
}

function ProfileScreen({ elo, streak, playedGames, totalPts, duelRecord, openSettings, avatar, username, seasonPts, onEditAvatar, equippedFrame }) {
  const tier = tierOf(elo);
  const next = TIERS[TIERS.indexOf(TIERS.find((t) => t.name === tier.name)) + 1];
  const played = Object.keys(playedGames).length;
  const badgeTarget = 30;
  const badgeProg = Math.min(1, streak / badgeTarget);
  const achievements = [
    { emoji: "⚡", name: "First Duel", desc: "Play your first duel", done: played >= 1 },
    { emoji: "🎯", name: "Full House", desc: "Play all games in one day", done: played >= GAMES.length },
    { emoji: "⚔️", name: "Duelist", desc: "Win a 1v1 duel", done: duelRecord.w >= 1 },
    { emoji: "🔥", name: "Fire Week", desc: "7 day streak", done: streak >= 7 },
    { emoji: "💎", name: "Diamond Mind", desc: "Reach 1700 ELO", done: elo >= 1700 },
  ];
  const stats = [
    { emoji: "🔥", label: "Day streak", value: String(streak) },
    { emoji: "🎮", label: "Games today", value: `${played}/${GAMES.length}` },
    { emoji: "⭐", label: "Season points", value: seasonPts.toLocaleString() },
    { emoji: "⚔️", label: "Duel record", value: `${duelRecord.w}-${duelRecord.l}` },
  ];
  return (
    <div style={{ paddingBottom: 130 }}>
      {/* Identity */}
      <div style={{ ...sticker(T.card, T.shadow), borderRadius: 16, padding: 20,
        display: "flex", flexDirection: "column", alignItems: "center" }}>
        <button onClick={onEditAvatar} className="pressable" aria-label="Edit avatar"
          style={{ width: 96, height: 96, borderRadius: "50%", padding: 5, border: `${T.bw} solid ${INK}`,
            background: T.yellow, display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", cursor: "pointer", boxShadow: "none" }}>
          {equippedFrame ? <FramedAvatar id={avatar} size={72} frame={equippedFrame} /> : <Avatar id={avatar} size={78} />}
          <span style={{ position: "absolute", bottom: -2, right: -2, width: 30, height: 30, borderRadius: 8,
            background: INK, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="sliders" size={14} color={T.yellow} strokeWidth={2.4} />
          </span>
        </button>
        <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 22, color: T.text, marginTop: 12,
          textTransform: "uppercase" }}>{username}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6 }}>
          <span style={{ background: T.purple, border: `${T.bw} solid ${INK}`, color: "#fff", fontSize: 11,
            fontWeight: 800, letterSpacing: "0.04em", padding: "3px 9px", borderRadius: 7, textTransform: "uppercase" }}>
            {tier.name}
          </span>
          <span style={{ fontSize: 12.5, color: T.sub2, fontWeight: 700 }}>{elo} ELO</span>
        </div>
        {next && (
          <div style={{ fontSize: 12, color: T.sub, fontWeight: 700, marginTop: 6 }}>
            {next.min - elo} ELO to {next.name}
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ ...sticker(T.card, T.shadowSm), borderRadius: 12, padding: 15 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 17 }}>{s.emoji}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: T.sub2, textTransform: "uppercase" }}>{s.label}</span>
            </div>
            <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 26, color: T.text, marginTop: 6 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Next badge */}
      <div style={{ marginTop: 14, ...sticker(T.card, T.shadowSm), borderRadius: 12, padding: "15px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.text }}>Next badge · 30-day streak</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: T.sub2 }}>{streak}/{badgeTarget}</span>
        </div>
        <div style={{ height: 12, borderRadius: 5, border: `${T.bw} solid ${INK}`, background: T.bg,
          marginTop: 9, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${badgeProg * 100}%`, background: T.red,
            transition: "width 700ms cubic-bezier(.22,1,.36,1)" }} />
        </div>
      </div>

      {/* Achievements */}
      <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 17, color: T.text,
        textTransform: "uppercase", margin: "22px 2px 12px" }}>Achievements</div>
      <div style={{ ...sticker(T.card, T.shadowMd), borderRadius: 14, overflow: "hidden" }}>
        {achievements.map((a, i) => (
          <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
            borderBottom: i < achievements.length - 1 ? `2px solid ${INK}` : "none", opacity: a.done ? 1 : 0.45 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, border: `${T.bw} solid ${INK}`, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
              background: a.done ? T.yellow : T.card2 }}>{a.emoji}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{a.name}</div>
              <div style={{ color: T.sub2, fontSize: 11.5, fontWeight: 600 }}>{a.desc}</div>
            </div>
            {a.done ? (
              <span style={{ width: 24, height: 24, borderRadius: 6, border: `${T.bw} solid ${INK}`, background: T.green,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name="check" size={12} color={INK} strokeWidth={3.5} />
              </span>
            ) : (
              <Icon name="lock" size={15} color={T.sub2} />
            )}
          </div>
        ))}
      </div>

      {/* Settings */}
      <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 17, color: T.text,
        textTransform: "uppercase", margin: "22px 2px 12px" }}>Settings</div>
      <button className="pressable" onClick={openSettings}
        style={{ width: "100%", textAlign: "left", cursor: "pointer", ...sticker(T.card, T.shadowMd), borderRadius: 14,
          display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
        <span style={{ fontSize: 16, width: 22 }}>⚙️</span>
        <span style={{ flex: 1, fontWeight: 800, fontSize: 14, color: T.text }}>Account & preferences</span>
        <Icon name="chevron" size={17} color={T.sub2} strokeWidth={3} />
      </button>

      {/* Legal */}
      <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 22 }}>
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer"
          style={{ color: T.blue, fontWeight: 800, fontSize: 12.5, textDecoration: "underline" }}>Privacy Policy</a>
        <a href="/terms.html" target="_blank" rel="noopener noreferrer"
          style={{ color: T.blue, fontWeight: 800, fontSize: 12.5, textDecoration: "underline" }}>Terms of Service</a>
      </div>
    </div>
  );
}

// "Someone beat you in a duel" news. Reuses the activity-feed sticker look. Shown
// when there are unread duel_lost notifications; marks them read on mount (so the
// unread badge clears) and offers an optional "Duel back" when the attacker is
// currently duelable. Points are NOT changed here — the server already moved them.
function DuelNewsBanner({ notifs, duelable, onDuelBack, onDismiss, onMarkRead }) {
  useEffect(() => {
    if (notifs.length) onMarkRead(notifs.map((n) => n.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!notifs.length) return null;
  return (
    <div style={{ ...sticker(T.card, T.shadowMd), borderRadius: 14, padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: T.display, fontWeight: 900, fontSize: 15,
          textTransform: "uppercase", color: T.text }}>
          <Icon name="swords" size={16} color={T.red} /> Duel news
        </div>
        <button onClick={onDismiss} className="pressable"
          style={{ border: "none", background: "transparent", cursor: "pointer", color: T.sub, display: "flex" }}>
          <Icon name="x" size={16} color={T.sub} strokeWidth={2.6} />
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {notifs.map((n) => {
          const p = n.payload || {};
          const defended = n.type === "duel_defended";
          // "Duel back" only makes sense after a LOSS; a successful defence needs no
          // rematch. Offer it only when it's a loss and the attacker is duelable now.
          const back = !defended && duelable && duelable[p.attacker_name];
          const game = GAMES.find((g) => g.id === p.game);
          return (
            <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar id={p.attacker_avatar || "knight"} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>
                  {defended ? (
                    <>
                      <b>{p.attacker_name || "Someone"}</b> challenged you{game ? ` at ${game.name}` : ""} and lost — you defended,{" "}
                      <b style={{ color: T.green }}>+{p.points} pts</b>
                    </>
                  ) : (
                    <>
                      <b>{p.attacker_name || "Someone"}</b> beat you{game ? ` at ${game.name}` : ""} — took {p.points} pts{p.partial ? " (partial)" : ""}
                    </>
                  )}
                </div>
              </div>
              {defended ? (
                <span style={{ fontSize: 10.5, fontWeight: 800, color: T.green, flexShrink: 0 }}>DEFENDED</span>
              ) : back ? (
                <button onClick={() => onDuelBack(back)} className="pressable"
                  style={{ border: `2px solid ${INK}`, background: T.red, color: "#fff", borderRadius: 8, padding: "5px 9px",
                    fontSize: 10.5, fontWeight: 800, fontFamily: T.font, cursor: "pointer", flexShrink: 0 }}>
                  DUEL BACK
                </button>
              ) : (
                <span style={{ fontSize: 10.5, fontWeight: 800, color: T.sub2, flexShrink: 0 }}>—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================= App =================
export default function App() {
  const [onboarded, setOnboarded] = useState(false);
  const [username, setUsername] = useState("nak3d_alex");
  const [avatar, setAvatar] = useState("knight");
  const [soundOn, setSoundOn] = useState(true);

  // ---- Backend (Supabase) --------------------------------------------------
  // When keys are present we boot: verify any saved session, then load the
  // profile (nickname) and the real leaderboard. While that runs we hold a
  // loading gate so the UI never flashes the "nak3d_alex" defaults. With no keys
  // `booting` is false immediately and the app runs on the in-memory BOTS path.
  const [booting, setBooting] = useState(hasSupabase);
  const [authRequired, setAuthRequired] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  // `hydrated` gates the debounced saves. It stays false until boot has finished
  // restoring today's run from the backend, so the save effects can NOT fire with
  // the empty startup state (playedGames={}, challengeDelta=0) and clobber the
  // real saved score with a lower value. Flips true once restore completes (or
  // immediately when there is no backend to restore from).
  const [hydrated, setHydrated] = useState(!hasSupabase);
  const [periodHydrating, setPeriodHydrating] = useState(false);
  // `board` feeds every leaderboard/season/rank read. Defaults to the BOTS demo
  // set (mapped to the { name, avatar, pts } shape) and is replaced with real
  // rows when the fetch succeeds — so nothing breaks if the backend is absent.
  const [board, setBoard] = useState(() => BOTS.map((b) => ({ name: b.name, avatar: b.avatar, pts: b.pts })));
  const [refreshingBoard, setRefreshingBoard] = useState(false);

  const [tab, setTab] = useState("today");
  const [menuOpen, setMenuOpen] = useState(false); // orb nav sheet
  const [activeGame, setActiveGame] = useState(null);
  const [practiceMode, setPracticeMode] = useState(false);
  const [gameLive, setGameLive] = useState(false); // true once a scored daily game is in progress → no bailing
  const [playedGames, setPlayedGames] = useState({});
  const [elo, setElo] = useState(1385);
  const [streak, setStreak] = useState(0);
  const [toast, setToast] = useState(null);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [rewardClaiming, setRewardClaiming] = useState(false);
  const [reveal, setReveal] = useState(null); // post-run / claim panel payload
  const [bonusPts, setBonusPts] = useState(0);
  const [serverSeasonPts, setServerSeasonPts] = useState(null);
  const [duelXP, setDuelXP] = useState(0);
  const [duelRecord, setDuelRecord] = useState({ w: 0, l: 0 });
  const [duelOpp, setDuelOpp] = useState(null); // opponent object while dueling
  const [duelStake, setDuelStake] = useState(0);
  const [duelGame, setDuelGame] = useState("draw");
  const [pickGame, setPickGame] = useState(null); // chosen game in the stake sheet (null until picked)
  const [duelTarget, setDuelTarget] = useState(null); // resolved server duel target { defenderId, name, avatar, snapshotPts, snapshotLabel }
  const [activeAttempt, setActiveAttempt] = useState(null); // server-issued daily attempt { id, seed }
  const [duelAttempt, setDuelAttempt] = useState(null); // server-issued duel attempt { id, seed }
  // Cross-player duelability, keyed by nickname → { defenderId, name, avatar, pts,
  // games: { [gameId]: { snapshotPts, snapshotLabel } } }. Only players who scored a
  // game today AND pass the server's band/shield/grace/cooldown checks appear here;
  // everyone else is non-selectable in the UI. Empty on the offline (BOTS) path.
  const [duelableByName, setDuelableByName] = useState({});
  const [duelableLoading, setDuelableLoading] = useState(false);
  const [duelNotifs, setDuelNotifs] = useState([]); // unread "you got dueled" notifications to surface
  const [challengeDelta, setChallengeDelta] = useState(0); // net points won/lost via challenges (OUTGOING duels we started)
  // INCOMING duels: the NET Season-Points change from duels OTHER players started
  // against us while we were passive. Two directions, both server-authoritative and
  // both recorded ONLY as a notification the client must reconcile:
  //   'duel_lost'     → an attacker beat our score and took points (−).
  //   'duel_defended' → an attacker challenged and lost; we won their forfeited
  //                     stake (+).
  // The client learns of them no other way, so we mirror the net here (a signed
  // delta) and use it as an offline/session UI mirror; the backend balance remains
  // SAME transferred total and can never revert the server's move — which in the
  // loss direction would create points from nothing (inflation) and in the defence
  // direction would destroy the attacker's forfeited stake (deflation). Derived
  // AUTHORITATIVELY from today's notifications (see reconcileIncoming), so it is
  // idempotent and can never double-count. Persisted in the daily run blob to
  // bridge boot before the first reconcile returns.
  const [incomingDelta, setIncomingDelta] = useState(0);
  const [challengesUsed, setChallengesUsed] = useState(0);
  const [adDuels, setAdDuels] = useState(0); // extra challenges earned via ads
  const [adPromptFor, setAdPromptFor] = useState(null); // opponent awaiting ad watch
  const [adPlaying, setAdPlaying] = useState(false);
  const [coins, setCoins] = useState(0);
  const [owned, setOwned] = useState([]); // owned cosmetic ids
  const [equippedAvatar, setEquippedAvatar] = useState(null);
  const [equippedFrame, setEquippedFrame] = useState(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    const check = () => setFramed(window.innerWidth >= 520 && window.innerHeight >= 560);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const [stakeFor, setStakeFor] = useState(null); // opponent awaiting stake selection
  const [lastChallenge, setLastChallenge] = useState(0); // cooldown timestamp
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false); // delete-account confirm sub-state
  const [deleting, setDeleting] = useState(false); // delete RPC in flight
  const [deleteErr, setDeleteErr] = useState(null); // inline error on a failed delete
  const [accountBusy, setAccountBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // "How duels work" explainer. Openable on demand from the duel sheets, and
  // auto-shown once on a player's first duel. `duelHelpThen` carries what to do
  // after the auto-shown intro is dismissed (open the picker, or the stake sheet
  // for a specific opponent) so the intro guides them straight into the flow.
  const [duelHelpOpen, setDuelHelpOpen] = useState(false);
  const [duelHelpThen, setDuelHelpThen] = useState(null);
  // Whether this player has already seen the duel intro. One namespaced localStorage
  // key — no tracking, no backend column — so it shows once and never nags again.
  const [seenDuelIntro, setSeenDuelIntro] = useState(() => {
    try { return localStorage.getItem("sd_seen_duel_intro") === "1"; } catch { return false; }
  });
  const markDuelIntroSeen = () => {
    setSeenDuelIntro(true);
    try { localStorage.setItem("sd_seen_duel_intro", "1"); } catch {}
  };
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Countdown to end of the current month (season reset).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const seasonEnd = utcSeasonEnd(now);
  const diff = Math.max(0, seasonEnd.getTime() - now);
  const pad = pad2;
  const dLeft = Math.floor(diff / 86400000);
  const hLeft = Math.floor((diff % 86400000) / 3600000);
  const mLeft = Math.floor((diff % 3600000) / 60000);
  const countdown = `${dLeft}d ${pad(hLeft)}h ${pad(mLeft)}m`;
  const SEASON_NAME = utcSeasonName(now);

  // ONE unified score: Season Points. Everything feeds this. Ranking is derived from it.
  // Resets on the 1st of each month; top 3 earn cosmetic rewards.
  const SEASON_BASE = 0; // everyone starts the season from zero
  const gamePts = Object.values(playedGames).reduce((a, r) => a + r.pts, 0);
  const totalPts = gamePts + bonusPts;
  // + incomingDelta (≤0) so a re-save preserves points other players took from us.
  // Floored at 0: Season Points are never negative, and the server never lets a
  // defender drop below 0 (it clamps each transfer to the defender's balance), so
  // the floor can only guard a transient client under-shoot — it never re-creates
  // points the server actually refused to take.
  const localSeasonPts = Math.max(0, SEASON_BASE + totalPts + challengeDelta + incomingDelta);
  const seasonPts = hasSupabase && serverSeasonPts !== null ? serverSeasonPts : localSeasonPts;
  const balance = seasonPts; // same number everywhere

  // Season key the backend stores scores under, e.g. "2026-07". Matches the
  // monthly reset: a new month = a new key = a fresh scores row, old one kept.
  const seasonKey = utcSeasonKey(now);

  // Day key the backend stores the daily run under, e.g. "2026-07-24". This is
  // the SAME local-calendar "today" that daySeed() uses to pick the challenge, so
  // a real new day gives a fresh (empty) run while a same-day refresh restores the
  // locked run. Derived from `now` so it rolls over at local midnight.
  const dayKey = utcDayKey(now);
  // Local-calendar day key for an arbitrary timestamp (a notification's created_at).
  // Used to scope incoming-duel losses to TODAY: Season Points reset daily (they do
  // not accumulate across days), so only same-day losses feed today's total.
  const localDayKey = (ts) => utcDayKey(ts);

  // A tab can stay open across UTC midnight or a season boundary. Reset and
  // rehydrate the new period in-place so yesterday's games, gifts and duel budget
  // cannot leak into today until the player manually reloads.
  const activePeriod = useRef({ day: dayKey, season: seasonKey });
  useEffect(() => {
    const previous = activePeriod.current;
    if (!hydrated) {
      activePeriod.current = { day: dayKey, season: seasonKey };
      return;
    }
    if (previous.day === dayKey && previous.season === seasonKey) return;

    const dayChanged = previous.day !== dayKey;
    const seasonChanged = previous.season !== seasonKey;
    activePeriod.current = { day: dayKey, season: seasonKey };
    let alive = true;

    if (dayChanged) {
      setPlayedGames({});
      setBonusPts(0);
      setRewardClaimed(false);
      setChallengeDelta(0);
      setIncomingDelta(0);
      setChallengesUsed(0);
      setAdDuels(0);
      setLastChallenge(0);
      setDuelNotifs([]);
      setDuelableByName({});
      setActiveAttempt(null);
      setDuelAttempt(null);
    }
    if (seasonChanged) {
      setServerSeasonPts(null);
      setBoard([]);
    }

    if (!hasSupabase) return;
    setPeriodHydrating(true);
    (async () => {
      const [run, ownScore, rows, savedStreak] = await Promise.all([
        dayChanged ? getDailyRun(dayKey) : Promise.resolve(null),
        getMySeasonScore(seasonKey),
        fetchLeaderboard(seasonKey),
        getMyStreak(dayKey),
      ]);
      if (!alive) return;

      if (dayChanged && run && typeof run === "object") {
        if (run.played && typeof run.played === "object") setPlayedGames(run.played);
        if (typeof run.bonusPts === "number") setBonusPts(run.bonusPts);
        if (typeof run.rewardClaimed === "boolean") setRewardClaimed(run.rewardClaimed);
        if (typeof run.challengeDelta === "number") setChallengeDelta(run.challengeDelta);
        if (typeof run.incomingDelta === "number") setIncomingDelta(run.incomingDelta);
        if (typeof run.challengesUsed === "number") setChallengesUsed(Math.max(0, run.challengesUsed));
        if (typeof run.adDuels === "number") setAdDuels(Math.max(0, Math.min(5, run.adDuels)));
      }
      if (ownScore !== null) setServerSeasonPts(ownScore);
      if (rows !== null) setBoard(rows);
      if (savedStreak !== null) setStreak(savedStreak);
      setPeriodHydrating(false);
    })();

    return () => {
      alive = false;
    };
  }, [dayKey, seasonKey, hydrated]);

  // ---- Boot: verified session → profile → leaderboard (runs once) ----------
  useEffect(() => {
    if (!hasSupabase) return; // no keys → stay on the in-memory BOTS path
    let alive = true;
    (async () => {
      const session = await getExistingSession();
      if (!session) {
        if (alive) {
          setAuthRequired(true);
          setHydrated(true);
          setBooting(false);
        }
        return;
      }
      if (alive) {
        setAuthUser(session.user);
        setAuthRequired(false);
      }
      const profile = await getProfile();
      if (alive && profile?.nickname) {
        // Returning player: adopt their saved identity and skip onboarding.
        setUsername(profile.nickname);
        if (profile.avatar) setAvatar(profile.avatar);
        setOnboarded(true);

        // Restore TODAY'S run BEFORE `hydrated` flips true, so the debounced save
        // effects (which are gated on `hydrated`) can never fire with the empty
        // startup state and clobber the real saved score with a lower value. We
        // restore every component that feeds today's Season Points — the played
        // games, the +50 daily gift, and the net duel points — so the rebuilt
        // seasonPts equals exactly what it was before the refresh (see the
        // reconciliation note by the save effect below).
        const key = utcDayKey();
        const run = await getDailyRun(key);
        if (alive && run && typeof run === "object") {
          if (run.played && typeof run.played === "object") setPlayedGames(run.played);
          if (typeof run.bonusPts === "number") setBonusPts(run.bonusPts);
          if (typeof run.rewardClaimed === "boolean") setRewardClaimed(run.rewardClaimed);
          if (typeof run.challengeDelta === "number") setChallengeDelta(run.challengeDelta);
          if (typeof run.challengesUsed === "number") setChallengesUsed(Math.max(0, run.challengesUsed));
          if (typeof run.adDuels === "number") setAdDuels(Math.max(0, Math.min(5, run.adDuels)));
          // Instant bridge: the last-known incoming net delta (losses − gains), so
          // seasonPts is already adjusted the moment the save gate opens, even
          // before the authoritative reconcile below returns.
          if (typeof run.incomingDelta === "number") setIncomingDelta(run.incomingDelta);
        }
        // Authoritative reconcile BEFORE `hydrated` flips: fold in every incoming
        // duel that touched our points today (losses AND passive-defence gains),
        // including any that landed while we were away. Only overwrites when we got
        // a real answer (null = fetch failed → keep the bridged value rather than
        // clobber a real transfer). This closes the boot window where the first
        // the server balance remains the source of truth throughout boot.
        const bootNet = await sumIncomingNetForDay(key);
        if (alive && bootNet !== null) setIncomingDelta(bootNet);
        const savedStreak = await getMyStreak(key);
        if (alive && savedStreak !== null) setStreak(savedStreak);
        const wallet = await getWalletState();
        if (alive && wallet?.ok) {
          setCoins(wallet.coins);
          setOwned(wallet.owned);
          setEquippedAvatar(wallet.equippedAvatar);
          setEquippedFrame(wallet.equippedFrame);
          const savedAvatarItem = SHOP_ITEMS.find((item) => item.id === wallet.equippedAvatar);
          if (savedAvatarItem?.type === "avatar") setAvatar(savedAvatarItem.glyph);
        }
      }
      const ownScore = await getMySeasonScore(seasonKey);
      if (alive && ownScore !== null) setServerSeasonPts(ownScore);
      const rows = await fetchLeaderboard(seasonKey);
      if (alive && rows !== null) setBoard(rows);
      // Restore is done → open the save gate. Any state we just set has already
      // been queued, so the first post-hydration save writes the correct total.
      if (alive) { setHydrated(true); setBooting(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Persist today's run (debounced) -------------------------------------
  // Mirrors the score save above, but writes the daily RUN so a refresh restores
  // it. RECONCILIATION: rather than persist challengeDelta on its own and risk the
  // rebuilt seasonPts drifting below the saved score, we store the WHOLE run blob
  // (played games + the +50 gift + net duel points) under today's day key. On
  // boot we replay all of it before opening the save gate, so seasonPts is
  // reconstructed identically while the server score remains authoritative.
  // reality. Keyed by dayKey (YYYY-MM-DD) so a genuine new day starts empty while
  // a same-day refresh restores the locked run. Same `hydrated` gate as above.
  const runSaveTimer = useRef(null);
  useEffect(() => {
    if (!hasSupabase || !onboarded || !hydrated || periodHydrating) return;
    clearTimeout(runSaveTimer.current);
    const run = { played: playedGames, bonusPts, rewardClaimed, challengeDelta, incomingDelta, challengesUsed, adDuels };
    const key = dayKey;
    runSaveTimer.current = setTimeout(() => { saveDailyRun(key, run); }, 1200);
    return () => clearTimeout(runSaveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playedGames, bonusPts, rewardClaimed, challengeDelta, incomingDelta, challengesUsed, adDuels, onboarded, hydrated, periodHydrating, dayKey]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  // Pull the latest rankings from the backend on demand. No-op offline (fetch
  // returns [] → keep the current board). Guarded against overlapping taps.
  const refreshBoard = async () => {
    if (!hasSupabase || refreshingBoard) return;
    setRefreshingBoard(true);
    const rows = await fetchLeaderboard(seasonKey);
    if (rows !== null) setBoard(rows);
    setRefreshingBoard(false);
    showToast(rows === null ? "Couldn't reach the leaderboard" : "Rankings updated");
    loadDuelable();
    reconcileIncoming();
  };

  // Who can I duel today, and on which games? The server's duelable_targets RPC is
  // per-game, so we fan out one call per game and merge into a by-nickname map the
  // leaderboard / picker / stake sheet all read. This is the ONLY source of truth
  // for eligibility — a name absent here is non-selectable (hasn't played, out of
  // band, shielded, in grace, or on the per-pair 24h cooldown). No-op offline.
  const loadDuelable = async () => {
    if (!hasSupabase) return;
    setDuelableLoading(true);
    try {
      const results = await Promise.all(GAMES.map((g) => getDuelableTargets(g.id, dayKey, seasonKey)));
      const map = {};
      GAMES.forEach((g, i) => {
        for (const t of results[i] || []) {
          if (!t || !t.name) continue;
          if (!map[t.name]) map[t.name] = { defenderId: t.defenderId, name: t.name, avatar: t.avatar, pts: t.pts, games: {} };
          map[t.name].games[g.id] = { snapshotPts: t.snapshotPts, snapshotLabel: t.snapshotLabel };
        }
      });
      setDuelableByName(map);
    } catch (e) {
      // Never let a duelability refresh break the app — keep whatever we had.
    } finally {
      setDuelableLoading(false);
    }
  };

  // Surface "someone beat you in a duel" news for the unread badge/banner. This is
  // the DISPLAY path and is independent of the point reconciliation below: the
  // banner drives the read/unread flag, reconcileIncoming drives the score. Keeping
  // them separate is deliberate — marking a notification read must NOT change how
  // many points it accounts for, and folding a loss into the score must NOT clear
  // the badge. (getNotifications returns null on failure → treat as "no news".)
  const loadNotifs = async () => {
    if (!hasSupabase) return;
    try {
      const rows = await getNotifications({ unreadOnly: true, limit: 20 });
      const news = (rows || []).filter((r) => r.type === "duel_lost" || r.type === "duel_defended");
      setDuelNotifs(news);
    } catch (e) {
      /* ignore — notifications are non-critical */
    }
  };

  // NET Season-Points change from duels OTHER players settled against us TODAY,
  // read from our own notifications (the only record the client can see of a duel
  // that touched our points while we were passive). Signed:
  //   'duel_lost'     → an attacker BEAT our recorded score and took points → −
  //   'duel_defended' → an attacker CHALLENGED and LOST; we passively won the
  //                     forfeited stake → +
  // Returns the signed net, or NULL when the fetch failed — callers must treat null
  // as "unknown" and NOT zero the delta, or a transient outage would clobber a real
  // persisted transfer. Idempotent: a pure sum over today's notifications, so
  // running it any number of times yields the same value — there is no
  // per-notification "applied" bookkeeping to get wrong, and double-application is
  // structurally impossible in EITHER direction.
  const sumIncomingNetForDay = async (dayK) => {
    const rows = await getNotifications({ limit: 100 });
    if (!Array.isArray(rows)) return null; // null = fetch failed → "unknown"
    let net = 0;
    for (const n of rows) {
      if (!n) continue;
      if (localDayKey(n.created_at) !== dayK) continue; // only today feeds today
      const pts = Math.max(0, Number(n.payload?.points) || 0);
      if (n.type === "duel_lost") net -= pts;
      else if (n.type === "duel_defended") net += pts;
    }
    return net;
  };

  // Refresh the incoming net delta from the server's authoritative record. Safe to
  // call on any cadence (boot, board refresh, focus, interval); each call fully
  // recomputes incomingDelta, so it self-heals and never double-counts in either
  // direction. No-op when the fetch failed (keeps whatever we had rather than
  // reverting a real transfer).
  const reconcileIncoming = async () => {
    if (!hasSupabase) return;
    const [net, latestScore] = await Promise.all([
      sumIncomingNetForDay(dayKey),
      getMySeasonScore(seasonKey),
    ]);
    if (net !== null) setIncomingDelta(net);
    if (latestScore !== null) setServerSeasonPts(latestScore);
  };

  // Load duelability + notifications once boot has restored today's run. Re-runs if
  // the day rolls over (a fresh dayKey means a fresh eligible set).
  useEffect(() => {
    if (!hasSupabase || !onboarded || !hydrated) return;
    loadDuelable();
    loadNotifs();
    reconcileIncoming();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, onboarded, dayKey]);

  // Keep the incoming-loss delta fresh WITHIN a session. Incoming duels are async
  // and non-consensual — an attacker can settle against us at any time — so we poll
  // the authoritative record on a light interval and whenever the tab regains
  // focus. This shrinks (does not fully eliminate) the window in which a re-save
  // could momentarily reflect a not-yet-seen loss; the deterministic close is on
  // boot. reconcileIncoming is idempotent, so calling it here is always safe.
  useEffect(() => {
    if (!hasSupabase || !onboarded || !hydrated) return;
    const tick = () => reconcileIncoming();
    const iv = setInterval(tick, 30000);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, onboarded, dayKey]);

  // GDPR erasure. Deletes the auth user (CASCADEs to profile + scores) and signs
  // the local session out. All app state is in-memory, so the honest "clean
  // first-run" reset is a reload: boot re-runs, mints a FRESH anonymous account,
  // finds no profile, and drops the user back on onboarding. Guarded so it never
  // fires without a backend. Only reachable after an explicit in-app confirm.
  const runDeleteAccount = async () => {
    if (!hasSupabase || deleting) return;
    setDeleteErr(null);
    setDeleting(true);
    const res = await deleteAccount();
    if (res.ok) {
      window.location.reload();
      return;
    }
    setDeleting(false);
    setDeleteErr("Couldn't delete your account. Check your connection and try again.");
  };

  const connectGoogleAccount = async () => {
    if (!hasSupabase || accountBusy) return;
    setAccountBusy(true);
    const result = await linkGoogleIdentity();
    if (!result.ok) {
      setAccountBusy(false);
      showToast(result.message || "Couldn't connect Google");
    }
  };

  const runSignOut = async () => {
    if (!hasSupabase || accountBusy || authUser?.is_anonymous) return;
    setAccountBusy(true);
    const result = await signOutAccount();
    if (result.ok) {
      window.location.reload();
      return;
    }
    setAccountBusy(false);
    showToast(result.message || "Couldn't sign out");
  };

  // Where you'd land on the season board with a given point total.
  // Uses the real leaderboard (`board`) when present, BOTS otherwise.
  const rankAt = (pts) => [...board.filter((b) => b.name !== username).map((b) => b.pts), pts].sort((a, b) => b - a).indexOf(pts) + 1;

  const launchGame = async (gameId, practice = false) => {
    setGameLive(false);
    setPracticeMode(practice);
    setActiveAttempt(null);
    const scored = !practice && !playedGames[gameId];
    if (hasSupabase && scored) {
      const attempt = await startGameAttempt(gameId, "daily", dayKey, seasonKey);
      if (!attempt?.ok) {
        showToast(duelErrText(attempt?.error));
        return;
      }
      setActiveAttempt({
        id: attempt.attempt_id,
        seed: Number(attempt.seed),
        gameId,
      });
    }
    setActiveGame(gameId);
  };

  const finish = (raw, pts, label, secondary) => {
    if (practiceMode) {
      showToast(`Practice: ${label} (doesn't count)`);
      setActiveGame(null);
      return;
    }
    if (!playedGames[activeGame]) {
      const gameId = activeGame;
      const attemptId = activeAttempt?.id || null;
      const delta = Math.max(-15, Math.min(28, Math.round((pts - 480) / 22)));
      const firstOfDay = Object.keys(playedGames).length === 0;
      setPlayedGames((p) => ({ ...p, [gameId]: { raw, pts, label } }));
      // Append to the cross-player index so this player is now DUELABLE on this
      // game today (a challenger's snapshot reads the latest same-day row here).
      // `secondary` is the finer tiebreak metric — it becomes this player's snapshot
      // value that a later duel breaks a points-tie against. Fire-and-forget: the
      // data layer no-ops offline / not signed in and never throws, so this cannot
      // break the run. Duel settlement recomputes points server-side, so the
      // client-side `pts` sent here is display-only.
      recordGameScore(attemptId, gameId, dayKey, seasonKey, raw, label, secondary, { secondary }).then(async (res) => {
        const authoritative = Number(res?.balance);
        const awarded = Number(res?.points);
        if (res?.ok) {
          if (Number.isFinite(authoritative)) setServerSeasonPts(authoritative);
          if (Number.isFinite(awarded)) {
            setPlayedGames((current) => current[gameId]
              ? { ...current, [gameId]: { ...current[gameId], pts: awarded } }
              : current);
            setReveal((current) => current?.gameId === gameId
              ? {
                  ...current,
                  score: awarded,
                  pct: Math.max(12, Math.min(99, Math.round(awarded / 10))),
                  rankUp: Math.max(0, rankAt(seasonPts) - rankAt(seasonPts + awarded)),
                }
              : current);
          }
          const coinResult = await claimGameCoins(gameId, dayKey);
          const coinBalance = Number(coinResult?.coins);
          if (coinResult?.ok && Number.isFinite(coinBalance)) setCoins(coinBalance);
          else if (hasSupabase) showToast("Coin reward sync failed — try again later");
        }
        else if (hasSupabase) showToast("Score saved locally; server sync failed");
      });
      if (!hasSupabase) setCoins((c) => c + Math.round(pts / 10));
      setElo((e) => e + delta);
      if (firstOfDay) setStreak((s) => s + 1);
      // Bank the run behind the reveal panel instead of a toast that scrolls past.
      setReveal({
        headline: "Game complete",
        result: label,
        score: pts,
        pct: Math.max(12, Math.min(99, Math.round(pts / 10))), // games score out of 1000
        rankUp: Math.max(0, rankAt(seasonPts) - rankAt(seasonPts + pts)),
        streak: streak + (firstOfDay ? 1 : 0),
        drop: rollDrop(),
        rewardSource: { type: "game", gameId },
        gameId,
      });
      setActiveAttempt(null);
    } else {
      showToast(`Practice: ${label} (doesn't count)`);
    }
    setActiveGame(null);
  };

  const claimReward = async () => {
    if (rewardClaimed || rewardClaiming || reveal) return;
    setRewardClaiming(true);
    setRewardClaimed(true);
    const result = hasSupabase
      ? await claimDailyBonus(dayKey, seasonKey)
      : { ok: true, claimed: true, points: 50 };
    setRewardClaiming(false);
    if (!result?.ok) {
      setRewardClaimed(false);
      showToast("Daily gift couldn't be claimed — try again");
      return;
    }
    setBonusPts(50);
    const authoritative = Number(result.balance);
    if (Number.isFinite(authoritative)) setServerSeasonPts(authoritative);
    if (result.claimed === false) {
      showToast("Daily gift was already claimed");
      return;
    }
    setReveal({
      headline: "Daily gift",
      score: result.claimed === false ? 0 : 50,
      pct: null, // no field to compare against — this one is just handed to you
      rankUp: Math.max(0, rankAt(seasonPts) - rankAt(seasonPts + 50)),
      streak,
      drop: rollDrop(),
      rewardSource: { type: "daily_bonus", gameId: null },
    });
  };

  const openRevealDrop = async (fallback) => {
    if (!hasSupabase) return fallback;
    const source = reveal?.rewardSource;
    if (!source) return null;
    const result = await claimRewardDrop(source.type, source.gameId, dayKey);
    const balance = Number(result?.coins);
    const amount = Number(result?.amount);
    if (!result?.ok || !Number.isFinite(balance) || !Number.isFinite(amount)) {
      showToast("Reward couldn't be opened — try again");
      return null;
    }
    setCoins(balance);
    return dropForCoins(amount);
  };

  // Offline demo applies its local drop here. Production balance already changed
  // atomically when openRevealDrop returned the server-generated reward.
  const collectReveal = (drop) => {
    if (!hasSupabase && drop?.coins) setCoins((c) => c + drop.coins);
    setReveal(null);
  };

  // Called with the DuelScreen's outcome object:
  //   server:  { won, transferred, partial, stake }
  //   offline: { won, transferred: stake, offline: true }
  //   error:   { error: true, message }
  // Points are NEVER recomputed here — we reflect the server's `transferred` into
  // OUR OWN challengeDelta only (+transferred on a win, −transferred on a loss).
  // The server returns the new balance after moving the transfer. On an error
  // nothing moves and no win/loss is recorded.
  const duelDone = (res) => {
    const finish = () => { setDuelOpp(null); setDuelTarget(null); setDuelAttempt(null); setDuelStake(0); if (hasSupabase) loadDuelable(); };
    if (res && res.error) {
      setChallengesUsed((n) => Math.max(0, n - 1));
      showToast(res.message || "Duel couldn't be settled — no points changed");
      finish();
      return;
    }
    // PUSH: an exact tie moved no points and must NOT cost a duel. challengesUsed was
    // incremented up-front in confirmStake, so refund it here. Leaves duelRecord and
    // challengeDelta untouched (zero-sum: nothing changed hands).
    if (res && res.tie) {
      setChallengesUsed((n) => Math.max(0, n - 1));
      showToast("Dead heat — no points moved, duel refunded");
      finish();
      return;
    }
    const won = !!(res && res.won);
    const moved = Number(res && res.transferred) || 0;
    const partial = !!(res && res.partial);
    const authoritative = Number(res && res.challenger_balance);
    if (Number.isFinite(authoritative)) setServerSeasonPts(authoritative);
    setDuelRecord((r) => ({ w: r.w + (won ? 1 : 0), l: r.l + (won ? 0 : 1) }));
    if (duelStake > 0) {
      setChallengeDelta((d) => d + (won ? moved : -moved));
      if (won) showToast(moved === 0 ? "Win! (shielded — no points to take)" : `Win! +${moved} pts${partial ? " (partial)" : ""}`);
      else showToast(moved === 0 ? "Loss (no points to lose)" : `Loss! −${moved} pts`);
    } else {
      if (won) setDuelXP((x) => x + 40);
      showToast(won ? "Win! +40 pts" : "Loss — ask for a rematch!");
    }
    finish();
  };

  // Settle the active duel server-side. Sends ONLY the raw performance + context;
  // the Edge Function recomputes the score, decides the winner, enforces
  // shield/floor/cooldown/band, and moves points atomically. Returns the verdict
  // (or { ok:false, error }). Null when there is no server target (offline path,
  // where DuelScreen uses its local fallback instead).
  const settleActiveDuel = async ({ raw, secondary }) => {
    if (!hasSupabase || !duelTarget) return null;
    return settleDuel({ attemptId: duelAttempt?.id, defenderId: duelTarget.defenderId, gameId: duelGame, day: dayKey, season: seasonKey, stake: duelStake, raw, secondary });
  };

  // Rank across the season leaderboard (for the story card)
  const shareRank = (() => {
    const rows = [...board.filter((b) => b.name !== username).map((b) => b.pts), seasonPts].sort((a, b) => b - a);
    return rows.indexOf(seasonPts) + 1;
  })();

  const onShareStory = () => {
    // Production: renders this card to an image and opens instagram-stories:// via a
    // native share plugin (Capacitor/RN). In this web preview we confirm the flow.
    showToast("Opens Instagram Story in the app (native share)");
  };

  const shareText = () => {
    const lines = GAMES.map((g) => {
      const r = playedGames[g.id];
      return r ? `${g.emoji} ${r.label}` : `${g.emoji} —`;
    });
    return `⚔️ Skill Duels · ${SEASON_NAME} Season\n${lines.join("\n")}\n🏆 ${seasonPts.toLocaleString()} season pts · 🔥 ${streak} day streak\nPlay too: skillduels.app`;
  };

  const doCopy = () => {
    const text = shareText();
    try {
      navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false));
    } catch (e) {
      setCopied(false);
    }
    setTimeout(() => setCopied(false), 2500);
  };

  const COOLDOWN = 20000; // 20s demo cooldown between ranked challenges
  const onCooldown = Date.now() - lastChallenge < COOLDOWN;
  const cooldownLeft = Math.ceil((COOLDOWN - (Date.now() - lastChallenge)) / 1000);

  // Production permits the three server-verifiable free duels only. Rewarded-ad
  // unlocks remain offline-demo-only until an ad provider can verify receipts.
  // Daily games stay one scored attempt per game and continue to drive ranking.
  const FREE_CHALLENGES = 3;
  const MAX_AD_DUELS = hasSupabase ? 0 : 5;
  const adCapReached = adDuels >= MAX_AD_DUELS;
  const challengesLeft = FREE_CHALLENGES + adDuels - challengesUsed;
  const canWatchAd = !adCapReached; // still have ad slots today

  // First-duel gate: on a player's very first duel action we show the explainer
  // once, then continue into whatever they were about to do. `then` is "picker"
  // (Today's Duel button) or an opponent object (a leaderboard row). Returns true
  // when it intercepted, so callers bail and let the intro drive the flow.
  const guardDuelIntro = (then) => {
    if (seenDuelIntro) return false;
    markDuelIntroSeen();
    setDuelHelpThen(then);
    setDuelHelpOpen(true);
    return true;
  };
  // Dismiss the explainer and resume any pending flow it interrupted.
  const closeDuelHelp = () => {
    const then = duelHelpThen;
    setDuelHelpOpen(false);
    setDuelHelpThen(null);
    if (then === "picker") setPickerOpen(true);
    else if (then && typeof then === "object") openStake(then);
  };

  const openStake = (opp) => {
    if (guardDuelIntro(opp)) return; // first duel → explainer first, then resume

    if (challengesLeft <= 0) {
      if (adCapReached) { showToast("Daily duel limit reached — come back tomorrow"); return; }
      setAdPromptFor(opp); return;                                    // out of tries → offer ad
    }
    if (onCooldown) { showToast(`⏳ Cooldown — wait ${cooldownLeft}s`); return; }
    // Server path: only players present in the duelable set can be challenged, and
    // only on the games they actually played today. Default the game picker to the
    // first game they're duelable on.
    if (hasSupabase) {
      const info = duelableByName[opp.name];
      if (!info || !Object.keys(info.games).length) {
        showToast("That player isn't duelable right now — check back after they play");
        return;
      }
      setPickGame(Object.keys(info.games)[0]);
    } else {
      setPickGame("draw"); // offline fallback picks a real game id (was a dead "reaction")
    }
    setStakeFor(opp);
  };

  // Server pre-flight + launch. startDuel re-checks eligibility right before the VS
  // screen (a target who got shielded / played again / went on cooldown since the
  // list loaded is caught here) and locks in the fresh snapshot the UI shows.
  const confirmStake = async (opp, amount, gameId) => {
    setStakeFor(null);
    if (!hasSupabase) {
      // Offline fallback: old fake path, no server target.
      setDuelGame(gameId || "draw");
      setDuelStake(amount);
      setDuelTarget(null);
      setDuelAttempt(null);
      setDuelOpp(opp);
      setChallengesUsed((n) => n + 1);
      setLastChallenge(Date.now());
      return;
    }
    const info = duelableByName[opp.name];
    if (!info || !info.games[gameId]) {
      showToast("That player isn't duelable on that game anymore");
      loadDuelable();
      return;
    }
    const pre = await startDuel(info.defenderId, gameId, dayKey, seasonKey);
    if (!pre.ok) {
      showToast(duelErrText(pre.error));
      loadDuelable();
      return;
    }
    const attempt = await startGameAttempt(gameId, "duel", dayKey, seasonKey, info.defenderId);
    if (!attempt?.ok) {
      showToast(duelErrText(attempt?.error));
      loadDuelable();
      return;
    }
    const fresh = pre.target;
    setDuelGame(gameId);
    setDuelStake(amount);
    setDuelTarget({ defenderId: fresh.defenderId, name: fresh.name, avatar: fresh.avatar, snapshotPts: fresh.snapshotPts, snapshotLabel: fresh.snapshotLabel });
    setDuelAttempt({ id: attempt.attempt_id, seed: Number(attempt.seed), gameId });
    setDuelOpp({ name: fresh.name, avatar: fresh.avatar, pts: fresh.pts });
    setChallengesUsed((n) => n + 1);
    setLastChallenge(Date.now());
  };

  // Rewarded ad → grants one extra challenge (respects the daily cap).
  const watchAdDirect = () => {
    if (adCapReached) { showToast("Daily duel limit reached — come back tomorrow"); return; }
    setAdPlaying(true);
    setTimeout(() => {
      setAdPlaying(false);
      setAdDuels((n) => n + 1);
      showToast("+1 challenge unlocked!");
    }, 2600);
  };

  const watchAdForDuel = () => {
    const opp = adPromptFor;
    setAdPromptFor(null);
    if (adCapReached) { showToast("Daily duel limit reached — come back tomorrow"); return; }
    setAdPlaying(true);
    setTimeout(() => {
      setAdPlaying(false);
      setAdDuels((n) => n + 1);
      showToast("+1 challenge unlocked!");
      if (opp) {
        setLastChallenge(0); // bypass cooldown for the earned try
        if (hasSupabase) {
          const info = duelableByName[opp.name];
          if (!info || !Object.keys(info.games).length) { showToast("That player isn't duelable right now"); return; }
          setPickGame(Object.keys(info.games)[0]);
        } else {
          setPickGame("draw");
        }
        setStakeFor(opp);
      }
    }, 2600);
  };

  const buyCosmetic = async (it) => {
    if (coins < it.cost) return;
    if (hasSupabase) {
      const result = await purchaseCosmetic(it.id);
      if (!result?.ok) {
        showToast(result?.error === "insufficient_coins"
          ? "Not enough coins"
          : "Purchase failed — try again");
        return;
      }
      const balance = Number(result.coins);
      if (Number.isFinite(balance)) setCoins(balance);
      setOwned((current) => current.includes(it.id) ? current : [...current, it.id]);
      setEquippedAvatar(typeof result.equipped_avatar === "string" ? result.equipped_avatar : null);
      setEquippedFrame(typeof result.equipped_frame === "string" ? result.equipped_frame : null);
      if (it.type === "avatar") {
        setAvatar(it.glyph);
        await updateAvatar(it.glyph);
      }
      Sound.win();
      showToast(`${it.name} unlocked & equipped!`);
      return;
    }
    setCoins((c) => c - it.cost);
    setOwned((o) => [...o, it.id]);
    if (it.type === "avatar") {
      setEquippedAvatar(it.id);
      setAvatar(it.glyph);
    } else {
      setEquippedFrame(it.id);
    }
    Sound.win();
    showToast(`${it.name} unlocked & equipped!`);
  };
  const buyCoins = (pk) => {
    if (hasSupabase) {
      showToast("Coin packs require verified StoreKit / Play Billing");
      return;
    }
    // Offline demo only. Production never trusts a client-side purchase flag.
    setCoins((c) => c + pk.coins);
    Sound.win();
    showToast(`+${pk.coins.toLocaleString()} coins (demo purchase)`);
  };
  const equipOwned = async (itemId, explicitSlot) => {
    const item = itemId ? SHOP_ITEMS.find((candidate) => candidate.id === itemId) : null;
    const slot = explicitSlot || item?.type;
    if (slot !== "avatar" && slot !== "frame") return;
    if (!hasSupabase) {
      if (slot === "avatar") {
        setEquippedAvatar(itemId);
        if (item?.glyph) setAvatar(item.glyph);
      } else {
        setEquippedFrame(itemId);
      }
      return;
    }
    const result = await equipCosmetic(itemId, slot);
    if (!result?.ok) {
      showToast("Couldn't equip item");
      return;
    }
    setEquippedAvatar(typeof result.equipped_avatar === "string" ? result.equipped_avatar : null);
    setEquippedFrame(typeof result.equipped_frame === "string" ? result.equipped_frame : null);
    if (slot === "avatar" && item?.glyph) {
      setAvatar(item.glyph);
      await updateAvatar(item.glyph);
    }
  };
  const chooseAvatar = async (glyph) => {
    const item = SHOP_ITEMS.find((candidate) => candidate.type === "avatar" && candidate.glyph === glyph);
    if (item) {
      await equipOwned(item.id, "avatar");
    } else {
      setAvatar(glyph);
      setEquippedAvatar(null);
      if (hasSupabase) {
        const result = await equipCosmetic(null, "avatar");
        if (!result?.ok) {
          showToast("Couldn't save avatar");
          return;
        }
        await updateAvatar(glyph);
      }
    }
    Sound.beep(700, 0.05);
  };

  // Avatars available to equip = all base avatars + any purchased avatar cosmetics.
  const ownedAvatarGlyphs = SHOP_ITEMS.filter((it) => it.type === "avatar" && owned.includes(it.id)).map((it) => it.glyph);
  const avatarOptions = [...AVATARS, ...ownedAvatarGlyphs];
  // Equipped frame (from shop) wraps the profile avatar.
  const equippedFrameItem = SHOP_ITEMS.find((it) => it.id === equippedFrame);
  const equippedFrameId = equippedFrameItem?.frame || null;

  const userEntry = seasonPts > 0 ? { name: username, avatar, pts: seasonPts } : null;
  const game = GAMES.find((g) => g.id === activeGame);
  const isReplay = activeGame && playedGames[activeGame];
  // Nothing is being recorded → the challenge should be new rather than the day's fixed one.
  const unscored = !!(practiceMode || isReplay);

  // Sections in orbit order — the header arrows and the orb menu both walk this list.
  const SECTIONS = [
    ["today", "Today", T.yellow, "bolt"],
    ["season", "Season", T.purple, "crown"],
    ["leaderboard", "Ranking", T.green, "trophy"],
    ["shop", "Shop", T.red, "bag"],
    ["profile", "Profile", T.blue, "user"],
  ];
  const secIdx = Math.max(0, SECTIONS.findIndex((s) => s[0] === tab));
  const section = SECTIONS[secIdx];
  const step = (dir) => setTab(SECTIONS[(secIdx + dir + SECTIONS.length) % SECTIONS.length][0]);

  // Single responsive layout: the app always fills its container edge-to-edge.
  // On wide screens the content column is centered and capped, but never wider
  // than the viewport — so there is never any horizontal scroll on any device.
  const shell = (children) => {
    // On phones: fill the screen. On desktop: show an accurate iPhone (390×844, 19.5:9) frame.
    const inner = (
      <div style={{ width: "100%", height: "100%", position: "relative",
        overflow: "hidden", background: T.bg, touchAction: "pan-y" }}>
        {framed && (
          <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 112, height: 30,
            background: INK, borderRadius: "0 0 18px 18px", zIndex: 60 }} />
        )}
        {children}
      </div>
    );

    if (!framed)
      return (
        <div style={{ position: "fixed", inset: 0, background: T.bg, fontFamily: T.font, color: T.text,
          WebkitFontSmoothing: "antialiased", overflow: "hidden" }}>
          <FontImport />
          {inner}
        </div>
      );

    // Desktop: centered iPhone device mock on a workshop-tape backdrop.
    return (
      <div style={{ minHeight: "100vh",
        background: "repeating-linear-gradient(45deg, #141210 0 22px, #171512 22px 44px)",
        display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font, color: T.text,
        WebkitFontSmoothing: "antialiased", padding: 24, boxSizing: "border-box" }}>
        <FontImport />
        <div style={{ height: "min(844px, 94vh)", aspectRatio: "390 / 844", borderRadius: 46, background: T.bg,
          overflow: "hidden", boxShadow: `0 40px 100px -20px rgba(0,0,0,0.7), 0 0 0 11px ${INK}, 0 0 0 13px #2c2a26` }}>
          {inner}
        </div>
      </div>
    );
  };

  // Loading gate: hold the app while the saved session + profile load so we
  // never flash the default identity before the real one arrives.
  if (booting)
    return shell(
      <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 20, padding: 24 }}>
        <BrandMark size={78} />
        <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 26, letterSpacing: "-0.02em",
          color: INK, textTransform: "uppercase" }}>Skill Duels</div>
        <div style={{ ...sticker(T.yellow, T.shadowSm), borderRadius: 10, padding: "8px 16px",
          fontFamily: T.mono, fontWeight: 700, fontSize: 12.5, color: INK, letterSpacing: 0.3 }}>
          Loading…
        </div>
      </div>
    );

  if (authRequired)
    return shell(
      <AuthGateway
        onGuest={async () => {
          const result = await signInAsGuest();
          if (result.ok) window.location.reload();
          return result;
        }}
        onSignUp={async (email, password) => {
          const result = await signUpWithEmail(email, password);
          if (result.ok && result.session) window.location.reload();
          return result;
        }}
        onSignIn={async (email, password) => {
          const result = await signInWithEmail(email, password);
          if (result.ok) window.location.reload();
          return result;
        }}
        onGoogle={signInWithGoogle}
      />
    );

  if (!onboarded)
    return shell(
      <Onboarding
        // Claim the nickname against the DB when the player hits Continue. Returns
        // a result the onboarding UI shows inline (taken / invalid). With no
        // backend it resolves ok immediately and onboarding runs in-memory.
        onClaimNickname={async (n, a) => {
          const res = await setNickname(n, a);
          if (res.ok || res.error === "offline") {
            setUsername(n);
            setAvatar(a);
            return { ok: true };
          }
          return res; // { ok:false, error:"taken"|"invalid"|..., message }
        }}
        onDone={(n, a) => {
          setUsername(n);
          setAvatar(a);
          setOnboarded(true);
          Sound.win();
        }}
      />
    );

  const inGame = !!activeGame || !!duelOpp;

  return shell(
    <>
      {/* Status bar space — the desktop mock draws a fake one, phones defer to the OS. */}
      {framed ? (
        <div style={{ height: 52, flex: "none", display: "flex", alignItems: "flex-end", justifyContent: "space-between",
          padding: "0 26px 6px", position: "relative", zIndex: 5 }}>
          <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 15, color: INK }}>9:41</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: INK }}>
            <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor">
              <rect x="0" y="7" width="3" height="5" rx="1" />
              <rect x="4.5" y="4.5" width="3" height="7.5" rx="1" />
              <rect x="9" y="2" width="3" height="10" rx="1" />
              <rect x="13.5" y="0" width="3" height="12" rx="1" opacity="0.35" />
            </svg>
            <svg width="22" height="12" viewBox="0 0 24 12" fill="none">
              <rect x="1" y="1" width="19" height="10" rx="3" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.4" />
              <rect x="2.5" y="2.5" width="14" height="7" rx="1.5" fill="currentColor" />
              <rect x="21" y="4" width="2" height="4" rx="1" fill="currentColor" fillOpacity="0.5" />
            </svg>
          </div>
        </div>
      ) : (
        <div style={{ height: "max(14px, env(safe-area-inset-top))" }} />
      )}

      {/* Bold section header — name, color chip, and prev/next through the sections. */}
      {!inGame && (
        <div style={{ flex: "none", padding: "4px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
            <div style={{ fontFamily: T.display, fontWeight: 900, fontSize: 33, letterSpacing: "-0.02em", color: INK,
              textTransform: "uppercase", lineHeight: 0.9 }}>{section[1]}</div>
            <div style={{ width: 14, height: 14, background: section[2], border: `2.5px solid ${INK}`,
              borderRadius: 3, flexShrink: 0 }} />
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {[["chevronLeft", -1], ["chevron", 1]].map(([ic, dir]) => (
              <button key={ic} className="pressable" onClick={() => step(dir)}
                aria-label={dir < 0 ? "Previous section" : "Next section"}
                style={{ width: 38, height: 38, cursor: "pointer", ...sticker(T.card, `3px 3px 0 ${INK}`),
                  borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={ic} size={18} color={INK} strokeWidth={3} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sd-scroll" style={{ position: "absolute", top: framed ? (inGame ? 52 : 102) : (inGame ? 14 : 64),
        left: 0, right: 0, bottom: 0, overflowY: "auto", overflowX: "hidden", maxWidth: "100%" }}>
      <div style={{ padding: "2px 20px 0", position: "relative" }}>
        {duelOpp ? (
          <>
            <button onClick={() => { setDuelOpp(null); setDuelAttempt(null); }}
              className="pressable"
              style={{ ...sticker(T.card, `3px 3px 0 ${INK}`), borderRadius: 10, color: INK, fontSize: 13,
                fontWeight: 800, fontFamily: T.font, cursor: "pointer", padding: "7px 13px", margin: "0 0 14px" }}>
              ‹ Cancel
            </button>
            <DuelScreen opponent={duelOpp} onDone={duelDone} avatar={avatar} username={username} stake={duelStake} gameId={duelGame}
              onSettle={hasSupabase && duelTarget ? settleActiveDuel : null} target={duelTarget} attemptSeed={duelAttempt?.seed} />
          </>
        ) : activeGame ? (
          <>
            {(practiceMode || isReplay || !gameLive) ? (
              <button onClick={() => { setActiveGame(null); setActiveAttempt(null); }}
                className="pressable"
              style={{ ...sticker(T.card, `3px 3px 0 ${INK}`), borderRadius: 10, color: INK, fontSize: 13,
                fontWeight: 800, fontFamily: T.font, cursor: "pointer", padding: "7px 13px", margin: "0 0 14px" }}>
                ‹ Back
              </button>
            ) : (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, ...sticker(T.card2, "none"),
                borderRadius: 8, color: T.sub, fontSize: 12, fontWeight: 800, padding: "6px 11px", margin: "0 0 14px" }}>
                <Icon name="lock" size={13} color={T.sub} /> Attempt in progress
              </div>
            )}
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 8px", fontFamily: T.display, color: INK,
              textTransform: "uppercase", letterSpacing: "-0.02em", lineHeight: 0.95,
              display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 36, height: 36, borderRadius: 9, border: `${T.bw} solid ${INK}`, background: game.bg,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={game.icon} size={20} color={INK} strokeWidth={2.2} />
              </span>
              {game.name}
            </h1>
            {practiceMode || isReplay ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginBottom: 18,
                ...sticker(T.green, "none"), borderRadius: 8, padding: "5px 11px", color: INK, fontSize: 12.5, fontWeight: 800 }}>
                <Icon name="dumbbell" size={14} color={INK} strokeWidth={2.4} />
                Practice — doesn't count
              </div>
            ) : (
              <div style={{ color: T.sub, fontSize: 13, marginBottom: 18, fontWeight: 700 }}>One attempt — make it count!</div>
            )}
            {activeGame === "draw" && <DuelDrawGame onFinish={finish} onBegin={() => setGameLive(true)} fresh={unscored} attemptSeed={activeAttempt?.seed} />}
            {activeGame === "bullseye" && <BullseyeGame onFinish={finish} onBegin={() => setGameLive(true)} fresh={unscored} attemptSeed={activeAttempt?.seed} />}
            {activeGame === "numbers" && <NumberRushGame onFinish={finish} onBegin={() => setGameLive(true)} fresh={unscored} attemptSeed={activeAttempt?.seed} />}
            {activeGame === "oddone" && <OddOneGame onFinish={finish} onBegin={() => setGameLive(true)} fresh={unscored} attemptSeed={activeAttempt?.seed} />}
            {activeGame === "chimp" && <ChimpGame onFinish={finish} onBegin={() => setGameLive(true)} fresh={unscored} attemptSeed={activeAttempt?.seed} />}
            {activeGame === "quickmath" && <QuickMathGame onFinish={finish} onBegin={() => setGameLive(true)} fresh={unscored} attemptSeed={activeAttempt?.seed} />}
          </>
        ) : (
          <>
            {hasSupabase && duelNotifs.length > 0 && (
              <DuelNewsBanner
                notifs={duelNotifs}
                duelable={duelableByName}
                onMarkRead={(ids) => markNotificationsRead(ids)}
                onDismiss={() => setDuelNotifs([])}
                onDuelBack={(target) => { setDuelNotifs([]); openStake(target); }}
              />
            )}
            {tab === "today" && (
              <TodayScreen playedGames={playedGames} streak={streak} totalPts={totalPts}
                openGame={(id) => launchGame(id, false)}
                openPractice={(id) => launchGame(id, true)}
                onPractice={() => setPracticeOpen(true)}
                countdown={countdown} rewardClaimed={rewardClaimed} claimReward={claimReward}
                onShare={() => { setShareOpen(true); setCopied(false); }} onDuel={() => { if (!guardDuelIntro("picker")) setPickerOpen(true); }}
                onHelp={() => setTab("shop")} balance={balance} challengesLeft={challengesLeft} onWatchAd={() => watchAdDirect()} canWatchAd={canWatchAd} adSlotsLeft={MAX_AD_DUELS - adDuels}
                username={username} avatar={avatar} coins={coins} elo={elo} />
            )}
            {tab === "season" && <SeasonScreen seasonPts={seasonPts} username={username} avatar={avatar}
                countdown={countdown} seasonName={SEASON_NAME} onRewards={() => setRewardsOpen(true)} board={board} />}
            {tab === "leaderboard" && <LeaderboardScreen userEntry={userEntry} onChallenge={openStake} onHelp={() => { setDuelHelpThen(null); setDuelHelpOpen(true); }} board={board} onRefresh={refreshBoard} refreshing={refreshingBoard} duelable={duelableByName} hasBackend={hasSupabase} />}
            {tab === "shop" && <ShopScreen coins={coins} owned={owned}
              equippedAvatar={equippedAvatar} equippedFrame={equippedFrame}
              onBuy={buyCosmetic} onBuyCoins={buyCoins} onEquip={equipOwned} />}
            {tab === "profile" && (
              <ProfileScreen elo={elo} streak={streak} playedGames={playedGames} totalPts={totalPts}
                onEditAvatar={() => setAvatarPickerOpen(true)} equippedFrame={equippedFrameId}
                duelRecord={duelRecord} openSettings={() => setSettingsOpen(true)} avatar={avatar} username={username} seasonPts={seasonPts} />
            )}
          </>
        )}
      </div>

      </div>

      {/* Reward opening animation */}
      {reveal && <RevealOverlay {...reveal} onOpenDrop={openRevealDrop} onCollect={collectReveal} />}

      {/* Toast — sits just above the orb so it never covers the run button */}
      {toast && (
        <div style={{ position: "absolute", bottom: 104, left: "50%", transform: "translateX(-50%)",
          animation: "toastIn 250ms ease both", maxWidth: "88%", boxSizing: "border-box",
          background: INK, color: T.yellow, borderRadius: 11, padding: "11px 18px",
          fontFamily: T.mono, fontWeight: 700, fontSize: 13, zIndex: 200, textAlign: "center" }}>
          {toast}
        </div>
      )}

      {/* Matchmaking picker → routes to stake. Server path lists REAL duelable
          targets (players who scored a game today and pass band/shield/grace/
          cooldown); offline falls back to BOTS. */}
      {pickerOpen && (() => {
        const targets = hasSupabase ? Object.values(duelableByName) : null;
        return (
        <Sheet onClose={() => setPickerOpen(false)} label="Pick opponent">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 20, fontWeight: 700, fontFamily: T.display, display: "flex", alignItems: "center", gap: 8 }}><Icon name="swords" size={20} color={T.red} />Pick opponent</div>
            <DuelHelpLink onOpen={() => { setDuelHelpThen(null); setDuelHelpOpen(true); }} />
          </div>
          <div style={{ color: T.sub, fontSize: 13, marginBottom: 16 }}>Ranked · stake points · winner takes the stake</div>
          {hasSupabase ? (
            duelableLoading && !targets.length ? (
              <div style={{ textAlign: "center", color: T.sub, fontSize: 13, padding: "26px 0" }}>Finding opponents…</div>
            ) : targets.length ? (
              targets.map((f) => (
                <div key={f.name} className="pressable" onClick={() => { setPickerOpen(false); openStake(f); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 10px", borderRadius: 14, cursor: "pointer",
                    borderBottom: `2px solid ${INK}` }}>
                  <Avatar id={f.avatar} size={44} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{f.name}</div>
                    <div style={{ color: T.sub, fontSize: 12 }}>{f.pts} pts · duelable on {Object.keys(f.games).length} game{Object.keys(f.games).length === 1 ? "" : "s"} today</div>
                  </div>
                  <Pill color={T.red}>Stake</Pill>
                </div>
              ))
            ) : (
              <div style={{ ...sticker(T.card, T.shadowSm), borderRadius: 14, padding: "24px 18px", textAlign: "center",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 26 }}>🕰️</span>
                <div style={{ fontWeight: 800, fontSize: 15, color: T.text }}>No one to duel yet</div>
                <div style={{ color: T.sub, fontSize: 12.5, lineHeight: 1.4, maxWidth: 250 }}>
                  Players become duelable once they play a game today and land in your points range. Check back soon.
                </div>
              </div>
            )
          ) : (
            BOTS.map((f) => (
              <div key={f.name} className="pressable" onClick={() => { setPickerOpen(false); openStake(f); }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 10px", borderRadius: 14, cursor: "pointer",
                  borderBottom: `2px solid ${INK}` }}>
                <Avatar id={f.avatar} size={44} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>{f.name} {f.friend && <Icon name="users" size={12} color={T.sub2} strokeWidth={2.1} />}</div>
                  <div style={{ color: T.sub, fontSize: 12 }}>~{f.skill} ms average · {f.pts} pts</div>
                </div>
                <Pill color={T.red}>Stake</Pill>
              </div>
            ))
          )}
        </Sheet>
        );
      })()}

      {/* Stake selection sheet */}
      {stakeFor && (
        <Sheet onClose={() => setStakeFor(null)} label="Choose duel stake">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 20, fontWeight: 700, fontFamily: T.display, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="swords" size={20} color={T.red} />Set your stake
            </div>
            <DuelHelpLink onOpen={() => { setDuelHelpThen(null); setDuelHelpOpen(true); }} />
          </div>
          <div style={{ color: T.sub, fontSize: 13, marginBottom: 14 }}>
            vs <b style={{ color: T.text }}>{stakeFor.name}</b> · pick a game, then your stake. Win to steal it, lose and you pay.
          </div>

          {/* Game picker — server path shows ONLY the games this defender actually
              played today (the games we can settle against); offline shows all. */}
          <div style={{ fontSize: 13, fontWeight: 700, color: T.sub, letterSpacing: 0.3, marginBottom: 10 }}>CHOOSE GAME</div>
          {(() => {
            const info = hasSupabase ? duelableByName[stakeFor.name] : null;
            const playable = hasSupabase ? GAMES.filter((g) => info && info.games[g.id]) : GAMES;
            const snap = info && pickGame && info.games[pickGame];
            return (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: snap ? 10 : 18 }}>
                  {playable.map((g) => (
                    <button key={g.id} className="pressable" onClick={() => setPickGame(g.id)}
                      style={{ boxSizing: "border-box", display: "flex", alignItems: "center", gap: 10, padding: "12px",
                        borderRadius: 14, cursor: "pointer", textAlign: "left",
                        border: `${T.bw} solid ${INK}`, boxShadow: pickGame === g.id ? T.shadowMd : T.shadowSm,
                        background: pickGame === g.id ? g.bg : T.card }}>
                      <Icon name={g.icon} size={22} color={inkOn(g.color)} strokeWidth={2.2} />
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{g.name}</span>
                    </button>
                  ))}
                </div>
                {snap && (
                  <div style={{ ...sticker(T.card, T.shadowSm), borderRadius: 10, padding: "9px 12px", marginBottom: 18,
                    display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: T.text }}>
                    <Icon name="target" size={14} color={T.red} />
                    {stakeFor.name}'s score to beat: <span style={{ color: T.red }}>{snap.snapshotLabel}</span>
                  </div>
                )}
              </>
            );
          })()}

          <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.card, border: `${T.bw} solid ${INK}`,
            borderRadius: 16, padding: "12px 14px", marginBottom: 16 }}>
            <Avatar id={avatar} size={40} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: T.sub }}>Your balance</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: T.display, color: T.yellow }}>{balance} pts</div>
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.sub, letterSpacing: 0.3, marginBottom: 10 }}>YOUR STAKE</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
            {[50, 100, 200].map((amt) => {
              // Can't stake until a game is chosen, and only points you have.
              const ready = !!pickGame && balance >= amt;
              return (
                <button key={amt} className="pressable" disabled={!ready}
                  onClick={() => ready && confirmStake(stakeFor, amt, pickGame)}
                  style={{ boxSizing: "border-box", padding: "16px 0", borderRadius: 12, cursor: ready ? "pointer" : "not-allowed",
                    ...sticker(ready ? T.red : T.card2, ready ? T.shadowMd : "none"), fontFamily: T.display,
                    color: ready ? "#fff" : T.sub2, opacity: ready ? 1 : 0.6 }}>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{amt}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: ready ? "#FFDDD4" : T.sub2 }}>points</div>
                </button>
              );
            })}
          </div>
          {!pickGame && (
            <div style={{ textAlign: "center", color: T.sub2, fontSize: 12, marginBottom: 8 }}>Pick a game above to set your stake.</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.sub2, fontSize: 12, justifyContent: "center" }}>
            <Icon name="shield" size={13} color={T.sub2} /> You can only stake points you have · 20s cooldown between challenges
          </div>
        </Sheet>
      )}

      {/* Share sheet */}
      {shareOpen && (
        <Sheet onClose={() => setShareOpen(false)} label="Share score">
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.display, marginBottom: 12 }}>Share your score</div>

          {/* 9:16 story card preview */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <div style={{ width: 232, aspectRatio: "9 / 16", borderRadius: 22, overflow: "hidden", position: "relative",
              background: "linear-gradient(165deg, #12245C 0%, #0A0A18 54%, #200A38 100%)",
              border: `1px solid rgba(255,255,255,0.12)`, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: "18px 16px 34px", boxSizing: "border-box",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
              {/* ambient glows */}
              <div style={{ position: "absolute", top: -40, left: -30, width: 200, height: 200, borderRadius: "50%",
                background: "radial-gradient(closest-side, rgba(10,132,255,0.5), transparent)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", bottom: -50, right: -40, width: 220, height: 220, borderRadius: "50%",
                background: "radial-gradient(closest-side, rgba(191,90,242,0.4), transparent)", pointerEvents: "none" }} />

              {/* brand header */}
              <div style={{ position: "absolute", top: 15, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                fontSize: 12.5, fontWeight: 700, fontFamily: T.display, letterSpacing: 1.5, color: "rgba(255,255,255,0.85)" }}>
                <Icon name="swords" size={14} color="#8FB6FF" /> SKILL DUELS</div>

              {/* avatar + name */}
              <div style={{ position: "relative", marginTop: 6 }}>
                {equippedFrameId ? <FramedAvatar id={avatar} size={72} frame={equippedFrameId} /> : <Avatar id={avatar} size={72} ring />}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.display, marginTop: 8, color: "#fff" }}>{username}</div>
              <div style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,201,60,0.16)",
                border: "1px solid rgba(255,201,60,0.5)", borderRadius: 999, padding: "3px 11px" }}>
                <Icon name="crown" size={12} color="#FFC93C" />
                <span style={{ fontSize: 11.5, fontWeight: 800, fontFamily: T.display, color: "#FFC93C", letterSpacing: 0.5 }}>#{shareRank} GLOBAL</span>
              </div>

              {/* points hero */}
              <div style={{ fontSize: 42, fontWeight: 700, fontFamily: T.display, color: "#fff", marginTop: 14, lineHeight: 1,
                textShadow: "0 0 26px rgba(120,180,255,0.7)" }}>{seasonPts.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", letterSpacing: 2, marginTop: 3 }}>SEASON POINTS</div>

              {/* today's result grid — Wordle-style flex */}
              <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
                {GAMES.map((g) => {
                  const done = !!playedGames[g.id];
                  return (
                    <div key={g.id} style={{ width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                      background: done ? `linear-gradient(150deg, ${g.color}, ${g.color}bb)` : T.card2,
                      border: `1px solid ${done ? g.color : "rgba(255,255,255,0.12)"}`,
                      boxShadow: done ? `0 4px 12px ${g.color}55` : "none" }}>
                      <Icon name={g.icon} size={17} color={done ? "#fff" : "rgba(255,255,255,0.28)"} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 12, color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 700, fontFamily: T.display }}>
                <Icon name="flame" size={14} color={T.orange} strokeWidth={2.4} /> {streak} day streak
              </div>

              <div style={{ position: "absolute", bottom: 14, left: 0, right: 0, textAlign: "center",
                fontSize: 10, color: "rgba(255,255,255,0.55)", letterSpacing: 0.5 }}>skillduels.app</div>
            </div>
          </div>

          <BigButton color="#E1306C" onClick={onShareStory}
            style={{ marginBottom: 10, background: "linear-gradient(90deg, #F58529, #DD2A7B, #8134AF)" }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Icon name="share" size={17} color="#fff" /> Share to Instagram Story
            </span>
          </BigButton>
          <BigButton color={copied ? T.green : T.card2} onClick={doCopy}
            style={{ boxShadow: T.shadowSm }}>
            {copied ? "✓ Copied!" : "Copy text instead"}
          </BigButton>
        </Sheet>
      )}

      {/* Practice picker sheet */}
      {practiceOpen && (
        <Sheet onClose={() => setPracticeOpen(false)} label="Choose practice game">
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.display, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="dumbbell" size={20} color={T.green} strokeWidth={2.1} />Practice
          </div>
          <div style={{ color: T.sub, fontSize: 13, marginBottom: 16 }}>
            Pick a game to warm up. Unlimited attempts — score isn't recorded.
          </div>
          {GAMES.map((g) => (
            <div key={g.id} className="pressable" onClick={() => { setPracticeOpen(false); launchGame(g.id, true); }}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 10px", borderRadius: 14, cursor: "pointer",
                borderBottom: `2px solid ${INK}` }}>
              <div style={{ width: 46, height: 46, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, background: g.color, border: `${T.bw} solid ${INK}` }}>
                <Icon name={g.icon} size={22} color={inkOn(g.color)} strokeWidth={2.2} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{g.name}</div>
                <div style={{ color: T.sub, fontSize: 12 }}>{g.desc}</div>
              </div>
              <Pill color={g.color}>Warm up</Pill>
            </div>
          ))}
        </Sheet>
      )}

      {/* Rewarded ad prompt (out of free challenges) */}
      {adPromptFor && (
        <Sheet onClose={() => setAdPromptFor(null)} label="Unlock another duel">
          <div style={{ textAlign: "center", padding: "6px 0" }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center",
              background: "#D6F5E7", border: `1px solid ${T.green}44` }}>
              <Icon name="playAd" size={32} color={T.green} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.display, marginBottom: 6 }}>Out of challenges</div>
            <div style={{ color: T.sub, fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
              You've used your {FREE_CHALLENGES} free challenges today.<br />Watch a short ad to unlock one more.
            </div>
            <BigButton color={T.green} onClick={watchAdForDuel}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Icon name="playAd" size={18} color={INK} /> Watch ad · +1 challenge
              </span>
            </BigButton>
            <button onClick={() => setAdPromptFor(null)}
              style={{ marginTop: 12, background: "none", border: "none", color: T.sub, fontSize: 14, fontWeight: 600,
                fontFamily: T.font, cursor: "pointer" }}>
              Maybe later
            </button>
          </div>
        </Sheet>
      )}

      {/* Ad playing overlay */}
      {adPlaying && (
        <div style={{ position: "absolute", inset: 0, zIndex: 400, background: "rgba(20,18,15,0.92)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, overflow: "hidden" }}>
          <div style={{ fontSize: 12, color: T.sub2, position: "absolute", top: 20, letterSpacing: 1 }}>ADVERTISEMENT</div>
          <div style={{ width: 60, height: 60, borderRadius: "50%", border: `3px solid ${T.green}`, borderTopColor: "transparent",
            animation: "spinSlow 0.8s linear infinite" }} />
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.display }}>Loading your reward…</div>
          <div style={{ color: T.sub, fontSize: 13 }}>+1 challenge coming up</div>
        </div>
      )}

      {/* Season rewards sheet */}
      {rewardsOpen && (
        <Sheet onClose={() => setRewardsOpen(false)} label="Season rewards">
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.display, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="crown" size={20} color={T.yellow} />Season Rewards
          </div>
          <div style={{ color: T.sub, fontSize: 13, marginBottom: 18 }}>
            The top 3 of every monthly season unlock permanent cosmetics that can <b style={{ color: T.yellow }}>never be bought</b> — the only way to get them is to earn them.
          </div>
          {SEASON_REWARDS.map((rw) => (
            <div key={rw.place} style={{ display: "flex", gap: 14, padding: "14px 4px",
              borderBottom: rw.place < 3 ? `2px solid ${INK}` : "none" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 66 }}>
                <FramedAvatar id={rw.avatar} size={48} frame={rw.frame} />
                <div style={{ fontSize: 11, fontWeight: 700, color: rw.color }}>#{rw.place} {rw.label}</div>
              </div>
              <div style={{ flex: 1 }}>
                {rw.perks.map((per) => (
                  <div key={per} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 13 }}>
                    <Icon name="check" size={13} color={rw.color} strokeWidth={2.6} />
                    <span style={{ color: T.sub }}>{per}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ background: T.card2, border: `${T.bw} solid ${INK}`, borderRadius: 16,
            padding: "12px 14px", marginTop: 14, color: T.sub, fontSize: 12.5, lineHeight: 1.7 }}>
            Season resets on the 1st of each month. Points go to zero, but your unlocked cosmetics are yours to keep.
          </div>
          <div style={{ height: 14 }} />
          <BigButton color={T.yellow} onClick={() => setRewardsOpen(false)}>Got it</BigButton>
        </Sheet>
      )}

      {/* Help / scoring sheet */}
      {helpOpen && (
        <Sheet onClose={() => setHelpOpen(false)} label="How scoring works">
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.display, marginBottom: 4 }}>How points are scored</div>
          <div style={{ color: T.sub, fontSize: 13, marginBottom: 12 }}>Same rules for everyone, every day</div>
          <PointsGuide />
          <div style={{ height: 16 }} />
          <BigButton onClick={() => setHelpOpen(false)}>Got it</BigButton>
        </Sheet>
      )}

      {/* How duels work — the plain-player explainer */}
      {duelHelpOpen && (
        <Sheet onClose={closeDuelHelp} label="How duels work">
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.display, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="swords" size={20} color={T.red} />How duels work
          </div>
          <div style={{ color: T.sub, fontSize: 13, marginBottom: 12 }}>Stake points, out-play a real rival, take the win</div>
          <DuelGuide />
          <div style={{ height: 16 }} />
          <BigButton color={T.red} onClick={closeDuelHelp}>Got it</BigButton>
        </Sheet>
      )}

      {/* Avatar picker (from profile) */}
      {avatarPickerOpen && (
        <Sheet onClose={() => setAvatarPickerOpen(false)} label="Choose avatar">
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.display, marginBottom: 4 }}>Choose your look</div>
          <div style={{ color: T.sub, fontSize: 13, marginBottom: 16 }}>Tap an icon to equip it. Buy more in the Shop.</div>

          {/* Big live preview of the current selection */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 20,
            padding: "18px 0", background: T.card,
            borderRadius: 20, border: `${T.bw} solid ${INK}` }}>
            {equippedFrameId
              ? <FramedAvatar id={avatar} size={128} frame={equippedFrameId} />
              : <Avatar id={avatar} size={128} />}
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.display }}>{username}</div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: T.sub, letterSpacing: 0.3, marginBottom: 10 }}>ICON</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
            {avatarOptions.map((a) => (
              <button key={a} className="pressable" aria-label={`Select avatar ${a}`} onClick={() => chooseAvatar(a)}
                style={{ padding: 7, borderRadius: 16, cursor: "pointer", display: "flex", justifyContent: "center",
                  boxSizing: "border-box", width: "100%", minWidth: 0, aspectRatio: "1",
                  border: `${T.bw} solid ${INK}`, boxShadow: avatar === a ? T.shadowMd : T.shadowSm,
                  background: avatar === a ? T.yellow : T.card }}>
                <Avatar id={a} size={54} />
              </button>
            ))}
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: T.sub, letterSpacing: 0.3, marginBottom: 10 }}>FRAME</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 8 }}>
            <button className="pressable" onClick={() => equipOwned(null, "frame")}
              style={{ padding: 6, borderRadius: 16, cursor: "pointer", background: T.card, boxSizing: "border-box",
                border: `${T.bw} solid ${INK}`, boxShadow: !equippedFrameId ? T.shadowMd : T.shadowSm, display: "flex", flexDirection: "column",
                alignItems: "center", gap: 4, width: "100%" }}>
              <Avatar id={avatar} size={44} />
              <span style={{ fontSize: 11, color: T.sub }}>None</span>
            </button>
            {SHOP_ITEMS.filter((it) => it.type === "frame" && owned.includes(it.id)).map((it) => (
              <button key={it.id} className="pressable" aria-label={`Equip frame ${it.name}`} onClick={() => equipOwned(it.id)}
                style={{ padding: 6, borderRadius: 16, cursor: "pointer", background: T.card, boxSizing: "border-box",
                  border: `${T.bw} solid ${INK}`, boxShadow: equippedFrame === it.id ? T.shadowMd : T.shadowSm, display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 4, width: "100%" }}>
                <FramedAvatar id={avatar} size={40} frame={it.frame} />
                <span style={{ fontSize: 11, color: T.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{it.name}</span>
              </button>
            ))}
          </div>
          {SHOP_ITEMS.filter((it) => it.type === "frame" && owned.includes(it.id)).length === 0 && (
            <div style={{ color: T.sub2, fontSize: 12, marginBottom: 8 }}>No frames yet — unlock them in the Shop or by finishing top 3 this season.</div>
          )}
          <div style={{ height: 14 }} />
          <BigButton onClick={() => setAvatarPickerOpen(false)}>Done</BigButton>
        </Sheet>
      )}

      {/* Settings sheet */}
      {settingsOpen && (
        <Sheet onClose={() => { setSettingsOpen(false); setConfirmDelete(false); setDeleteErr(null); }} label="Settings">
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.display, marginBottom: 16 }}>Settings</div>
          {hasSupabase && authUser && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.sub, letterSpacing: 0.3, marginBottom: 8 }}>ACCOUNT</div>
              <div style={{ ...sticker(T.card, T.shadowSm), borderRadius: 16, padding: "14px 15px", marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: INK }}>
                      {authUser.is_anonymous ? "Guest account" : "Account secured"}
                    </div>
                    <div style={{ color: T.sub, fontSize: 11.5, fontWeight: 700, marginTop: 2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {authUser.is_anonymous
                        ? "Protect your progress before changing devices."
                        : authUser.email || "Connected account"}
                    </div>
                  </div>
                  <span style={{ flexShrink: 0, border: `2px solid ${INK}`, borderRadius: 999,
                    padding: "5px 8px", background: authUser.is_anonymous ? T.yellow : T.green,
                    color: INK, fontSize: 10, fontWeight: 900 }}>
                    {authUser.is_anonymous ? "GUEST" : "VERIFIED"}
                  </span>
                </div>
                {authUser.is_anonymous ? (
                  <BigButton color={T.card2} onClick={connectGoogleAccount} disabled={accountBusy}
                    style={{ marginTop: 13, boxShadow: "none", padding: "11px 0", fontSize: 13 }}>
                    {accountBusy ? "Connecting…" : "Secure with Google"}
                  </BigButton>
                ) : (
                  <button type="button" onClick={runSignOut} disabled={accountBusy}
                    style={{ width: "100%", border: 0, borderTop: `2px solid ${T.card2}`, background: "transparent",
                      color: T.sub, cursor: accountBusy ? "wait" : "pointer", padding: "12px 2px 0", marginTop: 12,
                      fontFamily: T.font, fontWeight: 800, fontSize: 12.5 }}>
                    {accountBusy ? "Signing out…" : "Sign out"}
                  </button>
                )}
              </div>
            </>
          )}
          <div style={{ fontSize: 13, fontWeight: 700, color: T.sub, letterSpacing: 0.3, marginBottom: 8 }}>AVATAR</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 18 }}>
            {avatarOptions.map((a) => (
              <button key={a} className="pressable" aria-label={`Select avatar ${a}`} onClick={() => chooseAvatar(a)}
                style={{ padding: 7, borderRadius: 16, cursor: "pointer", display: "flex", justifyContent: "center",
                  border: `${T.bw} solid ${INK}`, boxShadow: avatar === a ? T.shadowMd : T.shadowSm,
                  background: avatar === a ? T.yellow : T.card }}>
                <Avatar id={a} size={54} />
              </button>
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.sub, letterSpacing: 0.3, marginBottom: 8 }}>USERNAME</div>
          <input aria-label="Username" value={username} onChange={(e) => setUsername(e.target.value.slice(0, 16))} autoComplete="off"
            style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: `${T.bw} solid ${INK}`,
              background: T.card, color: INK, fontSize: 16, fontFamily: T.font, outline: "none",
              marginBottom: 18, boxSizing: "border-box" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            background: T.card, border: `${T.bw} solid ${INK}`, borderRadius: 16, padding: "14px 16px", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="sound" size={17} color={INK} strokeWidth={2.1} /> Sounds</div>
              <div style={{ color: T.sub, fontSize: 12 }}>Sound effects in games</div>
            </div>
            <Switch label="Sound effects" on={soundOn} toggle={() => { const v = !soundOn; setSoundOn(v); Sound.on = v; if (v) Sound.beep(880, 0.08); }} />
          </div>
          {!hasSupabase && (
            <BigButton color={T.card2} style={{ boxShadow: "none", border: `${T.bw} solid ${INK}`, marginBottom: 12 }}
              onClick={() => { setPlayedGames({}); setBonusPts(0); setRewardClaimed(false); setChallengesUsed(0); setAdDuels(0); setSettingsOpen(false); showToast("Day reset (demo)"); }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Icon name="refresh" size={17} color={INK} strokeWidth={2.2} /> Reset day (demo)</span>
            </BigButton>
          )}

          {/* Danger zone — GDPR erasure. Only shown with a real backend (there is no
              account to delete on the offline BOTS path). A single tap opens a
              confirm sub-state; deletion only fires on the explicit second tap. */}
          {hasSupabase && (
            <div style={{ marginTop: 10, marginBottom: 4, paddingTop: 16, borderTop: `${T.bw} solid ${T.card2}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.red, letterSpacing: 0.3, marginBottom: 8 }}>DANGER ZONE</div>
              {!confirmDelete ? (
                <BigButton color={T.red} onClick={() => { setDeleteErr(null); setConfirmDelete(true); Sound.beep(200, 0.1); }}>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <Icon name="skull" size={17} color={inkOn(T.red)} strokeWidth={2.2} /> Delete my account
                  </span>
                </BigButton>
              ) : (
                <div style={{ ...sticker(T.card, T.shadowSm), borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: INK, lineHeight: 1.4, marginBottom: 12 }}>
                    Are you sure? This permanently deletes your account, nickname and scores. This cannot be undone.
                  </div>
                  {deleteErr && (
                    <div style={{ ...sticker(T.red, T.shadowSm), borderRadius: 10, padding: "9px 13px", marginBottom: 12,
                      color: inkOn(T.red), fontSize: 12.5, fontWeight: 800, lineHeight: 1.35 }}>
                      {deleteErr}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10 }}>
                    <BigButton color={T.card2} style={{ boxShadow: "none", border: `${T.bw} solid ${INK}` }}
                      onClick={() => { if (!deleting) { setConfirmDelete(false); setDeleteErr(null); } }}>
                      Cancel
                    </BigButton>
                    <BigButton color={T.red} onClick={runDeleteAccount}>
                      {deleting ? "Deleting…" : "Delete forever"}
                    </BigButton>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ color: T.sub2, fontSize: 12, textAlign: "center", marginTop: 14 }}>Skill Duels · v3.0 prototype</div>
        </Sheet>
      )}

      {/* Navigation menu sheet — opened from the orb */}
      {menuOpen && !inGame && (
        <NavSheet sections={SECTIONS} tab={tab} onGo={(id) => { setTab(id); setMenuOpen(false); }}
          onClose={() => setMenuOpen(false)} />
      )}

      {/* Floating orb nav — one thumb-reachable target instead of a five-way tab bar.
          It steps aside while the sheet is open: the sheet has its own close button,
          a backdrop tap and swipe-down, and the orb was sitting on top of the last
          section tile. */}
      {!inGame && (
        <button onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen}
          style={{ position: "absolute", left: "50%", bottom: 26, zIndex: 48,
            transform: `translateX(-50%) scale(${menuOpen ? 0.7 : 1})`,
            opacity: menuOpen ? 0 : 1, pointerEvents: menuOpen ? "none" : "auto",
            transition: "opacity 180ms ease, transform 180ms cubic-bezier(.22,1,.36,1)",
            width: 64, height: 64, borderRadius: "50%", border: `3px solid ${INK}`, cursor: "pointer",
            background: INK,
            // The cream ring is load-bearing: an ink button over an ink drop shadow
            // merges into one 64x70 blob and reads as an oval, not a circle.
            boxShadow: `0 0 0 3px ${T.bg}, 0 7px 0 ${INK}, 0 12px 22px rgba(0,0,0,0.28)`,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="menu" size={26} color={T.yellow} strokeWidth={2.4} />
        </button>
      )}
    </>
  );
}
