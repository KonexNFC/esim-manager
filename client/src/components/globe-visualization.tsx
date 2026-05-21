import { useEffect, useRef } from "react";

const CITIES = [
  { name: "London",       lat: 51.5,  lng: -0.1  },
  { name: "New York",     lat: 40.7,  lng: -74.0 },
  { name: "Dubai",        lat: 25.2,  lng:  55.3 },
  { name: "Tokyo",        lat: 35.7,  lng: 139.7 },
  { name: "Sydney",       lat: -33.9, lng: 151.2 },
  { name: "Paris",        lat: 48.9,  lng:   2.3 },
  { name: "Singapore",    lat:  1.3,  lng: 103.8 },
  { name: "Lagos",        lat:  6.5,  lng:   3.4 },
  { name: "São Paulo",    lat: -23.5, lng: -46.6 },
  { name: "Los Angeles",  lat: 34.1,  lng:-118.2 },
  { name: "Toronto",      lat: 43.7,  lng: -79.4 },
  { name: "Mumbai",       lat: 19.1,  lng:  72.9 },
  { name: "Cape Town",    lat: -33.9, lng:  18.4 },
  { name: "Bangkok",      lat: 13.8,  lng: 100.5 },
  { name: "Amsterdam",    lat: 52.4,  lng:   4.9 },
  { name: "Seoul",        lat: 37.6,  lng: 127.0 },
  { name: "Cairo",        lat: 30.1,  lng:  31.2 },
  { name: "Mexico City",  lat: 19.4,  lng: -99.1 },
  { name: "Johannesburg", lat: -26.2, lng:  28.0 },
  { name: "Istanbul",     lat: 41.0,  lng:  28.9 },
];

const CONNECTIONS = [
  [0,  1], [0,  2], [0,  5], [0, 14],
  [1,  6], [1,  8], [1,  9], [1, 10],
  [2,  3], [2,  7], [2, 11], [2, 16],
  [3,  6], [3, 13], [3, 15],
  [4,  6], [5,  2],
  [7, 18], [8,  1], [9,  1],
  [12, 16],[17,  1],[18, 12],[19,  2],
];

function toRad(d: number) { return (d * Math.PI) / 180; }

function project(
  lat: number, lng: number,
  rot: number, cx: number, cy: number, R: number,
) {
  const phi = toRad(lat);
  const lam = toRad(lng) + rot;
  const x = Math.cos(phi) * Math.sin(lam);
  const y = -Math.sin(phi);
  const z = Math.cos(phi) * Math.cos(lam);
  return { x: cx + R * x, y: cy + R * y, z };
}

