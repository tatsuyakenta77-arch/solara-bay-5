// Meridian Heat — synthesized sound.
// One clear job: every sound is generated with WebAudio, no audio files.
// Engine hum, siren, gunshot, melee thud, pickups and jingles.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.noiseBuf = null;
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // Engine: sawtooth through a lowpass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    // Siren: triangle wave alternating two tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.ctx.destination);
    this.sirenOsc.start();
  }

  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.ctx.destination.gain ? null : null;
    if (this.engineGain) this.engineGain.gain.value = m ? 0 : this._engineLevel;
    if (this.sirenGain) this.sirenGain.gain.value = m ? 0 : (this._sirenOn ? 0.05 : 0);
  }

  setEngine(level, speed01) {
    if (!this.ctx || this.muted) return;
    this._engineLevel = level;
    this.engineGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, this.ctx.currentTime, 0.08);
    this.engineFilter.frequency.setTargetAtTime(380 + speed01 * 900, this.ctx.currentTime, 0.1);
  }

  engineOff() {
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  siren(on) {
    if (!this.ctx) return;
    this._sirenOn = on;
    if (on && !this.sirenTimer) {
      let hi = false;
      this.sirenTimer = setInterval(() => {
        if (this.muted) return;
        hi = !hi;
        this.sirenOsc.frequency.setTargetAtTime(hi ? 960 : 660, this.ctx.currentTime, 0.03);
        this.sirenGain.gain.setTargetAtTime(0.045, this.ctx.currentTime, 0.05);
      }, 420);
    } else if (!on && this.sirenTimer) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
  }

  _burst(dur, freq, gain, type = 'lowpass') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t); src.stop(t + dur);
  }

  _tone(freq, dur, gain, type = 'sine', slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur);
  }

  shot() { this._burst(0.16, 2400, 0.5, 'highpass'); this._tone(160, 0.1, 0.3, 'square', 60); }
  enemyShot() { this._burst(0.14, 1800, 0.25, 'highpass'); }
  melee() { this._tone(120, 0.12, 0.4, 'sine', 55); }
  hit() { this._tone(220, 0.08, 0.3, 'square', 140); }
  crash() { this._burst(0.3, 700, 0.5); }
  pickup() { this._tone(660, 0.09, 0.25); setTimeout(() => this._tone(990, 0.12, 0.25), 90); }
  jingle() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 0.28, 'triangle'), i * 110));
  }
  busted() { [392, 330, 262].forEach((f, i) => setTimeout(() => this._tone(f, 0.3, 0.3, 'sawtooth'), i * 160)); }
  click() { this._tone(880, 0.05, 0.18, 'square'); }
  horn() { this._tone(370, 0.35, 0.22, 'sawtooth', 350); }
}
