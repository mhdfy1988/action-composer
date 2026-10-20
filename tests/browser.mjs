import { chromium } from '@playwright/test';
import { encode, decode } from 'fast-png';
import { unzipSync, strFromU8 } from 'fflate';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// 黑盒验证正式入口，不保留已移除的工程控件或注入内部会话。
const root = resolve('output');
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors = [],
  external = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.dismiss());
page.on('request', (r) => {
  if (!/^(http:\/\/127\.0\.0\.1:8914\/|blob:|data:)/.test(r.url())) external.push(r.url());
});
const $ = (id) => {
  const frameAction = { copyFrames: 'copy', deleteFrames: 'delete' }[id];
  return frameAction
    ? page.locator(
        `.frame-card:has(.frame-tile[aria-pressed="true"]) [data-frame-action="${frameAction}"]`,
      )
    : page.locator(`#${id}`);
};
const idle = () => page.waitForFunction(() => !document.getElementById('add').disabled);
const number = async (id, value) => {
  await $(id).fill(String(value));
  await $(id).press('Tab');
};
const value = async (id) => Number(await $(id).inputValue());
const scope = (kind) => $(kind === 'group' ? 'editGroup' : 'editFrame').click();
const selectFrame = (n) => page.getByRole('button', { name: `第 ${n} 帧`, exact: true }).click();
const action = (name) =>
  page
    .locator('#groups button')
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
const png = (name, dx = 0, factor = 1, transparent = false) => {
  const width = 64 * factor,
    height = 96 * factor,
    data = new Uint8Array(width * height * 4);
  if (!transparent)
    for (let y = 20 * factor; y < 76 * factor; y++)
      for (let x = (22 + dx) * factor; x < (42 + dx) * factor; x++) {
        const ux = Math.floor(x / factor) - dx,
          uy = Math.floor(y / factor);
        data.set(
          [
            80 + ((ux * 17 + uy * 23) % 120),
            30 + ((ux * 31 + uy * 13) % 180),
            40 + ((ux * 7 + uy * 19) % 160),
            255,
          ],
          (y * width + x) * 4,
        );
      }
  return {
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(encode({ width, height, data, channels: 4 })),
  };
};
async function add(files, name) {
  await $('framesFile').setInputFiles(files);
  await $('importDialog').waitFor({ state: 'visible' });
  await $('importName').fill(name);
  await $('importConfirm').click();
  await idle();
  await page.getByRole('button', { name: `${name} ${files.length} 帧`, exact: true }).waitFor();
}
async function reset(confirm = true) {
  await $('reset').click();
  await $('confirmDialog').waitFor({ state: 'visible' });
  await $('confirmDialog')
    .locator(`[value=${confirm ? 'confirm' : 'cancel'}]`)
    .click();
  await $('confirmDialog').waitFor({ state: 'hidden' });
  if (confirm) await page.waitForFunction(() => document.getElementById('reset').disabled);
}
let lastDownload = 0;
async function output(
  kind = 'sequence',
  range = 'current',
  filename = 'simplified-sequence.zip',
  name = '校准输出',
) {
  const wait = 250 - (Date.now() - lastDownload);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  await $('export').click();
  assert.equal(await page.locator('.inspector #padding').count(), 0);
  await $('exportScope').selectOption(range);
  await $('exportName').fill(name);
  await $('padding').fill('16');
  await $('exportKind').selectOption(kind);
  if (kind === 'sheet') await $('sheetColumns').fill('2');
  const pending = page.waitForEvent('download');
  await $('exportConfirm').click();
  const download = await pending;
  lastDownload = Date.now();
  await download.saveAs(resolve(root, filename));
  await idle();
  return unzipSync(new Uint8Array(await readFile(resolve(root, filename))));
}
function bounds(img) {
  let left = img.width,
    top = img.height;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * 4 + 3]) {
        left = Math.min(left, x);
        top = Math.min(top, y);
      }
  return { left, top };
}
const manifest = (files, path = 'animation.json') => JSON.parse(strFromU8(files[path]));
async function checkLayout() {
  const info = await page.evaluate(() => {
    const strip = document.getElementById('filmstrip'),
      timeline = document.querySelector('.timeline'),
      player = document.querySelector('.player');
    return {
      pageOverflow: document.documentElement.scrollHeight - innerHeight,
      stripOverflow: strip.scrollHeight - strip.clientHeight,
      timelineOverflow: timeline.scrollHeight - timeline.clientHeight,
      playerOverflow: player.scrollWidth - player.clientWidth,
      cardsFit: [...strip.querySelectorAll('.frame-card')].every(
        (e) =>
          e.getBoundingClientRect().bottom <=
          strip.getBoundingClientRect().top + strip.clientHeight + 1,
      ),
    };
  });
  for (const key of ['pageOverflow', 'stripOverflow', 'timelineOverflow', 'playerOverflow'])
    assert.ok(info[key] <= 1, `${key}: ${JSON.stringify(info)}`);
  assert.equal(info.cardsFit, true, JSON.stringify(info));
}
async function checkImportLayout() {
  const layout = await page.evaluate(() => {
    const dialog = document.getElementById('importDialog'),
      form = dialog.querySelector('form'),
      footer = dialog.querySelector('.dialog-actions');
    const panel = document.getElementById(
      document.getElementById('importKind').value === 'sheet' ? 'importSheetFields' : 'importOrder',
    );
    const d = dialog.getBoundingClientRect(),
      f = footer.getBoundingClientRect(),
      p = panel.getBoundingClientRect(),
      setting = document.getElementById('importKind').getBoundingClientRect();
    return {
      dialogOverflow: dialog.scrollHeight - dialog.clientHeight,
      formOverflow: form.scrollHeight - form.clientHeight,
      buttonsVisible: f.bottom <= d.bottom - 10 && f.top >= d.top,
      fits: d.top >= 0 && d.bottom <= innerHeight && d.left >= 0 && d.right <= innerWidth,
      horizontal: innerWidth > 640 ? p.left >= setting.right : p.top >= setting.bottom,
      compact: d.width <= 640,
    };
  });
  assert.ok(layout.dialogOverflow <= 1, JSON.stringify(layout));
  assert.ok(layout.formOverflow <= 1, JSON.stringify(layout));
  assert.equal(layout.buttonsVisible, true, JSON.stringify(layout));
  assert.equal(layout.fits, true, JSON.stringify(layout));
  assert.equal(layout.horizontal, true, JSON.stringify(layout));
  assert.equal(layout.compact, true, JSON.stringify(layout));
}
async function point() {
  return $('stage').evaluate((canvas) => {
    const box = canvas.getBoundingClientRect(),
      { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (
          data[i] > data[i + 1] + 30 &&
          data[i + 1] < 215 &&
          data[i + 2] < 215 &&
          Math.abs(data[i] - data[i + 1]) > 20
        )
          return {
            x: box.x + ((x + 5) * box.width) / canvas.width,
            y: box.y + ((y + 5) * box.height) / canvas.height,
          };
      }
    throw new Error('未找到角色像素');
  });
}
async function drag(cancel = false) {
  const p = await point();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 21, p.y + 16, { steps: 5 });
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
}
try {
  await page.goto('http://127.0.0.1:8914/');
  for (const id of [
    'projectName',
    'saveState',
    'new',
    'open',
    'save',
    'projectFile',
    'anchorTools',
    'experimentalTools',
    'moreOptions',
    'mark',
    'removeVertical',
    'clearFrame',
    'clearVertical',
    'groupName',
  ])
    assert.equal(await $(id).count(), 0, id);
  assert.equal(await $('redo').getAttribute('aria-label'), '恢复');
  assert.equal(await page.locator('.inspector .scope-switch #editGroup').count(), 1);
  assert.equal(await page.locator('.inspector .scope-switch #editFrame').count(), 1);
  assert.equal(await page.locator('.toolbar #editGroup').count(), 0);
  assert.equal((await $('alignFirst').innerText()).trim(), '对齐');
  for (const [id, label] of [
    ['firstOverlay', '叠加'],
    ['lockX', 'X'],
    ['lockY', 'Y'],
  ]) {
    const control = $(id).locator('..');
    assert.equal((await control.innerText()).trim(), label);
    assert.equal(await control.locator('svg').count(), 1);
    assert.ok((await control.boundingBox()).width > 32);
  }
  assert.equal(await page.locator('header #add').count(), 1);
  assert.equal(await page.locator('.library #add').count(), 0);
  assert.equal(await page.locator('.player #fitView').count(), 0);
  assert.equal(await page.locator('.toolbar #fitView').count(), 1);
  assert.equal(
    await $('fitView').evaluate((el) =>
      el.nextElementSibling.contains(document.getElementById('firstOverlay')),
    ),
    true,
  );
  for (const id of ['undo', 'redo', 'reset', 'alignFirst', 'previous', 'play', 'next', 'fitView']) {
    assert.equal(await $(id).locator('svg').count(), 1);
    assert.ok(await $(id).getAttribute('aria-label'));
    assert.ok(await $(id).getAttribute('title'));
  }
  assert.equal(await $('reset').isDisabled(), true);
  assert.match(await page.locator('.statusbar').textContent(), /刷新前请导出/);
  // 精灵图走正式文件入口；每格不同颜色，真实导出后回读像素及原点。
  const sheetData = new Uint8Array(32 * 24 * 4),
    colors = [
      [220, 40, 30, 255],
      [30, 190, 60, 255],
      [40, 70, 220, 255],
      [200, 170, 10, 255],
    ];
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 32; x++)
      sheetData.set(colors[Math.floor(y / 12) * 2 + Math.floor(x / 16)], (y * 32 + x) * 4);
  const sheetFile = {
    name: 'spritesheet.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encode({ width: 32, height: 24, data: sheetData, channels: 4 })),
  };
  await $('framesFile').setInputFiles([sheetFile]);
  await $('importDialog').waitFor({ state: 'visible' });
  await $('importKind').selectOption('sheet');
  await $('importName').fill('网格动作');
  await $('importColumns').fill('3');
  assert.equal(await $('importConfirm').isDisabled(), true);
  await $('importConfirm').hover();
  assert.equal(
    await $('importConfirm').evaluate((el) => getComputedStyle(el).backgroundColor),
    'rgb(48, 108, 169)',
  );
  await $('importColumns').fill('2');
  await $('importRows').fill('2');
  await $('importCount').fill('3');
  assert.match(await $('sheetInfo').textContent(), /3 帧.*16 × 12/);
  await $('importConfirm').hover();
  const primaryHover = await $('importConfirm').evaluate((el) => {
    const style = getComputedStyle(el);
    return { background: style.backgroundColor, color: style.color };
  });
  assert.deepEqual(primaryHover, { background: 'rgb(40, 93, 148)', color: 'rgb(255, 255, 255)' });
  await checkImportLayout();
  await page.setViewportSize({ width: 520, height: 720 });
  await checkImportLayout();
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.screenshot({ path: resolve(root, 'spritesheet-import.png') });
  await $('importConfirm').click();
  await idle();
  assert.equal(await $('frameInfo').textContent(), '1 / 3');
  const gridFiles = await output('sequence', 'current', 'import-grid.zip'),
    gridManifest = manifest(gridFiles);
  for (const [i, f] of gridManifest.frames.entries()) {
    const image = decode(gridFiles[f.image]);
    assert.deepEqual(
      Array.from(image.data.slice((16 * image.width + 16) * 4, (16 * image.width + 16) * 4 + 4)),
      colors[i],
    );
  }
  await $('undo').click();
  const inputManifest = {
    format: 'action-composer-spritesheet',
    version: 1,
    ticksPerSecond: 60000,
    sheet: { image: 'spritesheet.png', width: 32, height: 24 },
    stage: { width: 16, height: 12, originX: 3, originY: 8 },
    frames: [0, 1, 2].map((i) => ({
      image: 'spritesheet.png',
      durationTicks: (i + 1) * 1000,
      rect: { x: (i % 2) * 16, y: Math.floor(i / 2) * 12, width: 16, height: 12 },
    })),
  };
  await $('framesFile').setInputFiles([
    sheetFile,
    {
      name: 'animation.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(inputManifest)),
    },
  ]);
  await $('importDialog').waitFor({ state: 'visible' });
  assert.equal(await $('importKind').inputValue(), 'sheet');
  assert.equal(await $('importFps').isDisabled(), true);
  await $('importConfirm').click();
  await idle();
  await scope('group');
  assert.equal(await value('horizontalOffset'), 5);
  assert.equal(await value('verticalOffset'), 4);
  const roundtrip = await output('sheet', 'current', 'import-sheet-roundtrip.zip'),
    roundManifest = manifest(roundtrip);
  assert.deepEqual(
    roundManifest.frames.map((f) => f.durationTicks),
    [1000, 2000, 3000],
  );
  assert.equal(roundManifest.stage.originX, 19);
  assert.equal(roundManifest.stage.originY, 24);
  await $('undo').click();
  await $('framesFile').setInputFiles(
    ['spritesheet.png', 'animation.json'].map((name) => ({
      name,
      mimeType: name.endsWith('.png') ? 'image/png' : 'application/json',
      buffer: Buffer.from(roundtrip[name]),
    })),
  );
  await $('importDialog').waitFor({ state: 'visible' });
  await $('importConfirm').click();
  await idle();
  const finalFiles = await output('sequence', 'current', 'import-sheet-restored.zip'),
    finalManifest = manifest(finalFiles);
  assert.deepEqual(finalManifest.stage, roundManifest.stage);
  assert.deepEqual(
    finalManifest.frames.map((f) => f.durationTicks),
    [1000, 2000, 3000],
  );
  for (const [i, f] of finalManifest.frames.entries()) {
    const img = decode(finalFiles[f.image]);
    assert.deepEqual(
      Array.from(img.data.slice((16 * img.width + 16) * 4, (16 * img.width + 16) * 4 + 4)),
      colors[i],
    );
  }
  await $('undo').click();
  assert.equal(await page.locator('#groups button').count(), 0);
  // 导入列表移除箭头，拖动首帧到最后是插入而非互换，时长与图片仍绑定。
  const orderedFiles = [0, 1, 2, 3].map((i) => png(`sort_${i + 1}.png`, i * 2));
  const orderedManifest = {
    format: 'action-composer-animation',
    version: 1,
    ticksPerSecond: 60000,
    frames: orderedFiles.map((f, i) => ({ image: f.name, durationTicks: (i + 1) * 1000 })),
  };
  await $('framesFile').setInputFiles([
    ...orderedFiles,
    {
      name: 'animation.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(orderedManifest)),
    },
  ]);
  await $('importDialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#importOrder button').count(), 0);
  await page
    .locator('.order-row')
    .nth(0)
    .dragTo(page.locator('.order-row').nth(3), { targetPosition: { x: 120, y: 29 } });
  const orderLabels = () => page.locator('.order-row').allTextContents();
  assert.deepEqual(await orderLabels(), [
    '1. sort_2.png',
    '2. sort_3.png',
    '3. sort_4.png',
    '4. sort_1.png',
  ]);
  await page.locator('.order-row').nth(3).press('Alt+ArrowUp');
  assert.match((await orderLabels())[2], /sort_1/);
  await page.locator('.order-row').nth(2).press('Alt+ArrowDown');
  await page.screenshot({ path: resolve(root, 'import-drag-order.png') });
  await $('importConfirm').click();
  await idle();
  const sortedOutput = await output('sequence', 'current', 'import-drag-order.zip'),
    sortedManifest = manifest(sortedOutput);
  assert.deepEqual(
    sortedManifest.frames.map((f) => f.durationTicks),
    [2000, 3000, 4000, 1000],
  );
  assert.deepEqual(
    sortedManifest.frames.map((f) => bounds(decode(sortedOutput[f.image])).left),
    [18, 20, 22, 16],
  );
  await $('undo').click();
  // 120帧列表只在右侧滚动，桌面／短屏／窄屏的确认按钮始终可见。
  await $('framesFile').setInputFiles(
    Array.from({ length: 120 }, (_, i) => png(`frame_${String(i + 1).padStart(6, '0')}.png`)),
  );
  await $('importDialog').waitFor({ state: 'visible' });
  for (const viewport of [
    { width: 1600, height: 900 },
    { width: 1536, height: 658 },
    { width: 1024, height: 640 },
    { width: 520, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await checkImportLayout();
  }
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.screenshot({ path: resolve(root, 'import-horizontal.png') });
  await $('importCancel').click();
  // 取消后立即重新导入，异步 close 不应清空下一轮文件。
  await $('framesFile').setInputFiles([png('01.png')]);
  await $('importDialog').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await add([png('01.png'), png('02.png', 4)], '动作A');
  await $('next').click();
  assert.equal(await $('frameInfo').textContent(), '2 / 2');
  await $('previous').click();
  assert.equal(await $('frameInfo').textContent(), '1 / 2');
  const initialZoom = await $('viewInfo').textContent(),
    canvasBox = await $('stage').boundingBox();
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await page.mouse.wheel(0, 200);
  await page.waitForFunction(
    (text) => document.getElementById('viewInfo').textContent !== text,
    initialZoom,
  );
  await $('fitView').click();
  assert.equal(await $('viewInfo').textContent(), initialZoom);
  assert.equal(await $('reset').isDisabled(), true); // 观察取景不产生变换记录。
  assert.equal(await $('frameAdjustTitle').textContent(), '整组调整');
  assert.equal(await $('editFrameInfo').isVisible(), false);
  await selectFrame(2);
  await scope('frame');
  assert.equal(await $('groupScale').isVisible(), false);
  assert.equal(await $('editFrameInfo').textContent(), '第 2 帧');
  await number('verticalOffset', 20);
  await number('horizontalOffset', 3);
  await selectFrame(1);
  await number('verticalOffset', 7);
  await scope('group');
  await number('groupScale', 150);
  await number('horizontalOffset', 15);
  await number('verticalOffset', -5);
  await reset(false);
  assert.equal(await value('groupScale'), 150);
  await reset();
  assert.deepEqual(
    [await value('groupScale'), await value('horizontalOffset'), await value('verticalOffset')],
    [100, 0, 0],
  );
  await scope('frame');
  assert.equal(await value('verticalOffset'), 7);
  await selectFrame(2);
  assert.deepEqual([await value('horizontalOffset'), await value('verticalOffset')], [3, 20]);
  await $('undo').click();
  await scope('group');
  assert.equal(await value('groupScale'), 150);
  await $('redo').click();
  assert.equal(await value('groupScale'), 100);
  await scope('frame');
  await reset();
  assert.deepEqual([await value('horizontalOffset'), await value('verticalOffset')], [0, 0]);
  await $('undo').click();
  assert.equal(await value('verticalOffset'), 20);
  await $('redo').click();
  assert.equal(await value('verticalOffset'), 0);
  await selectFrame(1);
  assert.equal(await value('verticalOffset'), 7);
  await reset();
  await selectFrame(2);
  await scope('frame');
  await $('stage').press('ArrowRight');
  await $('stage').press('Shift+ArrowDown');
  assert.deepEqual([await value('horizontalOffset'), await value('verticalOffset')], [1, 10]);
  await drag();
  assert.ok((await value('horizontalOffset')) > 1);
  await $('undo').click();
  assert.deepEqual([await value('horizontalOffset'), await value('verticalOffset')], [1, 10]);
  await drag(true);
  assert.equal(await value('horizontalOffset'), 1);
  await $('lockX').check();
  await $('stage').focus();
  await $('stage').press('ArrowRight');
  assert.equal(await value('horizontalOffset'), 1);
  await $('lockX').uncheck();
  const before = await $('stage').evaluate((el) => el.toDataURL());
  await $('firstOverlay').check();
  assert.notEqual(await $('stage').evaluate((el) => el.toDataURL()), before);
  await page.screenshot({ path: resolve(root, 'simplified-frame.png') });
  // 保留整组四角缩放及单笔撤销，不因新增数值区改变既有手势。
  await scope('group');
  const box = await $('stage').boundingBox();
  const unit = Math.min((box.width - 56) / 128, (box.height - 56) / 160);
  const corner = {
    x: box.x + (box.width - 128 * unit) / 2 + 97 * unit,
    y: box.y + (box.height - 160 * unit) / 2 + 138 * unit,
  };
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x + 10 * unit, corner.y + 12 * unit, { steps: 5 });
  await page.mouse.up();
  assert.ok((await value('groupScale')) > 100);
  await $('undo').click();
  assert.equal(await value('groupScale'), 100);
  await scope('frame');
  assert.deepEqual([await value('horizontalOffset'), await value('verticalOffset')], [1, 10]);
  const seq = await output();
  const meta = manifest(seq),
    a = decode(seq[meta.frames[0].image]),
    b = decode(seq[meta.frames[1].image]);
  assert.equal(meta.name, '校准输出');
  assert.equal(await $('activeAction').textContent(), '动作A');
  assert.equal(bounds(b).left - bounds(a).left, 5);
  assert.equal(bounds(b).top - bounds(a).top, 10);
  assert.equal(a.data[3], 0);
  const sheetFiles = await output('sheet', 'current', 'simplified-sheet.zip');
  const sm = manifest(sheetFiles),
    sheet = decode(sheetFiles['spritesheet.png']);
  assert.equal(sm.format, 'action-composer-spritesheet');
  assert.deepEqual(sm.stage, meta.stage);
  for (const [index, img] of [a, b].entries())
    for (let y = 0; y < img.height; y++)
      assert.deepEqual(
        sheet.data.slice(
          (y * sheet.width + index * img.width) * 4,
          (y * sheet.width + (index + 1) * img.width) * 4,
        ),
        img.data.slice(y * img.width * 4, (y + 1) * img.width * 4),
      );
  // 对齐的事务也进入整组记录，且帧修正不被清空。
  await add([png('big.png', 0, 2)], '动作B');
  await scope('frame');
  await number('horizontalOffset', 2);
  await number('verticalOffset', 4);
  await action('动作A');
  await $('alignFirst').click();
  await idle();
  assert.match(await $('status').textContent(), /已对齐 1 个/);
  await action('动作B');
  await scope('group');
  assert.ok(Math.abs((await value('groupScale')) - 50) < 5);
  await scope('frame');
  const scaled = await value('horizontalOffset');
  assert.ok(scaled > 0 && scaled < 2);
  await scope('group');
  await reset();
  assert.equal(await value('groupScale'), 100);
  await scope('frame');
  assert.deepEqual([await value('horizontalOffset'), await value('verticalOffset')], [2, 4]);
  const all = await output('sequence', 'all', 'simplified-all.zip', '动作素材');
  const batch = manifest(all, 'animations.json');
  assert.equal(batch.animations.length, 2);
  for (const entry of batch.animations) {
    const m = manifest(all, entry.manifest);
    assert.deepEqual(m.stage, batch.stage);
    const prefix = entry.manifest.slice(0, -14);
    for (const f of m.frames) {
      const img = decode(all[prefix + f.image]);
      assert.deepEqual([img.width, img.height], [batch.stage.width, batch.stage.height]);
    }
  }
  const allSheets = await output('sheet', 'all', 'simplified-all-sheets.zip', '动作素材');
  const sheetBatch = manifest(allSheets, 'animations.json');
  assert.deepEqual(sheetBatch.stage, batch.stage);
  for (const entry of sheetBatch.animations) {
    const m = manifest(allSheets, entry.manifest),
      prefix = entry.manifest.slice(0, -14);
    const img = decode(allSheets[prefix + 'spritesheet.png']);
    assert.deepEqual(m.stage, batch.stage);
    assert.deepEqual([img.width, img.height], [m.sheet.width, m.sheet.height]);
  }
  // 延迟编码以覆盖任务中取消，不下载部分产物、不改变修正。
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    window.restoreBlob = () => {
      HTMLCanvasElement.prototype.toBlob = original;
    };
    HTMLCanvasElement.prototype.toBlob = function (...args) {
      setTimeout(() => original.apply(this, args), 150);
    };
  });
  let cancelledDownload = false;
  const onDownload = () => {
    cancelledDownload = true;
  };
  page.on('download', onDownload);
  await $('export').click();
  await $('exportScope').selectOption('current');
  await $('exportKind').selectOption('sequence');
  await $('exportConfirm').click();
  await $('cancelTask').click();
  await page.waitForFunction(() =>
    document.getElementById('status').textContent.includes('任务已取消'),
  );
  await page.evaluate(() => {
    window.restoreBlob();
    delete window.restoreBlob;
  });
  page.off('download', onDownload);
  assert.equal(cancelledDownload, false);
  assert.deepEqual([await value('horizontalOffset'), await value('verticalOffset')], [2, 4]);
  // 播放期间取消当前项自动切换到剩余可见项，列表节点不被换帧替换。
  await $('play').click();
  assert.equal(await $('play').getAttribute('aria-label'), '暂停');
  assert.equal(await $('play').getAttribute('data-rendered-icon'), 'pause');
  await page.getByRole('checkbox', { name: '显示动作：动作B', exact: true }).uncheck();
  assert.equal(await $('activeAction').textContent(), '动作A');
  await page.getByRole('checkbox', { name: '显示动作：动作A', exact: true }).uncheck();
  assert.equal(await $('activeAction').textContent(), '未选择动作');
  assert.equal(await $('play').isDisabled(), true);
  assert.equal(await $('play').getAttribute('aria-label'), '播放');
  await page.getByRole('checkbox', { name: '显示动作：动作A', exact: true }).check();
  await $('export').click();
  await $('exportCancel').click();
  assert.equal(await $('exportDialog').isVisible(), false);
  await page.setViewportSize({ width: 1024, height: 640 });
  await checkLayout();
  await page.screenshot({ path: resolve(root, 'simplified-short-screen.png') });
  assert.ok((await $('stage').boundingBox()).height > 100);
  const fixtures = process.env.ACTION_COMPOSER_REAL_FIXTURE;
  if (fixtures) {
    await page.setViewportSize({ width: 1600, height: 900 });
    const paths = (await readdir(resolve(fixtures, 'jump-right')))
      .filter((n) => n.endsWith('.png'))
      .sort()
      .map((n) => resolve(fixtures, 'jump-right', n));
    await add(paths, '浣熊跳跃');
    for (const name of ['动作A', '动作B'])
      await page.getByRole('checkbox', { name: `显示动作：${name}`, exact: true }).uncheck();
    await selectFrame(8);
    await scope('frame');
    await $('stage').press('Shift+ArrowDown');
    await page.screenshot({ path: resolve(root, 'simplified-real.png'), animations: 'disabled' });
    const real = await output('sequence', 'current', 'simplified-real.zip', '浣熊跳跃'),
      rm = manifest(real);
    assert.equal(rm.frames.length, 13);
    for (const f of rm.frames) {
      const img = decode(real[f.image]);
      assert.deepEqual([img.width, img.height, img.channels], [rm.stage.width, rm.stage.height, 4]);
    }
    await scope('group');
    await page
      .locator('.action-row')
      .filter({ has: page.getByRole('button', { name: '浣熊跳跃 13 帧', exact: true }) })
      .hover();
    await page.screenshot({
      path: resolve(root, 'action-tools-subtle.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 1536, height: 658 });
    await checkLayout();
    await page.screenshot({
      path: resolve(root, 'single-frame-short-screen.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.screenshot({
      path: resolve(root, 'simplified-real-group.png'),
      animations: 'disabled',
    });
    await $('export').click();
    await page.screenshot({ path: resolve(root, 'simplified-export-dialog.png') });
    await $('exportCancel').click();
  }
  // 动作列表排序不切换当前动作、不更改显隐或帧参数；批量导出沿用新顺序。
  const actionNames = () => page.locator('#groups .group-item > span').allTextContents();
  const originalActions = await actionNames(),
    activeBefore = await $('activeAction').textContent(),
    frameBefore = await $('frameInfo').textContent();
  const checksBefore = await page
    .locator('#groups input')
    .evaluateAll((elements) =>
      elements.map((el) => [el.getAttribute('aria-label'), el.checked]).sort(),
    );
  const lastAction = page.locator('.action-row').last(),
    lastActionBox = await lastAction.boundingBox();
  await page
    .locator('.action-row')
    .first()
    .dragTo(lastAction, {
      sourcePosition: { x: 60, y: 15 },
      targetPosition: { x: 60, y: lastActionBox.height - 5 },
    });
  const reorderedActions = [...originalActions.slice(1), originalActions[0]];
  assert.deepEqual(await actionNames(), reorderedActions);
  assert.equal(await $('activeAction').textContent(), activeBefore);
  assert.equal(await $('frameInfo').textContent(), frameBefore);
  assert.deepEqual(
    await page
      .locator('#groups input')
      .evaluateAll((elements) =>
        elements.map((el) => [el.getAttribute('aria-label'), el.checked]).sort(),
      ),
    checksBefore,
  );
  await page.screenshot({ path: resolve(root, 'action-drag-order.png'), animations: 'disabled' });
  const actionOrderFiles = await output('sequence', 'all', 'action-drag-order.zip');
  assert.deepEqual(
    manifest(actionOrderFiles, 'animations.json').animations.map((a) => a.name),
    reorderedActions,
  );
  await $('undo').click();
  assert.deepEqual(await actionNames(), originalActions);
  await $('redo').click();
  assert.deepEqual(await actionNames(), reorderedActions);
  await $('undo').click();
  // 单选、单帧排序、复制与粘贴分离；Ctrl／Shift 不再创建多选。
  await add([png('m1.png'), png('m2.png', 2), png('m3.png', 4), png('m4.png', 6)], '帧管理测试');
  for (const check of await page.locator('#groups input[type=checkbox]').all())
    if ((await check.getAttribute('aria-label')) !== '显示动作：帧管理测试') await check.uncheck();
  await selectFrame(1);
  await number('frameDuration', 110);
  await selectFrame(3);
  await number('frameDuration', 230);
  await selectFrame(1);
  await page
    .getByRole('button', { name: '第 3 帧', exact: true })
    .click({ modifiers: ['Control'] });
  assert.equal(await $('selectedFrameCount').count(), 0);
  assert.equal(await $('selectAllFrames').count(), 0);
  assert.equal(await page.locator('#filmstrip input').count(), 0);
  assert.equal(await page.locator('#filmstrip [aria-pressed=true]').count(), 1);
  await scope('frame');
  await $('stage').focus();
  await $('stage').press('Shift+ArrowDown');
  assert.equal(await value('verticalOffset'), 10);
  const batchBefore = await value('horizontalOffset');
  await drag();
  assert.notEqual(await value('horizontalOffset'), batchBefore);
  const batchAfterX = await value('horizontalOffset'),
    batchAfterY = await value('verticalOffset');
  await selectFrame(1);
  assert.equal(await value('horizontalOffset'), 0);
  assert.equal(await value('verticalOffset'), 0);
  await $('undo').click();
  assert.equal(await value('horizontalOffset'), batchBefore);
  await selectFrame(1);
  assert.equal(await value('verticalOffset'), 0);
  await selectFrame(3);
  assert.equal(await value('verticalOffset'), 10);
  await page
    .locator('.frame-card')
    .nth(2)
    .dragTo(page.locator('.frame-card').nth(3), { targetPosition: { x: 90, y: 40 } });
  assert.equal(await $('frameInfo').textContent(), '4 / 4');
  assert.equal(await value('frameDuration'), 230);
  await selectFrame(1);
  assert.equal(await value('frameDuration'), 110);
  assert.equal(await value('verticalOffset'), 0);
  await selectFrame(4);
  await reset();
  assert.equal(await value('verticalOffset'), 0);
  await $('undo').click();
  assert.equal(await value('verticalOffset'), 10);
  await selectFrame(3);
  await page.getByRole('button', { name: '第 4 帧', exact: true }).click({ modifiers: ['Shift'] });
  assert.equal(await page.locator('#filmstrip [aria-pressed=true]').count(), 1);
  assert.equal(await page.locator('#pasteFrame').count(), 0);
  assert.equal(await page.locator('.player .frame-actions').count(), 0);
  assert.equal(await $('copyFrames').count(), 1);
  await page.locator('.frame-card').nth(0).hover();
  assert.equal(await page.locator('.frame-actions').count(), 4);
  assert.equal(await $('frameInfo').textContent(), '4 / 4');
  assert.equal(
    await page
      .locator('.frame-card')
      .nth(0)
      .locator('.frame-actions')
      .evaluate((el) => getComputedStyle(el).opacity),
    '1',
  );
  await page
    .locator('.frame-card')
    .nth(0)
    .getByRole('button', { name: '复制此帧', exact: true })
    .click();
  assert.equal(await $('frameInfo').textContent(), '2 / 5');
  assert.equal(await value('frameDuration'), 110);
  assert.equal(await value('verticalOffset'), 0);
  await $('undo').click();
  await selectFrame(4);
  await page.locator('.frame-card').nth(0).hover();
  await page
    .locator('.frame-card')
    .nth(0)
    .getByRole('button', { name: '删除此帧', exact: true })
    .click();
  await $('confirmDialog').locator('[value=confirm]').click();
  await page.waitForFunction(() => document.querySelectorAll('.frame-card').length === 3);
  await $('undo').click();
  assert.equal(await page.locator('.frame-card').count(), 4);
  await selectFrame(4);
  await $('stage').click({ position: { x: 10, y: 10 } });
  assert.equal(
    await page
      .locator('.frame-actions')
      .first()
      .evaluate((el) => getComputedStyle(el).opacity),
    '0',
  );
  await page.locator('.frame-card').nth(3).hover();
  assert.equal(
    await page
      .locator('.frame-actions')
      .nth(3)
      .evaluate((el) => getComputedStyle(el).opacity),
    '1',
  );
  const toolSize = await $('copyFrames').boundingBox();
  assert.equal(toolSize.width, 20);
  assert.equal(toolSize.height, 20);
  const frameToolsStyle = await page
    .locator('.frame-actions')
    .nth(3)
    .evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, shadow: style.boxShadow };
    });
  assert.deepEqual(frameToolsStyle, { background: 'rgba(0, 0, 0, 0)', shadow: 'none' });
  await $('copyFrames').hover();
  assert.equal(
    await $('copyFrames').evaluate((el) => getComputedStyle(el).backgroundColor),
    'rgba(48, 108, 169, 0.04)',
  );
  await $('copyFrames').click();
  assert.equal(await page.locator('.frame-card').count(), 5);
  assert.equal(await $('frameInfo').textContent(), '5 / 5');
  assert.equal(await value('frameDuration'), 230);
  assert.equal(await value('verticalOffset'), 10);
  await page.locator('.frame-card').nth(4).hover();
  await $('deleteFrames').click();
  await $('confirmDialog').locator('[value=cancel]').click();
  assert.equal(await page.locator('.frame-card').count(), 5);
  await page.locator('.frame-card').nth(4).hover();
  await $('deleteFrames').click();
  await $('confirmDialog').locator('[value=confirm]').click();
  await page.waitForFunction(() => document.querySelectorAll('.frame-card').length === 4);
  await $('undo').click();
  assert.equal(await page.locator('.frame-card').count(), 5);
  await $('redo').click();
  assert.equal(await page.locator('.frame-card').count(), 4);
  const managedRow = page
    .locator('.action-row')
    .filter({ has: page.getByRole('button', { name: '帧管理测试 4 帧', exact: true }) });
  await managedRow.hover();
  assert.equal(
    await managedRow
      .locator('.action-tools')
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    'rgba(0, 0, 0, 0)',
  );
  const renameTool = managedRow.getByRole('button', { name: '修改动作名称', exact: true });
  assert.equal((await renameTool.boundingBox()).width, 20);
  assert.equal(
    await renameTool.evaluate((el) => getComputedStyle(el).backgroundColor),
    'rgba(0, 0, 0, 0)',
  );
  await managedRow.getByRole('button', { name: '修改动作名称', exact: true }).click();
  await $('renameName').fill('调整后的动作');
  await $('renameConfirm').click();
  await page.getByRole('button', { name: '调整后的动作 4 帧', exact: true }).waitFor();
  const managedOutput = await output('sequence', 'current', 'frame-management.zip', '调整后的动作');
  assert.deepEqual(
    manifest(managedOutput).frames.map((f) => f.durationTicks),
    [6600, 5000, 5000, 13800],
  );
  await page.screenshot({ path: resolve(root, 'frame-management.png'), animations: 'disabled' });
  await checkLayout();
  const restored = page
    .locator('.action-row')
    .filter({ has: page.getByRole('button', { name: '调整后的动作 4 帧', exact: true }) });
  await restored.hover();
  await restored.getByRole('button', { name: '删除动作', exact: true }).click();
  await $('confirmDialog').locator('[value=confirm]').click();
  await page
    .getByRole('button', { name: '调整后的动作 4 帧', exact: true })
    .waitFor({ state: 'hidden' });
  await $('undo').click();
  await page.getByRole('button', { name: '调整后的动作 4 帧', exact: true }).waitFor();
  // 删除最后一个动作后空状态仍可导入，撤销恢复动作而非悬空引用。
  while (await page.locator('.action-row').count()) {
    const row = page.locator('.action-row').first();
    const oldCount = await page.locator('.action-row').count();
    await row.hover();
    await row.getByRole('button', { name: '删除动作', exact: true }).click();
    await $('confirmDialog').locator('[value=confirm]').click();
    await page.waitForFunction(
      (count) => document.querySelectorAll('.action-row').length === count - 1,
      oldCount,
    );
  }
  assert.equal(await $('frameInfo').textContent(), '0 / 0');
  assert.equal(await page.locator('[data-frame-action]').count(), 0);
  await $('undo').click();
  assert.ok(await page.locator('.frame-card').count());
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    '浏览器通过：正式界面精简、范围信息切换、记录回溯重置及撤销／恢复、鼠标／键盘、首帧对齐保留修正、PNG与精灵图像素、批量原点、播放勾选、短屏及可选真实素材',
  );
} catch (e) {
  await page.screenshot({ path: resolve(root, 'failure.png') });
  console.error('状态', await $('status').textContent(), errors);
  throw e;
} finally {
  await context.close();
  await browser.close();
}
