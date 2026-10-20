import { TICKS, frameStart } from '../domain/project.js';

// 播放只拥有共同时间，不拥有动作、帧选择或编辑历史。
export class Playback {
  constructor({
    now = () => performance.now(),
    request = (callback) => requestAnimationFrame(callback),
    cancel = (id) => cancelAnimationFrame(id),
  } = {}) {
    this.now = now;
    this.request = request;
    this.cancel = cancel;
    this.playing = false;
    this.startTime = 0;
    this.startTicks = 0;
    this.loopId = null;
    this.loop = null;
  }
  ticks(group, frame) {
    return this.playing
      ? this.startTicks + ((this.now() - this.startTime) * TICKS) / 1000
      : frameStart(group, frame);
  }
  toggle(group, frame) {
    this.playing = !this.playing;
    this.startTime = this.now();
    this.startTicks = frameStart(group, frame);
  }
  stop() {
    this.playing = false;
  }
  startLoop(onTick) {
    if (this.loop) return;
    const tick = () => {
      if (this.loop !== tick) return;
      onTick();
      if (this.loop === tick) this.loopId = this.request(tick);
    };
    this.loop = tick;
    this.loopId = this.request(tick);
  }
  dispose() {
    this.stop();
    this.loop = null;
    if (this.loopId !== null) this.cancel(this.loopId);
    this.loopId = null;
  }
}
