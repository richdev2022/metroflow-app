const SOUND_CACHE: Record<string, AudioBuffer | 'failed'> = {};

const AUDIO_FILE_PATHS: Record<string, string> = {
  'message-sent': '/sounds/message-sent.mp3',
  'message-received': '/sounds/message-received.mp3',
  'ringtone': '/sounds/ringtone.mp3',
  'ringback': '/sounds/ringback.mp3',
};

export const AudioUtils = {
  audioContext: null as AudioContext | null,
  isInitialized: false,
  activeRingtoneStop: null as (() => void) | null,
  activeRingbackStop: null as (() => void) | null,
  audioFileFailed: false,

  async initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (err) {
        console.warn('Failed to resume audio context:', err);
      }
    }
    this.isInitialized = true;
    return this.audioContext;
  },

  async ensureInitialized() {
    if (!this.audioContext) {
      await this.initAudioContext();
    } else if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (err) {
        console.warn('Failed to resume audio context:', err);
      }
    }
    this.isInitialized = true;
  },

  async _loadAudioBuffer(key: string): Promise<AudioBuffer | null> {
    if (SOUND_CACHE[key] === 'failed') return null;
    if (SOUND_CACHE[key]) return SOUND_CACHE[key];

    const path = AUDIO_FILE_PATHS[key];
    if (!path || this.audioFileFailed) return null;

    try {
      const res = await fetch(path, { cache: 'force-cache' });
      if (!res.ok) {
        SOUND_CACHE[key] = 'failed';
        return null;
      }
      const arrayBuf = await res.arrayBuffer();
      await this.ensureInitialized();
      if (!this.audioContext) return null;
      const decoded = await this.audioContext.decodeAudioData(arrayBuf.slice(0));
      SOUND_CACHE[key] = decoded;
      return decoded;
    } catch {
      SOUND_CACHE[key] = 'failed';
      this.audioFileFailed = true;
      return null;
    }
  },

  _playBuffer(buffer: AudioBuffer, gainVal: number = 0.8, loop: boolean = false) {
    if (!this.audioContext) return null;
    const ctx = this.audioContext;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    src.loop = loop;
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(0);
    return { src, gain };
  },

  playTone(
    frequency: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume: number = 0.3,
    attack: number = 0.01,
    release: number = 0.1
  ) {
    if (!this.audioContext) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.setValueAtTime(volume, now + duration - release);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  },

  async playMessageSent() {
    await this.ensureInitialized();
    const buf = await this._loadAudioBuffer('message-sent');
    if (buf) {
      this._playBuffer(buf, 0.7);
      return;
    }
    const ctx = this.audioContext;
    if (!ctx) return;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.setValueAtTime(988, now);
    osc.frequency.exponentialRampToValueAtTime(1568, now + 0.05);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    osc.start(now);
    osc.stop(now + 0.16);
  },

  async playMessageReceived() {
    await this.ensureInitialized();
    const buf = await this._loadAudioBuffer('message-received');
    if (buf) {
      this._playBuffer(buf, 0.8);
      return;
    }
    const ctx = this.audioContext;
    if (!ctx) return;

    const now = ctx.currentTime;

    const notes = [
      { f: 784, t: 0, d: 0.07 },
      { f: 1047, t: 0.07, d: 0.07 },
      { f: 1319, t: 0.14, d: 0.1 },
    ];

    notes.forEach(note => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(ctx.destination);

      const t = now + note.t;
      osc.frequency.setValueAtTime(note.f, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.32, t + 0.007);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + note.d);

      osc.start(t);
      osc.stop(t + note.d + 0.02);
    });
  },

  async playRingtone(): Promise<() => void> {
    await this.ensureInitialized();

    if (this.activeRingtoneStop) {
      this.activeRingtoneStop();
    }

    const buf = await this._loadAudioBuffer('ringtone');
    let stopped = false;
    let intervalId: number | null = null;
    let timeoutId: number | null = null;
    let liveNodes: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

    const playFromFile = () => {
      if (stopped || !buf || !this.audioContext) return;
      const res = this._playBuffer(buf, 0.85, false);
      liveNodes = res;
      const durMs = Math.round(buf.duration * 1000);
      timeoutId = window.setTimeout(() => {
        if (!stopped) intervalId = window.setTimeout(playFromFile, Math.max(800, 1700 - durMs));
      }, durMs + 100);
    };

    const playTeamsStyleRing = () => {
      if (stopped || !this.audioContext) return;
      const c = this.audioContext;
      const now = c.currentTime;

      // Teams/Slack-style ring: 3 burst groups (triad arpeggio + sub-bass)
      // Burst pattern: ring-1 (0.7s), silence (0.15s), ring-2 (0.7s), silence (1.25s) → 2.8s cycle
      const bursts = [0, 0.85];
      const notesHz = [440.0, 554.37, 659.25, 880.0]; // A4, C#5, E5, A5 — bright, professional
      const subHz = 110.0;

      for (const burstT of bursts) {
        // Sub bass layer - single note per burst for warmth & authority
        {
          const t = now + burstT;
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(subHz, t);
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.30, t + 0.020);
          gain.gain.setValueAtTime(0.28, t + 0.50);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
          osc.connect(gain);
          gain.connect(c.destination);
          osc.start(t);
          osc.stop(t + 0.7);
        }

        // Arpeggio: 4 quick notes — Teams-like ascending triad arpeggio
        const noteOffsets = [0.000, 0.080, 0.160, 0.240];
        for (let i = 0; i < notesHz.length; i++) {
          const f = notesHz[i];
          const t = now + burstT + noteOffsets[i];
          const dur = 0.45;

          // Sine fundamental (clean, bell-like)
          {
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.28, t + 0.012);
            gain.gain.setValueAtTime(0.22, t + 0.20);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            osc.connect(gain);
            gain.connect(c.destination);
            osc.start(t);
            osc.stop(t + dur + 0.02);
          }

          // Triangle harmonic (5th above, lower vol — adds Slack sparkle)
          {
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f * 1.5003, t); // perfect 5th (3:2 ratio ish)
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.10, t + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dur - 0.05);
            osc.connect(gain);
            gain.connect(c.destination);
            osc.start(t);
            osc.stop(t + dur);
          }

          // Soft vibrato sine layer (warmth, slight chorus-ish feel)
          {
            const osc = c.createOscillator();
            const lfo = c.createOscillator();
            const lfoGain = c.createGain();
            const gain = c.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(f * 0.998, t);
            lfo.type = 'sine';
            lfo.frequency.setValueAtTime(5.5, t);
            lfoGain.gain.setValueAtTime(1.8, t);
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);

            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.10, t + 0.020);
            gain.gain.setValueAtTime(0.08, t + 0.22);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

            osc.connect(gain);
            gain.connect(c.destination);
            osc.start(t);
            osc.stop(t + dur + 0.02);
            lfo.start(t);
            lfo.stop(t + dur + 0.02);
          }
        }

        // Click/attack transient at burst start (helps ring cut through)
        {
          const t = now + burstT;
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(1800, t);
          osc.frequency.exponentialRampToValueAtTime(400, t + 0.030);
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.08, t + 0.003);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
          osc.connect(gain);
          gain.connect(c.destination);
          osc.start(t);
          osc.stop(t + 0.06);
        }
      }
    };

    if (buf) {
      playFromFile();
    } else {
      playTeamsStyleRing();
      intervalId = window.setInterval(playTeamsStyleRing, 2800);
    }

    const stop = () => {
      stopped = true;
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
      if (liveNodes) {
        try { liveNodes.src.stop(); } catch {}
        try { liveNodes.gain.disconnect(); } catch {}
        liveNodes = null;
      }
      if (this.activeRingtoneStop === stop) {
        this.activeRingtoneStop = null;
      }
    };

    this.activeRingtoneStop = stop;
    return stop;
  },

  async playRingback(): Promise<() => void> {
    await this.ensureInitialized();

    if (this.activeRingbackStop) {
      this.activeRingbackStop();
    }

    const buf = await this._loadAudioBuffer('ringback');
    let stopped = false;
    let intervalId: number | null = null;
    let timeoutId: number | null = null;
    let liveNodes: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

    const playFromFile = () => {
      if (stopped || !buf || !this.audioContext) return;
      const res = this._playBuffer(buf, 0.75, false);
      liveNodes = res;
      const durMs = Math.round(buf.duration * 1000);
      timeoutId = window.setTimeout(() => {
        if (!stopped) intervalId = window.setTimeout(playFromFile, Math.max(1000, 2100 - durMs));
      }, durMs + 100);
    };

    const playProRingback = () => {
      if (stopped || !this.audioContext) return;
      const c = this.audioContext;
      const now = c.currentTime;

      // Standard US ringback pattern: 2 tones (440Hz + 480Hz) for 2.0s, silence for 4.0s → 6.0s cycle
      // We'll play 2 short bursts of 1.0s each separated by 0.2s, then 3.8s silence to match the 6s cycle
      const tonePattern = [
        { on: 0.0, off: 1.0 },
        { on: 1.2, off: 2.2 },
      ];
      const f1 = 440.0;
      const f2 = 480.0;
      const sub = 220.0;

      for (const part of tonePattern) {
        const tStart = now + part.on;
        const tEnd = now + part.off;
        const dur = part.off - part.on;

        // Tone 1 - Sine 440
        {
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f1, tStart);
          gain.gain.setValueAtTime(0, tStart);
          gain.gain.linearRampToValueAtTime(0.26, tStart + 0.020);
          gain.gain.setValueAtTime(0.26, tEnd - 0.040);
          gain.gain.exponentialRampToValueAtTime(0.0001, tEnd);
          osc.connect(gain);
          gain.connect(c.destination);
          osc.start(tStart);
          osc.stop(tEnd + 0.02);
        }

        // Tone 2 - Sine 480 (creates beating pattern with 440 — authentic ringback sound)
        {
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f2, tStart);
          gain.gain.setValueAtTime(0, tStart);
          gain.gain.linearRampToValueAtTime(0.22, tStart + 0.020);
          gain.gain.setValueAtTime(0.22, tEnd - 0.040);
          gain.gain.exponentialRampToValueAtTime(0.0001, tEnd);
          osc.connect(gain);
          gain.connect(c.destination);
          osc.start(tStart);
          osc.stop(tEnd + 0.02);
        }

        // Sub bass 220 (warmer, fuller ringback)
        {
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(sub, tStart);
          gain.gain.setValueAtTime(0, tStart);
          gain.gain.linearRampToValueAtTime(0.12, tStart + 0.025);
          gain.gain.setValueAtTime(0.10, tEnd - 0.050);
          gain.gain.exponentialRampToValueAtTime(0.0001, tEnd);
          osc.connect(gain);
          gain.connect(c.destination);
          osc.start(tStart);
          osc.stop(tEnd + 0.03);
        }

        // Slight amplitude modulation (warble) — soft vibrato on volume for authentic phone-network feel
        {
          const osc = c.createOscillator();
          const am = c.createGain();
          const mod = c.createOscillator();
          const modGain = c.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f1 * 2.0, tStart);
          mod.type = 'sine';
          mod.frequency.setValueAtTime(16.5, tStart); // ~16 Hz AM gives a realistic telephone warble
          modGain.gain.setValueAtTime(0.12, tStart);

          mod.connect(modGain);
          modGain.connect(am.gain);

          am.gain.setValueAtTime(0.08, tStart);
          osc.connect(am);
          am.connect(c.destination);

          osc.start(tStart);
          osc.stop(tEnd + 0.02);
          mod.start(tStart);
          mod.stop(tEnd + 0.02);
        }

        // start-end click
        {
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(900, tStart);
          osc.frequency.exponentialRampToValueAtTime(350, tStart + 0.015);
          gain.gain.setValueAtTime(0, tStart);
          gain.gain.linearRampToValueAtTime(0.03, tStart + 0.002);
          gain.gain.exponentialRampToValueAtTime(0.0001, tStart + 0.020);
          osc.connect(gain);
          gain.connect(c.destination);
          osc.start(tStart);
          osc.stop(tStart + 0.025);
        }
      }
    };

    if (buf) {
      playFromFile();
    } else {
      playProRingback();
      intervalId = window.setInterval(playProRingback, 6000);
    }

    const stop = () => {
      stopped = true;
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
      if (liveNodes) {
        try { liveNodes.src.stop(); } catch {}
        try { liveNodes.gain.disconnect(); } catch {}
        liveNodes = null;
      }
      if (this.activeRingbackStop === stop) {
        this.activeRingbackStop = null;
      }
    };

    this.activeRingbackStop = stop;
    return stop;
  },

  stopAllRingtones() {
    if (this.activeRingtoneStop) {
      this.activeRingtoneStop();
      this.activeRingtoneStop = null;
    }
    if (this.activeRingbackStop) {
      this.activeRingbackStop();
      this.activeRingbackStop = null;
    }
  },

  async playNotification() {
    await this.playMessageReceived();
  },

  async playCallEnded() {
    await this.ensureInitialized();
    const ctx = this.audioContext;
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [
      { f: 523, t: 0 },
      { f: 392, t: 0.12 },
      { f: 330, t: 0.24 },
    ];

    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.f, now + n.t);
      gain.gain.setValueAtTime(0, now + n.t);
      gain.gain.linearRampToValueAtTime(0.28, now + n.t + 0.01);
      gain.gain.setValueAtTime(0.28, now + n.t + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.t);
      osc.stop(now + n.t + 0.15);
    });
  },
};
