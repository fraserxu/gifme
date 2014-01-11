#!/usr/bin/env node

var fs = require('fs');
var vinyl = require('vinyl-fs');
var browserify = require('browserify');
var watchify = require('watchify');
var workerify = require('workerify');
var catw = require('catw');

var cmd = process.argv[2];
if (cmd === 'build') build({ watch: false })
else if (cmd=== 'watch') build({ watch: true })
else usage(1)

function build (opts) {
  var js = opts.watch ? watchify : browserify;
  js('./browser/main.js')
    .transform(workerify)
    .bundle()
    .pipe(fs.createWriteStream('./static/bundle.js'))
  ;

  var assets = vinyl.src('./browser/assets/**/*');
  assets.pipe(vinyl.dest('./static/assets'));

  var index = catw('./browser/index.html', { watch: opts.watch });
  index.on('stream', function (stream) {
    stream.pipe(fs.createWriteStream('./static/index.html'))
  });

  var css = catw('./browser/*.css', { watch: opts.watch });
  css.on('stream', function (stream) {
    stream.pipe(fs.createWriteStream('./static/bundle.css'))
  });
}

function usage (code) {
  console.error('usage: ./task.js { build | watch }');
  if (code) process.exit(code)
}
