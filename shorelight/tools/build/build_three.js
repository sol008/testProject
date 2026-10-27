// node tools/build/build_three.js  → js/vendor/three.bundle.js
const esbuild = require('esbuild');
const path = require('path');
esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'three-entry.js')],
  bundle: true, minify: true, format: 'iife', target: ['chrome110', 'safari16'],
  outfile: path.join(__dirname, '..', '..', 'js', 'vendor', 'three.bundle.js'),
  legalComments: 'eof',
});
console.log('ok');
