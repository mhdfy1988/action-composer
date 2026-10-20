// 库与 Worker 协议封装在基础设施层，应用只接收候选几何变换。
export function matchWholeBody(job, signal, onProgress = () => {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let finished = false;
    const worker = new Worker(
      new URL('./registration-worker.js', document.querySelector('script[src$="/app.js"]').src),
    );
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    const abort = () => finish(new DOMException('匹配已取消', 'AbortError'));
    const timeout = setTimeout(
      () => finish(new Error('全身匹配超时，请降低图片分辨率或手动校准')),
      60000,
    );
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (finished) return;
      if (data.type === 'ready') worker.postMessage(job);
      else if (data.type === 'progress') onProgress(data.message);
      else if (data.type === 'error') finish(new Error(data.message));
      else if (data.type === 'result') {
        if (
          !data.best ||
          !['scale', 'tx', 'ty', 'score'].every((key) => Number.isFinite(data.best[key]))
        )
          finish(new Error('匹配返回无效数据'));
        else finish(null, data);
      }
    };
    worker.onerror = () => finish(new Error('全身匹配运行库加载失败，请重新构建并检查本机缓存'));
  });
}
