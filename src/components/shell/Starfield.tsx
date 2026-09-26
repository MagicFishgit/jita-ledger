import { useEffect, useRef } from 'react';
import { takeWarp } from '../../lib/motion';
import type { Motion } from '../../lib/types';

/**
 * The drifting starfield behind everything. Drawn on a canvas in code: no image to load, and it
 * follows the motion setting --- still when motion is off, slow when calm.
 */
export function Starfield({ motion }: { motion: Motion }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const motionRef = useRef(motion);
  motionRef.current = motion;

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    let W = 0, H = 0, raf = 0;
    const resize = () => {
      const d = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W * d; cv.height = H * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.lineCap = 'round';
    };
    resize();
    window.addEventListener('resize', resize);
    const stars = Array.from({ length: 560 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() + 0.05, h: Math.random() }));
    let paused = document.hidden;
    const onVis = () => { paused = document.hidden; };
    document.addEventListener('visibilitychange', onVis);

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (paused) return;
      const m = motionRef.current;
      const warp = takeWarp();
      const base = m === 'Off' ? 0 : m === 'Calm' ? 0.00035 : 0.0009;
      const sp = base + (m === 'Off' ? 0 : warp * (m === 'Calm' ? 0.012 : 0.03));
      ctx.clearRect(0, 0, W, H);
      const cx = W * 0.6, cy = H * 0.42, fov = Math.max(W, H) * 0.32;
      for (const p of stars) {
        const pz = p.z;
        p.z -= sp;
        if (p.z <= 0.02) { p.x = Math.random() * 2 - 1; p.y = Math.random() * 2 - 1; p.z = 1.05; continue; }
        const sx = cx + (p.x / p.z) * fov, sy = cy + (p.y / p.z) * fov;
        const px = cx + (p.x / pz) * fov, py = cy + (p.y / pz) * fov;
        if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) { p.z = 1.05; continue; }
        const a = Math.min(1, (1.05 - p.z) * 1.2);
        ctx.strokeStyle = p.h > 0.9 ? `rgba(255,210,160,${a})` : p.h > 0.65 ? `rgba(150,215,255,${a})` : `rgba(225,236,250,${a * 0.8})`;
        ctx.lineWidth = Math.max(0.5, (1 - p.z) * 1.9);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(sx + 0.01, sy);
        ctx.stroke();
      }
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <canvas ref={ref} className="hud-stars" aria-hidden="true" />;
}
