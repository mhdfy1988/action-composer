import { context } from 'esbuild';
import { prepareOpenCv } from './opencv-runtime.mjs';
import { buildOptions } from './build-options.mjs';
await prepareOpenCv();
const app = await context(buildOptions);
await app.watch();
const server = await app.serve({ servedir: '.', host: '127.0.0.1', port: 8914 });
console.log(`动作编排：http://127.0.0.1:${server.port}/`);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await app.dispose();
    process.exitCode = 0;
  });
