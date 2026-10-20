import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { wholeRegion, wholeBodyCheck } from './whole-body.js';

assert.deepEqual(
  wholeRegion({ width: 100, height: 200 }, { left: 5, top: 1, right: 90, bottom: 199 }),
  { x: 3, y: 0, width: 89, height: 200 },
);
assert.deepEqual(
  wholeBodyCheck({ top: 20, bottom: 180 }, { top: 5, bottom: 85 }, { scale: 2, ty: 10 }),
  { heightPercent: 0, topOffset: 0, bottomOffset: 0 },
);

const root = resolve('output/registration-lab');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: 1500, height: 950 },
  acceptDownloads: true,
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const results = [];
try {
  await page.goto('http://127.0.0.1:8914/experiments/registration/');
  await page.waitForFunction(() => !document.getElementById('run').disabled);
  // 独立 Worker 的已知变换夹具：参考由源图等比放大两倍并平移生成。
  const known = await page.evaluate(async () => {
    const source = document.createElement('canvas');
    source.width = 160;
    source.height = 240;
    const ctx = source.getContext('2d');
    let seed = 19;
    for (let y = 10; y < 220; y += 4)
      for (let x = 20; x < 140; x += 4) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        ctx.fillStyle = `rgb(${seed & 255},${(seed >>> 8) & 255},${(seed >>> 16) & 255})`;
        ctx.fillRect(x, y, 4, 4);
      }
    const ref = document.createElement('canvas');
    ref.width = 384;
    ref.height = 512;
    ref.getContext('2d').drawImage(source, 32, 16, 320, 480);
    const job = {
      reference: ref.getContext('2d').getImageData(0, 0, 384, 512),
      target: ctx.getImageData(0, 0, 160, 240),
      roi: { x: 88, y: 64, width: 160, height: 160 },
      minScale: 1.5,
      maxScale: 2.5,
      representation: 'edge',
    };
    async function run(payload) {
      const worker = new Worker('./worker.js');
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error('实验 Worker 超时'));
        }, 30000);
        worker.onmessage = ({ data }) => {
          if (data.type === 'ready') worker.postMessage(payload);
          if (data.type === 'result' || data.type === 'error') {
            clearTimeout(timeout);
            worker.terminate();
            resolve(data);
          }
        };
      });
    }
    const matched = await run(job);
    const blank = structuredClone(job);
    blank.reference.data.fill(0);
    const rejected = await run(blank);
    return { matched, rejected };
  });
  assert.equal(known.matched.type, 'result');
  assert.ok(Math.abs(known.matched.best.scale - 2) < 0.03, JSON.stringify(known.matched.best));
  assert.ok(Math.abs(known.matched.best.tx - 32) < 2);
  assert.ok(Math.abs(known.matched.best.ty - 16) < 2);
  assert.equal(known.rejected.type, 'error');
  console.log('已知变换与透明区域拒绝通过', known.matched.best);
  for (const region of ['whole', 'head', 'torso'])
    for (const representation of ['edge', 'gray']) {
      await page.locator(`#${region}`).click();
      await page.locator('#representation').selectOption(representation);
      const download = page.waitForEvent('download');
      await page.locator('#run').click();
      await page.waitForFunction(() => !document.getElementById('report').disabled, null, {
        timeout: 60000,
      });
      await page.locator('#report').click();
      const file = await download;
      const path = resolve(root, `${region}-${representation}.json`);
      await file.saveAs(path);
      const report = JSON.parse(await readFile(path, 'utf8'));
      assert.ok(Number.isFinite(report.best.scale));
      assert.ok(Number.isFinite(report.wholeBody.heightPercent));
      if (region === 'whole') {
        assert.deepEqual(report.roi, { x: 146, y: 13, width: 615, height: 1472 });
      }
      results.push({ region, representation, ...report.best, boundary: report.boundary });
      await page.screenshot({ path: resolve(root, `${region}-${representation}.png`) });
      await page.locator('#contour').click();
      await page.screenshot({ path: resolve(root, `${region}-contour.png`) });
      await page.locator('#template').click();
      // 换帧/播放不改首帧计算参数，也不产生逐帧拟合。
      const text = await page.locator('#matched').innerText();
      await page.locator('#frame').fill('8');
      assert.equal(await page.locator('#frameInfo').innerText(), '9 / 13');
      assert.equal(await page.locator('#matched').innerText(), text);
      await page.locator('#frame').fill('0');
    }
  await page.locator('#run').click();
  await page.locator('#cancel').click();
  await page.waitForFunction(() => !document.getElementById('run').disabled);
  assert.equal(await page.locator('#template').isDisabled(), true);
  // 手拉 ROI 确实影响下一次输入，并清除旧候选。
  const box = await page.locator('#reference').boundingBox();
  await page.mouse.move(box.x + 100, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 185, box.y + 100);
  await page.mouse.up();
  await page.locator('#run').click();
  await page.waitForFunction(() => !document.getElementById('report').disabled, null, {
    timeout: 60000,
  });
  assert.deepEqual(errors, []);
  await writeFile(resolve(root, 'comparison.json'), JSON.stringify({ known, results }, null, 2));
  console.log('全身/头部/躯干六种对照、全身偏差、JSON下载回读、切帧、取消重载与框选通过');
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
