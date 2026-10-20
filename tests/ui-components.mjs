import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

// 独立页面仅加载组件公开接口，不启动工作台或注入其内部会话。
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/dist/app.js', (route) =>
  route.fulfill({ contentType: 'text/javascript', body: '' }),
);
try {
  await page.goto('http://127.0.0.1:8914/');
  const result = await page.evaluate(async () => {
    const { createInspector } = await import('/src/ui/inspector.js');
    const { createToolbar } = await import('/src/ui/toolbar.js');
    const { createTimeline } = await import('/src/ui/timeline.js');
    const { createRenameDialog } = await import('/src/ui/rename-dialog.js');
    const { createConfirmDialog } = await import('/src/ui/confirm-dialog.js');
    const { createExportDialog } = await import('/src/ui/export-dialog.js');
    // 同一文档内相同测试ID不能串实例；任何退回全局ID查询的实现都会失败。
    document.getElementById = () => {
      throw new Error('组件不允许全局ID查询');
    };
    const get = (component, id) => component.element.querySelector(`[id="${id}"]`);
    const change = (node, value) => {
      node.value = value;
      node.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const group = (id) => ({
      id,
      name: id,
      scale: 2,
      x: 4,
      y: 9,
      lockX: false,
      lockY: false,
      anchors: [null],
      frames: [
        {
          id: `${id}-f`,
          assetId: 'image',
          durationTicks: 5000,
          horizontalOffset: 3,
          verticalOffset: 5,
        },
      ],
    });
    const a = group('A'),
      b = group('B');
    let scope = 'group';
    const scopes = [];
    const inspector = (g) =>
      createInspector({
        groupEdit: (edit) => edit(g),
        sync() {},
        readContext: () => ({ scope, frame: 0 }),
        onScope: (value) => scopes.push(value),
      });
    const first = inspector(a),
      second = inspector(b);
    document.body.append(first.element, second.element);
    const render = (component, g) => component.render({ group: g, scope, frame: 0, busy: false });
    render(first, a);
    render(second, b);
    change(get(first, 'groupScale'), '150');
    change(get(first, 'horizontalOffset'), '12');
    scope = 'frame';
    render(first, a);
    change(get(first, 'verticalOffset'), '18');
    get(first, 'editGroup').click();
    const inspectorResult = {
      scale: a.scale,
      x: a.x,
      offset: a.frames[0].verticalOffset,
      otherScale: b.scale,
      otherValue: get(second, 'groupScale').value,
      scopes,
      fieldHidden: get(first, 'groupScaleField').hidden,
      frameTitle: get(first, 'frameAdjustTitle').textContent,
      frameInfo: get(first, 'editFrameInfo').textContent,
    };
    // 参数面板没有工具栏或播放器也应独立工作。
    first.element.remove();
    second.element.remove();
    const intentions = [];
    const toolbar = createToolbar({
      onFit: () => intentions.push('fit'),
      onAlign: () => intentions.push('align'),
      onOverlay: (value) => intentions.push(['overlay', value]),
      onLock: (key, value) => intentions.push([key, value]),
      onUndo: () => intentions.push('undo'),
      onRedo: () => intentions.push('redo'),
      onReset: () => intentions.push('reset'),
    });
    document.body.append(toolbar.element);
    const toolbarInput = {
      group: a,
      groupCount: 2,
      busy: false,
      scope: 'frame',
      overlay: false,
      canReset: true,
      canUndo: true,
      canRedo: true,
    };
    toolbar.render(toolbarInput);
    get(toolbar, 'firstOverlay').click();
    get(toolbar, 'lockX').click();
    get(toolbar, 'redo').click();
    const redoLabel = get(toolbar, 'redo').getAttribute('aria-label');
    toolbar.render({ ...toolbarInput, busy: true });
    get(toolbar, 'redo').click();
    const busyDisabled = ['lockX', 'lockY', 'alignFirst', 'undo', 'redo', 'reset'].every(
      (id) => get(toolbar, id).disabled,
    );
    toolbar.element.remove();
    const timelineEvents = [];
    const timeline = createTimeline({
      onSelect: (index) => timelineEvents.push(['select', index]),
      onReorder() {},
      onAction: (...args) => timelineEvents.push(args),
      onStep: (delta) => timelineEvents.push(['step', delta]),
      onPlay: () => timelineEvents.push(['play']),
      onDuration: (value) => timelineEvents.push(['duration', value]),
      onFps: (value) => timelineEvents.push(['fps', value]),
      onCancel() {},
    });
    document.body.append(timeline.element);
    timeline.render({ group: b, media: new Map(), frame: 0, busy: false, playing: false });
    const frameButton = timeline.element.querySelector('.frame-tile');
    change(get(timeline, 'frameDuration'), '40');
    change(get(timeline, 'fps'), '25');
    timeline.element.querySelector('[data-frame-action="copy"]').click();
    timeline.render({ group: b, media: new Map(), frame: 0, busy: false, playing: true });
    const timelineResult = {
      events: timelineEvents,
      playLabel: get(timeline, 'play').getAttribute('aria-label'),
      sameFrameNode: frameButton === timeline.element.querySelector('.frame-tile'),
      time: get(timeline, 'frameInfo').textContent,
    };
    timeline.element.remove();
    const renamed = [];
    const rename = createRenameDialog();
    rename.open('第一轮', (name) => renamed.push(['old', name]));
    document.querySelector('#renameCancel').click();
    rename.open('第二轮', (name) => renamed.push(['new', name]));
    const renameInput = document.querySelector('#renameName');
    const initialRenameFocus = document.activeElement === renameInput;
    renameInput.value = '新名称';
    document.querySelector('#renameDialog form').requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const confirmation = createConfirmDialog();
    const pending = confirmation.open('确认一', '测试取消');
    document.querySelector('#confirmDialog [value=cancel]').click();
    const cancelled = await pending;
    const confirmedPromise = confirmation.open('确认二', '测试确认');
    document.querySelector('#confirmDialog [value=confirm]').click();
    const confirmed = await confirmedPromise;
    let exported;
    const exporter = createExportDialog({
      onSubmit: (input) => {
        exported = input;
      },
    });
    exporter.open('动作名');
    change(document.querySelector('#exportScope'), 'all');
    change(document.querySelector('#exportKind'), 'sheet');
    document.querySelector('#padding').value = '24';
    document.querySelector('#sheetColumns').value = '3';
    const exportNameLabel = document.querySelector('#exportNameLabel').textContent;
    document.querySelector('#exportConfirm').click();
    return {
      inspector: inspectorResult,
      intentions,
      busyDisabled,
      redoLabel,
      timeline: timelineResult,
      renamed,
      initialRenameFocus,
      cancelled,
      confirmed,
      exported,
      exportNameLabel,
    };
  });
  assert.deepEqual(result.inspector, {
    scale: 1.5,
    x: 12,
    offset: 12,
    otherScale: 2,
    otherValue: '200',
    scopes: ['group'],
    fieldHidden: true,
    frameTitle: '当前帧调整',
    frameInfo: '第 1 帧',
  });
  assert.deepEqual(result.intentions, [['overlay', true], ['lockX', true], 'redo']);
  assert.equal(result.busyDisabled, true);
  assert.equal(result.redoLabel, '恢复');
  assert.deepEqual(result.timeline, {
    events: [
      ['duration', 40],
      ['fps', 25],
      ['copy', 0],
    ],
    playLabel: '暂停',
    sameFrameNode: true,
    time: '1 / 1',
  });
  assert.deepEqual(result.renamed, [['new', '新名称']]);
  assert.equal(result.initialRenameFocus, true);
  assert.equal(result.cancelled, false);
  assert.equal(result.confirmed, true);
  assert.equal(result.exportNameLabel, '素材包名称');
  assert.deepEqual(result.exported, {
    name: '动作名',
    all: true,
    kind: 'sheet',
    columns: 3,
    padding: 24,
  });
  await page.setViewportSize({ width: 600, height: 640 });
  const narrowPlayer = await page.evaluate(async () => {
    const { createTimeline } = await import('/src/ui/timeline.js');
    const timeline = createTimeline({});
    document.body.append(timeline.element);
    timeline.render({ group: null, media: new Map(), frame: 0, busy: false, playing: false });
    const style = getComputedStyle(timeline.element.querySelector('.player'));
    return { padding: style.padding, gap: style.gap };
  });
  assert.deepEqual(narrowPlayer, { padding: '8px 12px', gap: '8px' });
  assert.deepEqual(errors, []);
  console.log(
    '组件契约通过：参数实例隔离、局部绑定、意图与禁用、帧节点身份、改名／确认重开、导出参数快照',
  );
} finally {
  await context.close();
  await browser.close();
}
