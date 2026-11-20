// Meridian Heat — HUD and minimap.
// One clear job: keep the DOM readouts and the circular minimap in sync
// with the live game state.
import { WORLD } from './config.js';

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.cash = this.el('cash');
    this.clock = this.el('clock');
    this.wanted = this.el('wanted');
    this.objTitle = this.el('objTitle');
    this.objText = this.el('objText');
    this.healthFill = this.el('healthFill');
    this.healthText = this.el('healthText');
    this.ammoText = this.el('ammoText');
    this.speedNum = this.el('speedNum');
    this.hint = this.el('hint');
    this.banner = this.el('banner');
    this.toast = this.el('toast');
    this.map = this.el('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.bannerTimer = null;
    this.toastTimer = null;
    this.stars = [];
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span');
      s.className = 'star';
      s.textContent = '★';
      this.wanted.appendChild(s);
      this.stars.push(s);
    }
  }

  show() { this.el('hud').classList.remove('hidden'); }
  hide() { this.el('hud').classList.add('hidden'); }

  setObjective(title, text) {
    this.objTitle.textContent = title;
    this.objText.textContent = text;
  }

  showBanner(text, ms = 2600) {
    this.banner.textContent = text;
    this.banner.classList.remove('hidden');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.banner.classList.add('hidden'), ms);
  }

  showToast(text, ms = 2600) {
    this.toast.textContent = text;
    this.toast.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.add('hidden'), ms);
  }

  update(s) {
    this.cash.textContent = '$' + Math.floor(s.cash).toLocaleString('en-US');
    const mins = Math.floor(s.clockMin % 1440);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    this.clock.textContent = `${hh}:${mm}`;
    for (let i = 0; i < 5; i++) this.stars[i].classList.toggle('lit', i < s.wanted);
    this.healthFill.style.width = Math.max(0, s.health) + '%';
    this.healthText.textContent = Math.ceil(Math.max(0, s.health)) + ' HP';
    this.ammoText.textContent = s.inCar ? '—' : `${s.mag} / ${s.reserve}`;
    this.speedNum.textContent = Math.round(Math.abs(s.speed) * 2.2);
    this.hint.textContent = s.hint || '';
    this.drawMinimap(s);
  }

  drawMinimap(s) {
    const ctx = this.mapCtx;
    const W = 220, R = 110;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.clip();
    const scale = W / 560; // world -280..280 maps onto the disc
    const toMap = (x, z) => [R + x * scale, R + z * scale];
    // Water.
    ctx.fillStyle = '#16394d';
    ctx.fillRect(0, 0, W, W);
    // Land.
    ctx.fillStyle = '#3d4450';
    const [lx, lz] = toMap(-216, -216);
    ctx.fillRect(lx, lz, 432 * scale, 432 * scale);
    // Roads.
    ctx.strokeStyle = '#23272f';
    ctx.lineWidth = 7 * scale + 3;
    for (const r of WORLD.roads) {
      const [ax, ay] = toMap(-216, r);
      const [bx, by] = toMap(216, r);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      const [cx, cy] = toMap(r, -216);
      const [dx, dy] = toMap(r, 216);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(dx, dy); ctx.stroke();
    }
    const dot = (x, z, color, r) => {
      const [mx, my] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
    };
    if (s.target) {
      const pulse = 5 + Math.sin(performance.now() / 240) * 2;
      dot(s.target.x, s.target.z, '#ffd23e', pulse);
    }
    for (const e of s.enemies || []) dot(e.x, e.z, '#ff4444', 3);
    for (const p of s.police || []) dot(p.x, p.z, '#4488ff', 3.5);
    for (const t of s.traffic || []) dot(t.x, t.z, '#aaaaaa', 2);
    // Player arrow.
    const [px, py] = toMap(s.x, s.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(s.heading);
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', R, 16);
    ctx.restore();
  }
}