export function GlobeVisualization() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap   = containerRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0, H = 0, dpr = 1;
    let rot  = 0;
    let time = 0;
    let raf  = 0;

    const pkts = CONNECTIONS.map((_, i) => ({
      t:     Math.random(),
      speed: 0.0022 + Math.random() * 0.003,
      on:    i % 3 !== 0,
    }));

    const dark = () => document.documentElement.classList.contains("dark");

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      const r = wrap.getBoundingClientRect();
      W = r.width;
      H = r.height;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
    };

    const draw = () => {
      if (!W || !H) { raf = requestAnimationFrame(draw); return; }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const d  = dark();
      const cx = W / 2;
      const cy = H / 2;
      const R  = Math.min(W, H) * 0.38;

      // ── Sphere ─────────────────────────────────────────────────────────────────
      const sg = ctx.createRadialGradient(cx - R * 0.28, cy - R * 0.3, R * 0.04, cx, cy, R);
      if (d) {
        sg.addColorStop(0,   "#1a2748");
        sg.addColorStop(0.55,"#0c1628");
        sg.addColorStop(1,   "#040c18");
      } else {
        sg.addColorStop(0,   "#dde8ff");
        sg.addColorStop(0.55,"#b8cfff");
        sg.addColorStop(1,   "#8aaff0");
      }
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = sg;
      ctx.fill();

      // ── Grid lines (clipped inside sphere) ─────────────────────────────────────
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R - 0.5, 0, Math.PI * 2);
      ctx.clip();

      ctx.lineWidth   = 0.5;
      ctx.strokeStyle = d ? "rgba(79,130,230,0.11)" : "rgba(59,130,246,0.11)";

      for (let lat = -75; lat <= 75; lat += 25) {
        ctx.beginPath();
        let go = false;
        for (let lng = -180; lng <= 180; lng += 3) {
          const p = project(lat, lng, rot, cx, cy, R);
          if (p.z > -0.2) {
            go ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
            go = true;
          } else go = false;
        }
        ctx.stroke();
      }
      for (let lng = -180; lng < 180; lng += 25) {
        ctx.beginPath();
        let go = false;
        for (let lat = -90; lat <= 90; lat += 3) {
          const p = project(lat, lng, rot, cx, cy, R);
          if (p.z > -0.2) {
            go ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
            go = true;
          } else go = false;
        }
        ctx.stroke();
      }
      ctx.restore();

      // ── Project cities ─────────────────────────────────────────────────────────
      const pts = CITIES.map(c => project(c.lat, c.lng, rot, cx, cy, R));

      // ── Connection arcs + packets ──────────────────────────────────────────────
      CONNECTIONS.forEach(([i, j], idx) => {
        const a = pts[i];
        const b = pts[j];
        const vis = Math.min(1, (a.z + 0.4) / 0.6) * Math.min(1, (b.z + 0.4) / 0.6);
        if (vis < 0.05) return;

        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = mx - cx, dy = my - cy;
        const dm = Math.sqrt(dx * dx + dy * dy) || 1;
        const lift = R * (0.22 + (dm / R) * 0.32);
        const cpx = mx + (dx / dm) * lift;
        const cpy = my + (dy / dm) * lift;

        // Arc
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cpx, cpy, b.x, b.y);
        ctx.lineWidth   = 0.8;
        ctx.strokeStyle = d
          ? `rgba(99,179,255,${vis * 0.32})`
          : `rgba(37,99,235,${vis * 0.28})`;
        ctx.stroke();

        // Packet
        const pk = pkts[idx];
        if (pk.on) {
          const t  = pk.t, t1 = 1 - t;
          const px = t1*t1*a.x + 2*t1*t*cpx + t*t*b.x;
          const py = t1*t1*a.y + 2*t1*t*cpy + t*t*b.y;

          const halo = ctx.createRadialGradient(px, py, 0, px, py, 8);
          if (d) {
            halo.addColorStop(0, `rgba(130,215,255,${vis * 0.65})`);
            halo.addColorStop(1, "rgba(130,215,255,0)");
          } else {
            halo.addColorStop(0, `rgba(37,99,235,${vis * 0.45})`);
            halo.addColorStop(1, "rgba(37,99,235,0)");
          }
          ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2);
          ctx.fillStyle = halo; ctx.fill();

          ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = d
            ? `rgba(200,238,255,${vis})`
            : `rgba(37,99,235,${vis})`;
          ctx.fill();
        }

        pk.t += pk.speed;
        if (pk.t > 1) { pk.t = 0; pk.on = Math.random() > 0.12; }
      });

      // ── City nodes ─────────────────────────────────────────────────────────────
      pts.forEach((p, i) => {
        if (p.z < -0.12) return;
        const alpha = Math.min(1, (p.z + 0.12) / 0.38);
        const pulse = 0.5 + 0.5 * Math.sin(time * 1.8 + i * 0.85);

        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10);
        if (d) {
          halo.addColorStop(0, `rgba(100,200,255,${alpha * 0.52 * pulse})`);
          halo.addColorStop(1, "rgba(100,200,255,0)");
        } else {
          halo.addColorStop(0, `rgba(59,130,246,${alpha * 0.32 * pulse})`);
          halo.addColorStop(1, "rgba(59,130,246,0)");
        }
        ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = halo; ctx.fill();

        ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = d
          ? `rgba(155,225,255,${alpha})`
          : `rgba(37,99,235,${alpha})`;
        ctx.fill();

        ctx.beginPath(); ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.88})`;
        ctx.fill();
      });

      // ── Specular highlight ─────────────────────────────────────────────────────
      const hl = ctx.createRadialGradient(
        cx - R * 0.28, cy - R * 0.3, 0,
        cx - R * 0.28, cy - R * 0.3, R * 0.7,
      );
      hl.addColorStop(0, d ? "rgba(110,165,255,0.07)" : "rgba(255,255,255,0.22)");
      hl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = hl; ctx.fill();

      // ── Atmospheric rim ────────────────────────────────────────────────────────
      const rim = ctx.createRadialGradient(cx, cy, R * 0.86, cx, cy, R * 1.18);
      if (d) {
        rim.addColorStop(0,   "rgba(59,130,246,0)");
        rim.addColorStop(0.55,"rgba(59,130,246,0.10)");
        rim.addColorStop(1,   "rgba(99,179,237,0.24)");
      } else {
        rim.addColorStop(0,   "rgba(59,130,246,0)");
        rim.addColorStop(0.55,"rgba(59,130,246,0.05)");
        rim.addColorStop(1,   "rgba(99,179,237,0.14)");
      }
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.16, 0, Math.PI * 2);
      ctx.fillStyle = rim; ctx.fill();

      rot  += 0.0022;
      time += 0.016;
      raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} />
    </div>
  );
}
