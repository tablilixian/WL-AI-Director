export class FFmpegWorker {
  private worker: Worker | null = null;
  private msgId = 0;
  private resolves: Record<number, (value: any) => void> = {};
  private rejects: Record<number, (reason: any) => void> = {};
  private progressCb: ((p: any) => void) | null = null;

  onProgress(cb: (p: any) => void) {
    this.progressCb = cb;
  }

  private createWorker(): Worker {
    const code = `
      var ffmpeg = null;
      self.onmessage = async function(e) {
        var msg = e.data;
        var id = msg.id;
        var type = msg.type;
        var data = msg.data;
        try {
          if (type === 'load') {
            if (!self.createFFmpegCore) {
              importScripts(self.location.origin + (data.coreURL || '/ffmpeg/ffmpeg-core-umd.js'));
            }
            var coreURL = self.location.origin + (data.coreURL || '/ffmpeg/ffmpeg-core-umd.js');
            var wasmURL = self.location.origin + (data.wasmURL || '/ffmpeg/ffmpeg-core.wasm');
            ffmpeg = await self.createFFmpegCore({
              mainScriptUrlOrBlob: coreURL + '#' + btoa(JSON.stringify({ wasmURL: wasmURL, workerURL: coreURL }))
            });
            ffmpeg.setProgress(function(p) {
              self.postMessage({ type: 'progress', data: p });
            });
            self.postMessage({ id: id, type: type, data: true });
          } else if (type === 'writeFile') {
            ffmpeg.FS.writeFile(data.path, data.data);
            self.postMessage({ id: id, type: type, data: true });
          } else if (type === 'readFile') {
            var result = ffmpeg.FS.readFile(data.path, { encoding: data.encoding || 'binary' });
            self.postMessage({ id: id, type: type, data: result });
          } else if (type === 'deleteFile') {
            ffmpeg.FS.unlink(data.path);
            self.postMessage({ id: id, type: type, data: true });
          } else if (type === 'exec') {
            ffmpeg.setTimeout(data.timeout || -1);
            ffmpeg.exec.apply(ffmpeg, data.args);
            var ret = ffmpeg.ret;
            ffmpeg.reset();
            self.postMessage({ id: id, type: type, data: ret });
          }
        } catch(e) {
          self.postMessage({ id: id, type: 'error', data: e.message || String(e) });
        }
      };
    `;
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = (e) => {
      const { id, type, data } = e.data;
      if (type === 'progress') {
        this.progressCb?.(data);
        return;
      }
      if (type === 'error') {
        this.rejects[id]?.(new Error(data));
      } else {
        this.resolves[id]?.(data);
      }
      delete this.resolves[id];
      delete this.rejects[id];
    };
    return worker;
  }

  async load(
    opts?: { coreURL?: string; wasmURL?: string },
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (!this.worker) {
      this.worker = this.createWorker();
    }
    return this.send(
      'load',
      {
        coreURL: opts?.coreURL || '/ffmpeg/ffmpeg-core-umd.js',
        wasmURL: opts?.wasmURL || '/ffmpeg/ffmpeg-core.wasm',
      },
      signal,
    );
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    await this.send('writeFile', { path, data });
  }

  async readFile(path: string, encoding?: string): Promise<Uint8Array> {
    return this.send('readFile', { path, encoding });
  }

  async deleteFile(path: string): Promise<void> {
    await this.send('deleteFile', { path });
  }

  exec(...args: string[]): Promise<number> {
    return this.send('exec', { args, timeout: -1 });
  }

  on(_event: string, _cb: (...args: unknown[]) => void) {
    // progress events not exposed yet
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
  }

  get loaded(): boolean {
    return this.worker !== null;
  }

  private send(type: string, data: any, signal?: AbortSignal): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not created'));
        return;
      }
      const id = ++this.msgId;
      this.resolves[id] = resolve;
      this.rejects[id] = reject;
      this.worker.postMessage({ id, type, data });
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            reject(new DOMException(`Message #${id} was aborted`, 'AbortError'));
            delete this.resolves[id];
            delete this.rejects[id];
          },
          { once: true },
        );
      }
    });
  }
}
