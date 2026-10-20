import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareOpenCv } from '../../scripts/opencv-runtime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'output/registration-lab');
await mkdir(output, { recursive: true });
await prepareOpenCv();
if (process.env.ACTION_COMPOSER_REAL_FIXTURE) {
  const source = resolve(process.env.ACTION_COMPOSER_REAL_FIXTURE);
  const names = (await readdir(resolve(source, 'jump-right')))
    .filter((name) => /^frame_\d{6}\.png$/.test(name))
    .sort();
  if (names.length !== 13) throw new Error('当前实验示例要求已确认的 13 帧浣熊目录');
  await mkdir(resolve(output, 'frames'), { recursive: true });
  await copyFile(resolve(source, 'raccoon-right-reference.png'), resolve(output, 'reference.png'));
  for (const name of names)
    await copyFile(resolve(source, 'jump-right', name), resolve(output, 'frames', name));
  console.log('已准备本机私有示例，仅复制到忽略目录。');
}
console.log('OpenCV 4.13.0 哈希已核对。实验入口：http://127.0.0.1:8914/experiments/registration/');
