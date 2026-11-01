import {
  active,
  duration,
  fade,
  type VideoClip,
  type VideoProject,
} from "./model";
type Media = {
  el: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
  gain?: GainNode;
  source?: MediaElementAudioSourceNode;
  url: string;
  asset: string;
};
// Preview and export use the same compositor and audio graph.
export class VideoEngine {
  private project: VideoProject;
  private media = new Map<string, Media>();
  private urls = new Map<string, string>();
  private pending = new Map<string, Promise<void>>();
  private audio?: AudioContext;
  private mix?: GainNode;
  private monitor?: GainNode;
  private destination?: MediaStreamAudioDestinationNode;
  private action = 0;
  private exportCancelled = false;
  private sourceLoads = new Map<
    string,
    Promise<{ url: string; type: string }>
  >();
  private raf = 0;
  private playing = false;
  private start = 0;
  private from = 0;
  private t = 0;
  private disposed = false;
  private recorder?: MediaRecorder;
  private exporting = false;
  constructor(
    private canvas: HTMLCanvasElement,
    p: VideoProject,
    private load: (id: string) => Promise<Blob>,
    private onTime: (t: number) => void,
    private onStop: () => void,
    private onError: (message: string) => void,
  ) {
    this.project = p;
    this.update(p);
  }
  update(p: VideoProject) {
    this.project = p;
    this.canvas.width = p.width;
    this.canvas.height = p.height;
    void this.prepare()
      .then(() => this.draw(this.t))
      .catch((e) => !this.disposed && this.onError(e.message));
  }
  private async prepare() {
    await Promise.all(
      this.project.tracks.flatMap((t) =>
        t.clips
          .filter((c) => !c.text && c.asset)
          .map((c) => this.prepareClip(c)),
      ),
    );
  }
  private async prepareClip(c: VideoClip) {
    if (this.media.get(c.id)?.asset === c.asset) return;
    if (this.pending.has(c.id)) return this.pending.get(c.id);
    const work = (async () => {
      let loading = this.sourceLoads.get(c.asset);
      if (!loading) {
        loading = this.load(c.asset).then((blob) => {
          if (this.disposed) throw Error("Editor closed.");
          const url = URL.createObjectURL(blob);
          this.urls.set(c.asset, url);
          return { url, type: blob.type };
        });
        this.sourceLoads.set(c.asset, loading);
        loading.catch(() => this.sourceLoads.delete(c.asset));
      }
      const data = await loading;
      if (this.disposed) return;
      const url = data.url;
      const el = data.type.startsWith("image/")
        ? new Image()
        : document.createElement(
            data.type.startsWith("audio/") ? "audio" : "video",
          );
      if (el instanceof HTMLMediaElement) {
        el.preload = "auto";
        el.onseeked = () => {
          if (!this.playing) this.draw(this.t);
        };
        if (el instanceof HTMLVideoElement) el.playsInline = true;
      }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              Error(
                "A source could not be decoded. Try MP4, WebM, MP3 or WAV.",
              ),
            ),
          20000,
        );
        const ok = () => {
          clearTimeout(timer);
          resolve();
        };
        el.onerror = () => {
          clearTimeout(timer);
          reject(Error("This browser cannot play a source in this project."));
        };
        if (el instanceof HTMLImageElement) el.onload = ok;
        else el.onloadeddata = ok;
        el.src = url!;
      });
      if (this.disposed) {
        if (el instanceof HTMLMediaElement) {
          el.removeAttribute("src");
          el.load();
        }
        return;
      }
      this.media.set(c.id, { el, url: url!, asset: c.asset });
    })();
    this.pending.set(c.id, work);
    try {
      await work;
    } finally {
      this.pending.delete(c.id);
    }
  }
  private audioGraph() {
    this.audio ??= new AudioContext();
    if (!this.mix) {
      this.mix = this.audio.createGain();
      this.monitor = this.audio.createGain();
      this.destination = this.audio.createMediaStreamDestination();
      this.mix.connect(this.monitor);
      this.monitor.connect(this.audio.destination);
      this.mix.connect(this.destination);
    }
    for (const m of this.media.values())
      if (m.el instanceof HTMLMediaElement && !m.source) {
        m.el.muted = false;
        m.source = this.audio.createMediaElementSource(m.el);
        m.gain = this.audio.createGain();
        m.source.connect(m.gain);
        m.gain.connect(this.mix);
      }
  }
  seek(t: number) {
    this.t = Math.max(0, Math.min(duration(this.project), t));
    this.from = this.t;
    this.start = performance.now();
    this.draw(this.t);
    this.onTime(this.t);
  }
  async play(from = this.t) {
    const action = ++this.action;
    await this.prepare();
    if (
      this.disposed ||
      action !== this.action ||
      (this.exporting && this.exportCancelled)
    )
      return;
    this.audioGraph();
    await this.audio!.resume();
    if (this.disposed || action !== this.action) return;
    this.playing = true;
    this.from = from;
    this.start = performance.now();
    this.loop();
  }
  pause() {
    this.action++;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.media.forEach((m) => {
      if (m.el instanceof HTMLMediaElement) m.el.pause();
    });
    this.onStop();
  }
  private loop = () => {
    if (!this.playing || this.disposed) return;
    this.t = Math.min(
      duration(this.project),
      this.from + (performance.now() - this.start) / 1000,
    );
    this.draw(this.t);
    this.onTime(this.t);
    if (this.t >= duration(this.project)) {
      this.pause();
      if (this.recorder?.state === "recording") this.recorder.stop();
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
  };
  private draw(t: number) {
    if (this.disposed) return;
    const total = duration(this.project);
    if (total && t >= total) t = Math.max(0, total - 0.001);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const p = this.project;
    ctx.fillStyle = p.background;
    ctx.fillRect(0, 0, p.width, p.height);
    const alive = new Set<string>();
    for (const tr of [...p.tracks].reverse())
      for (const c of tr.clips) {
        const on = active(c, t);
        const m = this.media.get(c.id);
        if (on) alive.add(c.id);
        if (m?.el instanceof HTMLMediaElement) {
          const el = m.el;
          el.playbackRate = c.speed || 1;
          const target = c.in + Math.max(0, t - c.at) * (c.speed || 1);
          if (on) {
            if (Math.abs(el.currentTime - target) > 0.18 || !this.playing) {
              if (Math.abs(el.currentTime - target) > 0.015)
                try {
                  el.currentTime = target;
                } catch {
                  /* Not decoded yet. */
                }
            }
            if (this.playing && el.paused) void el.play().catch(() => {});
            else if (!this.playing) el.pause();
          } else el.pause();
          if (m.gain)
            m.gain.gain.value = on && !tr.mute ? c.gain * fade(c, t) : 0;
          else el.muted = true;
        }
        if (!on || tr.hidden || tr.kind === "audio") continue;
        ctx.save();
        ctx.globalAlpha = c.opacity * fade(c, t);
        if (c.text) {
          const font = Math.round(p.height * 0.055 * c.scale);
          ctx.font = `700 ${font}px Karla, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const lines = wrap(ctx, c.text, p.width * 0.85),
            lineHeight = font * 1.25;
          const y = p.height * c.y;
          ctx.fillStyle = "rgba(0,0,0,.7)";
          ctx.fillRect(
            p.width * 0.05,
            y - (lineHeight * lines.length) / 2 - 10,
            p.width * 0.9,
            lineHeight * lines.length + 20,
          );
          ctx.fillStyle = "#fff";
          lines.forEach((line, i) =>
            ctx.fillText(
              line,
              p.width * c.x,
              y + (i - (lines.length - 1) / 2) * lineHeight,
            ),
          );
        } else if (m && !(m.el instanceof HTMLAudioElement)) {
          const el = m.el;
          const w =
              el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth,
            h =
              el instanceof HTMLVideoElement
                ? el.videoHeight
                : el.naturalHeight;
          if (w && h) {
            const s =
              (c.fit === "cover"
                ? Math.max(p.width / w, p.height / h)
                : Math.min(p.width / w, p.height / h)) * c.scale;
            ctx.drawImage(
              el,
              p.width * c.x - (w * s) / 2,
              p.height * c.y - (h * s) / 2,
              w * s,
              h * s,
            );
          }
        }
        ctx.restore();
      }
    for (const [id, m] of this.media)
      if (!alive.has(id) && m.el instanceof HTMLMediaElement) m.el.pause();
  }
  async export(progress: (n: number) => void): Promise<Blob> {
    if (this.exporting) throw Error("An export is already running.");
    if (!duration(this.project)) throw Error("Add a clip first.");
    if (!("MediaRecorder" in window) || !this.canvas.captureStream)
      throw Error(
        "Use a browser with video recording support, such as Chrome or Edge.",
      );
    this.exporting = true;
    this.exportCancelled = false;
    this.pause();
    const original = this.t;
    let stream: MediaStream | undefined;
    try {
      await this.prepare();
      if (this.exportCancelled)
        throw Error("Export cancelled. Your project is still here.");
      this.audioGraph();
      await this.audio!.resume();
      this.monitor!.gain.value = 0;
      const type = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/mp4",
        "video/webm",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      if (!type)
        throw Error("This browser cannot export a supported video format.");
      this.seek(0);
      await Promise.all(
        [...this.media.values()].map((m) =>
          m.el instanceof HTMLMediaElement && m.el.seeking
            ? new Promise<void>((resolve) => {
                const el = m.el as HTMLMediaElement;
                const done = () => {
                  clearTimeout(timer);
                  el.removeEventListener("seeked", done);
                  resolve();
                };
                const timer = setTimeout(done, 2000);
                el.addEventListener("seeked", done, { once: true });
              })
            : Promise.resolve(),
        ),
      );
      if (this.exportCancelled)
        throw Error("Export cancelled. Your project is still here.");
      this.draw(0);
      stream = this.canvas.captureStream(30);
      for (const t of this.destination!.stream.getAudioTracks())
        stream.addTrack(t.clone());
      const recorder = new MediaRecorder(stream, {
        mimeType: type,
        videoBitsPerSecond: 4_000_000,
      });
      this.recorder = recorder;
      const chunks: Blob[] = [];
      const result = new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        recorder.onerror = () =>
          reject(Error("The export stopped. Your project is still here."));
        recorder.onstop = () =>
          this.t >= duration(this.project) - 0.05
            ? resolve(new Blob(chunks, { type }))
            : reject(Error("Export cancelled. Your project is still here."));
      });
      const hide = () => {
        if (document.hidden) this.cancelExport();
      };
      document.addEventListener("visibilitychange", hide);
      recorder.start(1000);
      const timer = window.setInterval(
        () => progress(this.t / duration(this.project)),
        200,
      );
      try {
        await this.play(0);
        return await result;
      } finally {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", hide);
      }
    } finally {
      this.pause();
      this.recorder = undefined;
      stream?.getTracks().forEach((t) => t.stop());
      if (this.monitor) this.monitor.gain.value = 1;
      this.exporting = false;
      if (!this.disposed) this.seek(original);
    }
  }
  cancelExport() {
    if (this.exporting) this.exportCancelled = true;
    this.pause();
    if (this.recorder?.state === "recording") this.recorder.stop();
  }
  dispose() {
    this.disposed = true;
    this.cancelExport();
    this.media.forEach((m) => {
      if (m.el instanceof HTMLMediaElement) {
        m.el.removeAttribute("src");
        m.el.load();
      }
      m.source?.disconnect();
      m.gain?.disconnect();
    });
    this.urls.forEach((url) => URL.revokeObjectURL(url));
    void this.audio?.close().catch(() => {});
  }
}
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}
