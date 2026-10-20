export const buildOptions = {
  entryPoints: {
    app: 'src/app.js',
    'registration-worker': 'src/infrastructure/registration-worker.js',
  },
  bundle: true,
  outdir: 'dist',
  entryNames: '[name]',
  sourcemap: true,
  target: ['chrome120'],
  legalComments: 'eof',
};
