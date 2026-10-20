import { TICKS } from '../domain/project.js';
import { decodePng, checkMediaBudget } from '../infrastructure/media.js';
import { sliceSheet } from '../infrastructure/spritesheet-import.js';

// 接管传入的预览位图；解码资源全成功提交后移交media，失败只释放本次资源。
export async function importFrames(
  {
    session,
    media,
    files,
    timings,
    name,
    fps,
    source = null,
    plan = null,
    signal,
    onProgress = () => {},
  },
  {
    decode = decodePng,
    slice = sliceSheet,
    checkBudget = checkMediaBudget,
    createId = () => crypto.randomUUID(),
  } = {},
) {
  const decoded = [];
  const base = session.project;
  let committed = false;
  try {
    signal?.throwIfAborted();
    if (!name || !Number.isInteger(fps) || fps < 1 || fps > 60)
      throw new Error('动作名称或帧率无效');
    if (plan) {
      checkBudget([
        ...media.values(),
        ...plan.frames.map(({ rect }) => ({ bytes: new Uint8Array(), asset: rect })),
      ]);
      ({ files, timings } = await slice(source.image, plan, signal));
    }
    if (!files.length || files.length > 120) throw new Error('每组需包含1至120帧');
    for (const file of files) {
      signal?.throwIfAborted();
      if (file.size > 20 * 1024 * 1024) throw new Error('单张 PNG 最多 20 MB');
      const item = await decode(new Uint8Array(await file.arrayBuffer()), file.name);
      decoded.push(item);
      signal?.throwIfAborted();
      checkBudget([...media.values(), ...decoded]);
      onProgress(decoded.length, files.length);
    }
    signal?.throwIfAborted();
    if (session.project !== base) throw new Error('会话已变化，请重新导入');
    const id = createId();
    session.edit((p) => {
      p.assets.push(...decoded.map((d) => d.asset));
      p.groups.push({
        id,
        name,
        frames: decoded.map((d, i) => ({
          id: createId(),
          assetId: d.asset.id,
          durationTicks: timings?.get(files[i].name) ?? Math.round(TICKS / fps),
        })),
        scale: 1,
        x: plan?.origin?.x ?? 0,
        y: plan?.origin?.y ?? 0,
        lockX: false,
        lockY: false,
        horizontal: false,
        anchors: decoded.map(() => null),
      });
      if (p.groups.length === 1) {
        const width = Math.max(...decoded.map((d) => d.asset.width)) + 64;
        const height = Math.max(...decoded.map((d) => d.asset.height)) + 64;
        p.stage = { width, height, originX: width / 2, originY: height - 32 };
      }
    });
    for (const item of decoded) media.set(item.asset.id, item);
    committed = true;
    return { id, count: files.length, usesTimings: Boolean(timings) };
  } finally {
    if (!committed) for (const item of decoded) item.image.close();
    source?.image.close();
  }
}
