export interface Lap {
  number: number;
  elapsed: number;
  duration: number;
}

/** 使用单调时钟，刷新频率和页面是否可见都不影响计时。 */
export class Stopwatch {
  accumulated = 0;
  startedAt: number | null = null;
  laps: Lap[] = [];

  get running() { return this.startedAt !== null; }
  elapsed(now: number) { return this.accumulated + (this.startedAt === null ? 0 : Math.max(0, now - this.startedAt)); }
  start(now: number) { if (!this.running) this.startedAt = now; }
  pause(now: number) { this.accumulated = this.elapsed(now); this.startedAt = null; }
  lap(now: number) {
    if (!this.running) return;
    const elapsed = this.elapsed(now);
    this.laps.push({ number: this.laps.length + 1, elapsed, duration: elapsed - (this.laps[this.laps.length - 1]?.elapsed ?? 0) });
  }
  reset() { this.accumulated = 0; this.startedAt = null; this.laps = []; }
}

export function formatStopwatch(ms: number): string {
  const centiseconds = Math.floor(Math.max(0, ms) / 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(centiseconds / 360000))}:${pad(Math.floor(centiseconds / 6000) % 60)}:${pad(Math.floor(centiseconds / 100) % 60)}.${pad(centiseconds % 100)}`;
}
