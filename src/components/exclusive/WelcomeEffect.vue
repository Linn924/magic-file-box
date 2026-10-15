<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const host = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const title = ref(false);
const visible = ref(true);
const KEY = "mfb-exclusive-intro-v1";
let raf = 0;
let disposed = false;
let timer:ReturnType<typeof setTimeout>|undefined;
let removeResize:(()=>void)|undefined;
function release(){cancelAnimationFrame(raf);clearTimeout(timer);removeResize?.();removeResize=undefined;}
function finishIntro(){release();title.value=false;visible.value=false;}

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: string;
  s: number;
};

function spawnBurst(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ps: P[],
  fx: number,
  fy: number,
) {
  void ctx;
  const n = 14 + Math.floor(Math.random() * 8);
  const hue = 195 + Math.random() * 70;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    const sp = 0.75 + Math.random() * 1.35;
    ps.push({
      x: w * fx,
      y: h * fy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0,
      max: 50 + Math.random() * 22,
      c: `hsla(${hue + i * 2}, 72%, 63%, 0.92)`,
      s: 1.1 + Math.random(),
    });
  }
}

/** Avoid the center drop-zone band; keep bursts in upper + side margins. */
const BURST_SPOTS: Array<[number, number]> = [
  [0.12, 0.16],
  [0.28, 0.1],
  [0.72, 0.1],
  [0.88, 0.18],
  [0.18, 0.28],
  [0.82, 0.26],
  [0.5, 0.08],
  [0.08, 0.38],
  [0.92, 0.36],
];

function runIntro() {
  const c = canvas.value;
  const root = host.value;
  if (!c || !root) return;
  if(matchMedia("(prefers-reduced-motion: reduce)").matches){title.value=true;timer=setTimeout(finishIntro,2800);return;}
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const resize = () => {
    c.width = Math.floor(root.clientWidth * dpr);
    c.height = Math.floor(root.clientHeight * dpr);
    c.style.width = root.clientWidth + "px";
    c.style.height = root.clientHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);
  removeResize=()=>window.removeEventListener("resize",resize);
  timer=setTimeout(finishIntro,6000);
  title.value = true;
  const ps: P[] = [];
  let frame = 0;
  const tick = () => {
    if (disposed) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    ctx.clearRect(0, 0, w, h);
    // Multi-spot bursts around the drop zone (not under the center box).
    if (frame < 240) {
      if (frame % 28 === 0) {
        const spot = BURST_SPOTS[frame / 28 % BURST_SPOTS.length];
        spawnBurst(ctx, w, h, ps, spot[0], spot[1]);
      }
      if (frame % 70 === 0) {
        const spot = BURST_SPOTS[(frame / 70 + 3) % BURST_SPOTS.length];
        spawnBurst(ctx, w, h, ps, spot[0], spot[1]);
      }
    }
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.012;
      p.vx *= 0.99;
      p.life++;
      const a = 1 - p.life / p.max;
      if (a <= 0) {
        ps.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    frame++;
    if (frame < 320) raf = requestAnimationFrame(tick);
    else {
      finishIntro();
    }
  };
  raf = requestAnimationFrame(tick);
}

onMounted(() => {
  if (!host.value) return;
  try {
    if (localStorage.getItem(KEY)){visible.value=false;return;}
    localStorage.setItem(KEY, "1");
  } catch {
    /* still play once this session */
  }
  runIntro();
});
onBeforeUnmount(() => {
  disposed = true;
  release();
});
</script>
<template>
  <div v-if="visible" ref="host" class="home-intro" aria-hidden="true">
    <canvas ref="canvas" class="home-intro-canvas"></canvas>
    <p v-if="title" class="home-intro-title">小乖专属软件</p>
  </div>
</template>

<style scoped>
.home-intro {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}

.home-intro-canvas {
  position: absolute;
  inset: 0;
}

.home-intro-title {
  position: absolute;
  left: 0;
  right: 0;
  top: 12%;
  text-align: center;
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--text);
  z-index: 3;
  text-shadow: 0 1px 0 color-mix(in srgb, var(--panel) 80%, transparent);
  opacity: 0;
  animation: intro-fade 2.8s ease forwards;
}

@keyframes intro-fade {
  0% {
    opacity: 0;
    transform: translateY(6px);
  }
  18% {
    opacity: 1;
    transform: none;
  }
  78% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-intro-title {
    animation: none;
    opacity: 1;
  }
  .home-intro-canvas {
    display: none;
  }
}


</style>
