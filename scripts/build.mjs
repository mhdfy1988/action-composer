import { build } from 'esbuild';
import { prepareOpenCv } from './opencv-runtime.mjs';
import { buildOptions } from './build-options.mjs';
await prepareOpenCv();
await build(buildOptions);
