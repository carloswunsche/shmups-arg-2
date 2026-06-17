import Particle from "../entities/particle.js";

function explosionColor(speed) {
  if (speed > 1.5) return '#ffe';
  if (speed > 1.1) return '#fe0';
  if (speed > 0.7) return '#e90';
  if (speed > 0.4) return '#d50';
  return '#a10';
}

export function spawnExplosion(x, y, count, opts) {
  const arr = [];
  const speedBase = opts?.speedBase ?? 0.8;
  const speedRange = opts?.speedRange ?? 1.7;
  const sizeBase = opts?.sizeBase ?? 1;
  const sizeRange = opts?.sizeRange ?? 1.5;
  const spread = opts?.spread ?? 0;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = speedBase + Math.random() * speedRange;
    const size = sizeBase + Math.random() * sizeRange;
    const offX = spread > 0 ? (Math.random() - 0.5) * spread : 0;
    const offY = spread > 0 ? (Math.random() - 0.5) * spread : 0;
    arr.push(['Particle', {
      x: x + offX, y: y + offY,
      vx: Math.cos(angle) * speed,
      vy: -Math.sin(angle) * speed,
      scale: size,
      color: explosionColor(speed),
      opacityDecay: opts?.opacityDecay ?? 6,
    }]);
  }
  return arr;
}

export function spawnBang(x, y, size, emberCount, emberOpts) {
  const arr = [];
  const speedMin = emberOpts?.speedMin ?? 0.3;
  const speedMax = emberOpts?.speedMax ?? 1.5;
  const scaleMin = emberOpts?.scaleMin ?? 1.2;
  const scaleMax = emberOpts?.scaleMax ?? 1.5;
  const opacityDecay = emberOpts?.opacityDecay ?? 7;
  const palette = emberOpts?.palette;
  const pickColor = (speed) => palette ? palette[Math.floor(Math.random() * palette.length)] : explosionColor(speed);
  for (let i = 0; i < emberCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    arr.push(['Particle', {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: -Math.sin(angle) * speed,
      scale: scaleMin + Math.random() * (scaleMax - scaleMin),
      color: pickColor(speed),
      opacityDecay,
    }]);
  }
  const flashSize = Math.max(size || 8, 6) * 0.25;
  const flashCycle = emberOpts?.flashCycle ?? ['#fff', '#fe0', '#e90'];
  for (let i = 0; i < 4; i++) {
    arr.push(['Particle', {
      x: x + (Math.random() - 0.5) * flashSize,
      y: y + (Math.random() - 0.5) * flashSize,
      vx: 0,
      vy: 0,
      scale: flashSize * (0.8 + Math.random() * 0.4),
      color: '#fff',
      colorCycle: flashCycle,
      opacityDecay: 60,
    }]);
  }
  return arr;
}

export function spawnSpark(x, y) {
  return [
    ['Particle', {
      x, y,
      vx: (Math.random() - 0.5) * 3,
      vy: -(1 + Math.random() * 2),
      scale: 1,
      color: '#fff',
      opacityDecay: 20,
    }],
  ];
}