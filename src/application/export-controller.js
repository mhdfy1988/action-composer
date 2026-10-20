import { exportGroup } from './export.js';
import { download } from '../infrastructure/media.js';
import { createExportDialog } from '../ui/export-dialog.js';

export function mountExportController({
  session,
  media,
  current,
  isBusy,
  runTask,
  endGesture,
  stop,
  setStatus,
}) {
  const safeName = (name) => name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100) || '动作';
  const dialog = createExportDialog({
    onSubmit: ({ name, all, kind, columns, padding }) =>
      runTask(async (signal) => {
        const project = structuredClone(session.project),
          group = project.groups.find((g) => g.id === current().id);
        if (!all) group.name = name;
        const bytes = await exportGroup(project, group, media, {
          signal,
          groups: all ? project.groups : [group],
          kind,
          columns,
          padding,
          onMeasure: (i, total) => setStatus(`正在测量内容 ${i} / ${total}`),
          onProgress: (i, total) => setStatus(`正在导出 ${i} / ${total}`),
        });
        signal.throwIfAborted();
        download(bytes, `${safeName(name)}-${kind === 'sheet' ? '精灵图' : '校准'}.zip`);
        setStatus('校准帧导出下载已发起');
      }),
  });
  return {
    open() {
      if (isBusy() || !current()) return;
      endGesture();
      stop();
      dialog.open(current().name);
    },
    setBusy: dialog.setBusy,
  };
}
