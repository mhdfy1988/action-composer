import { importFrames } from './import-frames.js';
import { createImportDialog } from '../ui/import-dialog.js';

export function mountImportController({ session, media, isBusy, runTask, onImported, setStatus }) {
  return createImportDialog({
    isBusy,
    onError: (message) => setStatus(message, true),
    onSubmit: (input) =>
      runTask(async (signal) => {
        const result = await importFrames({
          ...input,
          session,
          media,
          signal,
          onProgress: (count, total) => setStatus(`正在导入 ${count} / ${total}`),
        });
        onImported(result.id);
        setStatus(
          `已导入 ${result.count} 帧${result.usesTimings ? ' · 使用清单时序' : ` · ${input.fps} 帧/秒`}`,
        );
      }),
  });
}
