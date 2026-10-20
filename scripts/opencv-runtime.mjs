import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function prepareOpenCv(outputDirectory = resolve(root, 'dist')) {
  const folder = resolve(root, '.cache/opencv');
  await mkdir(folder, { recursive: true });
  const destination = resolve(folder, 'opencv-4.13.0.js');
  let data;
  try {
    data = await readFile(destination);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!data) {
    const response = await fetch('https://docs.opencv.org/4.13.0/opencv.js');
    if (!response.ok) throw new Error(`OpenCV 下载失败：${response.status}`);
    data = Buffer.from(await response.arrayBuffer());
  }
  const expected = '63366510248adf3a7eddf3e793dd825404efb7df3749f4d6f8557c7fa4ca8aa0';
  if (createHash('sha256').update(data).digest('hex') !== expected)
    throw new Error('OpenCV 缓存哈希不符，请核对官方版本；未回退其他实现');
  await writeFile(destination, data);
  const license = resolve(folder, 'LICENSE.txt');
  try {
    await readFile(license);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch('https://raw.githubusercontent.com/opencv/opencv/4.13.0/LICENSE');
    if (!response.ok) throw new Error('无法获取 OpenCV 许可证');
    await writeFile(license, await response.text(), 'utf8');
  }
  await mkdir(outputDirectory, { recursive: true });
  await copyFile(destination, resolve(outputDirectory, 'opencv.js'));
  await copyFile(license, resolve(outputDirectory, 'OPENCV-LICENSE.txt'));
}
