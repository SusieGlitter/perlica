export class RideMusic {
  constructor(source) {
    this.audio = new Audio(source);
    this.audio.loop = true;
    this.audio.preload = "none";
    this.context = null;
    this.gain = null;
    this.sourceNode = null;
    this.playing = false;
    this.volume = 0.5;
  }

  ensureGraph() {
    if (this.context) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContext();
    this.gain = this.context.createGain();
    this.gain.gain.value = 0.0001;
    this.sourceNode = this.context.createMediaElementSource(this.audio);
    this.sourceNode.connect(this.gain).connect(this.context.destination);
  }

  async start() {
    this.ensureGraph();
    await this.context.resume();
    await this.audio.play();
    this.playing = true;
    this.gain.gain.cancelScheduledValues(this.context.currentTime);
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), this.context.currentTime);
    this.gain.gain.exponentialRampToValueAtTime(this.volume, this.context.currentTime + 1.6);
  }

  stop() {
    if (!this.context || !this.playing) return;
    this.playing = false;
    this.gain.gain.cancelScheduledValues(this.context.currentTime);
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), this.context.currentTime);
    this.gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.8);
    window.setTimeout(() => {
      if (!this.playing) this.audio.pause();
    }, 900);
  }
}
