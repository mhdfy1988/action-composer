import { alignFirstFrame } from './align-first-frame.js';

// 全部动作始终使用同一份基准快照；计算结束前不发布任何修改。
export async function alignAllFirstFrames(
  project,
  referenceId,
  media,
  { signal, onProgress = () => {}, align = alignFirstFrame } = {},
) {
  const reference = project.groups.find((group) => group.id === referenceId);
  if (!reference) throw new Error('请选择一个动作作为当前基准');
  const targets = project.groups.filter((group) => group.id !== referenceId);
  if (!targets.length) throw new Error('至少需要两个动作才能首帧对齐');
  const updates = [],
    failures = [],
    warnings = [];
  for (const [index, target] of targets.entries()) {
    signal?.throwIfAborted();
    const progress = (message) =>
      onProgress({ index: index + 1, total: targets.length, name: target.name, message });
    progress('正在匹配');
    try {
      const result = await align(project, target.id, referenceId, media, signal, progress);
      signal?.throwIfAborted();
      updates.push({ targetId: target.id, transform: result.transform });
      if (result.candidate.boundary || result.candidate.best.score < 0.7)
        warnings.push(target.name);
    } catch (error) {
      if (signal?.aborted || error.name === 'AbortError') throw error;
      failures.push({
        targetId: target.id,
        name: target.name,
        message: error.message ?? String(error),
      });
    }
  }
  signal?.throwIfAborted();
  return { updates, failures, warnings, referenceId };
}
