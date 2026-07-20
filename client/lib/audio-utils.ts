export const AudioUtils = {
  audioContext: null as AudioContext | null,
  isInitialized: false,

  async initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    this.isInitialized = true;
  },

  async playRingtone(): Promise<() => void> {
    if (!this.isInitialized) {
      await this.initAudioContext();
    }
    
    const ctx = this.audioContext;
    if (!ctx) return () => {};
    
    const now = ctx.currentTime;
    
    // First ring
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    
    osc1.frequency.setValueAtTime(800, now);
    osc1.frequency.exponentialRampToValueAtTime(400, now + 0.1);
    osc1.frequency.exponentialRampToValueAtTime(800, now + 0.2);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.4, now + 0.01);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.start(now);
    osc1.stop(now + 0.3);
    
    // Repeat rings
    let intervalId: number | null = null;
    
    const playRing = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(400, t + 0.1);
      osc.frequency.exponentialRampToValueAtTime(800, t + 0.2);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.4, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    };
    
    // Start the interval after 1 second
    intervalId = window.setInterval(playRing, 1000);
    
    // Return a function to stop the ringtone
    return () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  },

  async playNotification() {
    if (!this.isInitialized) {
      await this.initAudioContext();
    }
    
    const ctx = this.audioContext;
    if (!ctx) return;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    osc.start(now);
    osc.stop(now + 0.15);
  }
};
