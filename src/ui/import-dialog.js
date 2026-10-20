import { decodePng } from '../infrastructure/media.js';
import { orderFromManifest } from '../infrastructure/frame-manifest.js';
import { gridPlan, manifestSheetPlan } from '../infrastructure/spritesheet-import.js';
import { createView } from './dom.js';
import { renderOrder } from './import-order.js';

// 导入草稿和预览位图只属于此流程，确认后素材交给会话。
export function createImportDialog({ isBusy, onSubmit, onError, parent = document.body }) {
  const { element: dialog, get: $ } = createView(`<dialog id="importDialog">
      <form method="dialog">
        <h2>导入动作帧</h2>
        <label
          >导入方式<select id="importKind">
            <option value="frames">PNG 序列</option>
            <option value="sheet">精灵图</option>
          </select></label
        >
        <fieldset id="importSheetFields" hidden>
          <div class="sheet-grid-fields">
            <label
              >列数<input id="importColumns" type="number" min="1" max="120" value="1" required
            /></label>
            <label
              >行数<input id="importRows" type="number" min="1" max="120" value="1" required
            /></label>
            <label
              >有效帧数<input id="importCount" type="number" min="1" max="120" value="1" required
            /></label>
          </div>
          <canvas id="sheetPreview" aria-label="精灵图切片预览"></canvas>
          <p id="sheetInfo" class="muted" role="status"></p>
        </fieldset>
        <label>动作名称<input id="importName" maxlength="160" required /></label
        ><label
          >播放帧率<input
            id="importFps"
            type="number"
            min="1"
            max="60"
            value="12"
            step="1"
            required
        /></label>
        <p id="manifestInfo" class="muted">默认按文件名自然排序；确认前可调整顺序。</p>
        <div id="importOrder" class="import-order"></div>
        <div class="dialog-actions">
          <button id="importCancel" type="button">取消</button
          ><button id="importConfirm" type="submit" class="primary">导入</button>
        </div>
      </form>
    </dialog>`);
  const input = document.createElement('input');
  input.id = 'framesFile';
  input.type = 'file';
  input.accept = 'image/png,.png,.json';
  input.multiple = true;
  input.hidden = true;
  parent.append(input, dialog);
  let pendingFiles = [],
    pendingTimings = null,
    importGeneration = 0;
  let sheetSource = null,
    sheetPlan = null;
  function clearSheet() {
    sheetSource?.image.close();
    sheetSource = null;
    sheetPlan = null;
  }
  function updateSheet() {
    const isSheet = $('importKind').value === 'sheet';
    $('importSheetFields').hidden = !isSheet;
    $('importOrder').hidden = isSheet;
    $('importFps').disabled = Boolean(pendingTimings) || Boolean(isSheet && sheetSource?.plan);
    $('importConfirm').disabled = false;
    if (!isSheet || !sheetSource) return;
    try {
      sheetPlan =
        sheetSource.plan ??
        gridPlan(
          sheetSource.asset.width,
          sheetSource.asset.height,
          Number($('importColumns').value),
          Number($('importRows').value),
          Number($('importCount').value),
        );
      const preview = $('sheetPreview'),
        factor = Math.min(560 / sheetSource.image.width, 260 / sheetSource.image.height);
      preview.width = Math.max(1, Math.round(sheetSource.image.width * factor));
      preview.height = Math.max(1, Math.round(sheetSource.image.height * factor));
      const ctx = preview.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sheetSource.image, 0, 0, preview.width, preview.height);
      ctx.strokeStyle = '#8fdbff';
      ctx.lineWidth = 1;
      for (const { rect } of sheetPlan.frames)
        ctx.strokeRect(
          rect.x * factor + 0.5,
          rect.y * factor + 0.5,
          Math.max(0, rect.width * factor - 1),
          Math.max(0, rect.height * factor - 1),
        );
      const r = sheetPlan.frames[0].rect;
      $('sheetInfo').textContent =
        `${sheetPlan.frames.length} 帧 · 每帧 ${r.width} × ${r.height} px · 从左到右、从上到下`;
    } catch (error) {
      sheetPlan = null;
      $('sheetInfo').textContent = error.message;
      $('importConfirm').disabled = true;
    }
  }
  $('importKind').onchange = updateSheet;
  for (const id of ['importColumns', 'importRows', 'importCount']) $(id).oninput = updateSheet;
  input.onchange = async (e) => {
    const chosen = [...e.target.files];
    e.target.value = '';
    if (!chosen.length || isBusy()) return;
    const generation = ++importGeneration;
    clearSheet();
    $('importKind').value = 'frames';
    $('importKind').disabled = false;
    $('importSheetFields').disabled = false;
    $('importColumns').value = $('importRows').value = $('importCount').value = '1';
    pendingTimings = null;
    const loadSheet = async (file) => {
      if (file.size > 20 * 1024 * 1024) throw new Error('单张 PNG 最多 20 MB');
      const loaded = await decodePng(new Uint8Array(await file.arrayBuffer()), file.name);
      if (generation !== importGeneration || isBusy()) {
        loaded.image.close();
        throw new Error('导入已被替换');
      }
      return loaded;
    };
    try {
      const manifests = chosen.filter((f) => /\.json$/i.test(f.name));
      if (manifests.length > 1) throw new Error('一次只能附带一个帧清单');
      pendingFiles = chosen
        .filter((f) => !/\.json$/i.test(f.name))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
      if (new Set(pendingFiles.map((f) => f.name)).size !== pendingFiles.length)
        throw new Error('图片文件名重复');
      if (manifests.length) {
        if (manifests[0].size > 2 * 1024 * 1024) throw new Error('帧清单超过 2 MB');
        const manifest = JSON.parse(await manifests[0].text());
        if (generation !== importGeneration || isBusy()) return;
        if (manifest.format === 'action-composer-spritesheet') {
          if (pendingFiles.length !== 1) throw new Error('请同时选择一张精灵图 PNG 和对应 JSON');
          sheetSource = await loadSheet(pendingFiles[0]);
          sheetSource.plan = manifestSheetPlan(
            manifest,
            pendingFiles[0],
            sheetSource.asset.width,
            sheetSource.asset.height,
          );
          $('importColumns').value = String(sheetSource.asset.width / manifest.stage.width);
          $('importRows').value = String(sheetSource.asset.height / manifest.stage.height);
          $('importCount').value = String(manifest.frames.length);
          $('importKind').value = 'sheet';
          $('importKind').disabled = true;
          $('importSheetFields').disabled = true;
        } else {
          const ordered = orderFromManifest(manifest, pendingFiles);
          pendingFiles = ordered.files;
          pendingTimings = ordered.timings;
        }
      }
      if (pendingFiles.length === 1 && !sheetSource) sheetSource = await loadSheet(pendingFiles[0]);
      if (generation !== importGeneration || isBusy()) {
        clearSheet();
        return;
      }
      if (pendingFiles.length !== 1 || pendingTimings) $('importKind').disabled = true;
    } catch (error) {
      if (generation !== importGeneration) return;
      clearSheet();
      pendingFiles = [];
      onError(error.message);
      return;
    }
    if (!pendingFiles.length) {
      onError('请同时选择清单引用的 PNG 图片');
      return;
    }
    if (pendingFiles.length > 120) {
      onError('每组最多 120 帧');
      pendingFiles = [];
      return;
    }
    $('importName').value = pendingFiles[0].name.replace(/\.[^.]+$/, '').slice(0, 160);
    $('importFps').disabled = Boolean(pendingTimings);
    $('manifestInfo').textContent = sheetSource?.plan
      ? '已读取精灵图清单：保留切片顺序、帧时长和原点。'
      : pendingTimings
        ? '已采用清单的顺序和帧时长；可调整顺序，单帧时长保留。'
        : pendingFiles.length === 1
          ? '单图可切换为精灵图，按行列切帧；末行空格用有效帧数排除。'
          : '默认按文件名自然排序；可调整顺序，或同时选择受支持的 JSON 帧清单。';
    const order = () =>
      renderOrder($('importOrder'), pendingFiles, (from, to) => {
        const [file] = pendingFiles.splice(from, 1);
        pendingFiles.splice(to, 0, file);
        order();
      });
    order();
    updateSheet();
    $('importDialog').showModal();
  };
  // close 事件异步到达，不能用它清理下一轮已经选中的文件。
  $('importCancel').onclick = () => {
    clearSheet();
    pendingFiles = [];
    pendingTimings = null;
    $('importDialog').close('cancel');
  };
  $('importDialog').addEventListener('cancel', () => {
    clearSheet();
    pendingFiles = [];
    pendingTimings = null;
  });
  $('importDialog').querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('importName').value.trim(),
      fps = Number($('importFps').value);
    if (!name || !Number.isInteger(fps) || fps < 1 || fps > 60) return;
    const isSheet = $('importKind').value === 'sheet';
    if (isSheet && !sheetPlan) return;
    const source = sheetSource,
      plan = isSheet ? sheetPlan : null;
    sheetSource = sheetPlan = null;
    const files = [...pendingFiles],
      timings = pendingTimings;
    pendingFiles = [];
    pendingTimings = null;
    $('importDialog').close('import');
    await onSubmit({ files, timings, name, fps, source, plan });
  };
  return {
    open() {
      if (!isBusy()) input.click();
    },
  };
}
