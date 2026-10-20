import { strToU8 } from 'fflate';
import { measureOutput } from '../rendering/measure-output.js';
import { drawFrame } from '../rendering/frame.js';
import { packFiles } from '../infrastructure/archive.js';
import { outputLayout, checkOutputSize } from '../domain/output-layout.js';

async function pngBytes(canvas) {
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 编码失败'))), 'image/png'),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

export async function exportGroup(
  project,
  group,
  media,
  {
    padding = 16,
    signal,
    onProgress = () => {},
    onMeasure = () => {},
    groups = [group],
    kind = 'sequence',
    columns = 8,
  } = {},
) {
  if (!groups.length) throw new Error('没有可导出的动作');
  if (!['sequence', 'sheet'].includes(kind)) throw new Error('未知导出格式');
  if (kind === 'sheet' && (!Number.isInteger(columns) || columns < 1 || columns > 64))
    throw new Error('列数必须是 1–64 的整数');
  const layouts = [];
  const total = groups.reduce((n, item) => n + item.frames.length, 0);
  let measured = 0;
  for (const item of groups) {
    const bounds = await measureOutput(project, item, media, {
      padding: 0,
      signal,
      onProgress: (i) => onMeasure(measured + i, total),
    });
    layouts.push({
      left: bounds.left,
      top: bounds.top,
      right: bounds.left + bounds.width,
      bottom: bounds.top + bounds.height,
    });
    measured += item.frames.length;
  }
  const layout = outputLayout(layouts, project.stage, padding);
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d'),
    files = Object.create(null);
  let size = 0,
    completed = 0;
  const put = (name, bytes) => {
    size += bytes.length;
    if (size > 96 * 1024 * 1024) throw new Error('输出超过 96 MB，请分组导出');
    files[name] = bytes;
  };
  const animations = [];
  for (const [groupIndex, item] of groups.entries()) {
    const prefix =
      groups.length > 1 ? `actions/${String(groupIndex + 1).padStart(2, '0')}-${item.id}/` : '';
    const frames = [];
    const cols = Math.min(columns, item.frames.length);
    let sheet, sheetContext;
    if (kind === 'sheet') {
      checkOutputSize(layout.width * cols, layout.height * Math.ceil(item.frames.length / cols));
      sheet = document.createElement('canvas');
      sheet.width = layout.width * cols;
      sheet.height = layout.height * Math.ceil(item.frames.length / cols);
      sheetContext = sheet.getContext('2d');
    }
    for (let i = 0; i < item.frames.length; i++) {
      signal?.throwIfAborted();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(-layout.left, -layout.top);
      drawFrame(ctx, project, item, i, media);
      ctx.restore();
      if (kind === 'sequence') {
        const image = `frames/frame_${String(i + 1).padStart(6, '0')}.png`;
        put(prefix + image, await pngBytes(canvas));
        frames.push({ image, durationTicks: item.frames[i].durationTicks });
      } else {
        const rect = {
          x: (i % cols) * layout.width,
          y: Math.floor(i / cols) * layout.height,
          width: layout.width,
          height: layout.height,
        };
        sheetContext.drawImage(canvas, rect.x, rect.y);
        frames.push({
          image: 'spritesheet.png',
          rect,
          durationTicks: item.frames[i].durationTicks,
        });
      }
      onProgress(++completed, total);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    if (sheet) {
      put(prefix + 'spritesheet.png', await pngBytes(sheet));
      sheet.width = sheet.height = 1;
    }
    put(
      prefix + 'animation.json',
      strToU8(
        JSON.stringify({
          format: kind === 'sheet' ? 'action-composer-spritesheet' : 'action-composer-animation',
          version: 1,
          name: item.name,
          ...(kind === 'sheet'
            ? {
                kind,
                columns: cols,
                sheet: {
                  image: 'spritesheet.png',
                  width: layout.width * cols,
                  height: layout.height * Math.ceil(item.frames.length / cols),
                },
              }
            : {}),
          ticksPerSecond: project.ticksPerSecond,
          stage: {
            width: layout.width,
            height: layout.height,
            originX: layout.originX,
            originY: layout.originY,
          },
          contentOffset: {
            x: layout.left - project.stage.originX,
            y: layout.top - project.stage.originY,
          },
          padding,
          clipped: false,
          frames,
        }),
      ),
    );
    animations.push({ name: item.name, manifest: prefix + 'animation.json' });
  }
  if (groups.length > 1)
    put(
      'animations.json',
      strToU8(
        JSON.stringify({
          format: 'action-composer-animations',
          version: 1,
          kind,
          stage: {
            width: layout.width,
            height: layout.height,
            originX: layout.originX,
            originY: layout.originY,
          },
          animations,
        }),
      ),
    );
  signal?.throwIfAborted();
  return packFiles(files);
}
