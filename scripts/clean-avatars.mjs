import { readFileSync, writeFileSync } from "fs";
import { PNG } from "pngjs";

const FILE = "C:/Users/taz-a/Downloads/skillduels-app/skillduels-app/src/App.jsx";
const A = 40;          // alpha threshold for "opaque"
const OUT = 112;       // output square size
const MARGIN = 0.08;   // transparent margin each side → content ≈ 84%

function clean(buf) {
  const png = PNG.sync.read(buf);
  const { width: W, height: H, data } = png;
  const N = W * H;
  const opaque = new Uint8Array(N);
  let totalOpaque = 0;
  for (let i = 0; i < N; i++) if (data[i * 4 + 3] > A) { opaque[i] = 1; totalOpaque++; }
  if (!totalOpaque) return null;

  // connected components (8-connectivity)
  const label = new Int32Array(N).fill(-1);
  const comps = [];
  const stack = [];
  const dirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  for (let s = 0; s < N; s++) {
    if (!opaque[s] || label[s] !== -1) continue;
    const id = comps.length;
    let size = 0, miny = H, maxy = 0;
    stack.push(s); label[s] = id;
    while (stack.length) {
      const p = stack.pop();
      const px = p % W, py = (p / W) | 0;
      size++;
      if (py < miny) miny = py; if (py > maxy) maxy = py;
      for (const [dx, dy] of dirs) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (opaque[q] && label[q] === -1) { label[q] = id; stack.push(q); }
      }
    }
    comps.push({ id, size, miny, maxy });
  }
  const maxSize = Math.max(...comps.map((c) => c.size));

  // erase sprite-sheet bleed: disconnected components that live ONLY in the
  // extreme top or bottom 13% band (neighbour art). The character occupies the
  // centre; scattered sparkles aren't confined to those bands.
  const topBand = H * 0.13, botBand = H * 0.87;
  const remove = new Set();
  for (const c of comps) {
    if (c.size === maxSize) continue;                 // never the main body
    if (c.size > maxSize * 0.45) continue;            // safety: never a huge part
    if (c.maxy <= topBand || c.miny >= botBand) remove.add(c.id);
  }
  let removedPx = 0;
  if (remove.size) for (let i = 0; i < N; i++) if (opaque[i] && remove.has(label[i])) { data[i * 4 + 3] = 0; opaque[i] = 0; removedPx++; }

  // bbox of remaining content
  let minx = W, miny = H, maxx = 0, maxy = 0, remain = 0;
  for (let i = 0; i < N; i++) if (opaque[i]) { remain++; const px = i % W, py = (i / W) | 0; if (px < minx) minx = px; if (px > maxx) maxx = px; if (py < miny) miny = py; if (py > maxy) maxy = py; }
  if (!remain) return null;
  const bw = maxx - minx + 1, bh = maxy - miny + 1;

  // scale content into OUT with margin (nearest-neighbor → crisp pixel art)
  let scale = (OUT * (1 - 2 * MARGIN)) / Math.max(bw, bh);
  scale = Math.min(scale, 2.4);
  const offX = (OUT - bw * scale) / 2, offY = (OUT - bh * scale) / 2;
  const out = new PNG({ width: OUT, height: OUT });
  out.data.fill(0);
  for (let oy = 0; oy < OUT; oy++) for (let ox = 0; ox < OUT; ox++) {
    const sx = Math.floor((ox - offX) / scale) + minx;
    const sy = Math.floor((oy - offY) / scale) + miny;
    if (sx < minx || sx > maxx || sy < miny || sy > maxy) continue;
    const si = (sy * W + sx) * 4;
    if (data[si + 3] <= A) continue;
    const oi = (oy * OUT + ox) * 4;
    out.data[oi] = data[si]; out.data[oi + 1] = data[si + 1]; out.data[oi + 2] = data[si + 2]; out.data[oi + 3] = data[si + 3];
  }
  return { buf: PNG.sync.write(out), removedPx, bw, bh, scale: +scale.toFixed(2) };
}

let src = readFileSync(FILE, "utf8");
const re = /data:image\/png;base64,([A-Za-z0-9+/=]+)/g;
let m, count = 0, changed = 0;
const log = [], reps = [];
while ((m = re.exec(src))) {
  count++;
  try {
    const res = clean(Buffer.from(m[1], "base64"));
    if (!res) { log.push(`#${count}: empty, skipped`); continue; }
    reps.push({ from: m[0], to: "data:image/png;base64," + res.buf.toString("base64") });
    changed++;
    log.push(`#${count}: specks -${res.removedPx}px, bbox ${res.bw}x${res.bh}, scale ${res.scale}`);
  } catch (e) { log.push(`#${count}: ERROR ${e.message}`); }
}
for (const r of reps) src = src.replace(r.from, () => r.to);
writeFileSync(FILE, src);
console.log(`processed ${count}, rewrote ${changed}\n` + log.join("\n"));
