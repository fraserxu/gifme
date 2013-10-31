;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var GifWriter = require('./omggif.js');

// A library/utility for generating GIF files
// Uses Dean McNamee's omggif library
// and Anthony Dekker's NeuQuant quantizer (JS 0.3 version with many fixes)
//
// @author sole / http://soledadpenades.com
function Animated_GIF(options) {
    'use strict';

    var width = 160, height = 120, canvas = null, ctx = null, repeat = 0, delay = 250;
    var frames = [];
    var numRenderedFrames = 0;
    var onRenderCompleteCallback = function() {};
    var onRenderProgressCallback = function() {};
    var workers = [], availableWorkers = [], numWorkers, workerPath;
    var generatingGIF = false;

    options = options || {};
    numWorkers = options.numWorkers || 2;
    workerPath = options.workerPath || 'src/quantizer.js'; // XXX hardcoded path

    for(var i = 0; i < numWorkers; i++) {
        var w = new Worker(workerPath);
        workers.push(w);
        availableWorkers.push(w);
    }

    // ---

    // Return a worker for processing a frame
    function getWorker() {
        if(availableWorkers.length === 0) {
            throw ('No workers left!');
        }

        return availableWorkers.pop();
    }

    // Restore a worker to the pool
    function freeWorker(worker) {
        availableWorkers.push(worker);
    }

    // Faster/closurized bufferToString function
    // (caching the String.fromCharCode values)
    var bufferToString = (function() {
        var byteMap = [];
        for(var i = 0; i < 256; i++) {
            byteMap[i] = String.fromCharCode(i);
        }

        return (function(buffer) {
            var numberValues = buffer.length;
            var str = '';

            for(var i = 0; i < numberValues; i++) {
                str += byteMap[ buffer[i] ];
            }

            return str;
        });
    })();

    function startRendering(completeCallback) {
        var numFrames = frames.length;

        onRenderCompleteCallback = completeCallback;

        for(var i = 0; i < numWorkers && i < frames.length; i++) {
            processFrame(i);
        }
    }

    function processFrame(position) {
        var frame;
        var worker;

        frame = frames[position];
        
        if(frame.beingProcessed || frame.done) {
            console.error('Frame already being processed or done!', frame.position);
            onFrameFinished();
            return;
        }

        frame.beingProcessed = true;
        
        worker = getWorker();

        worker.onmessage = function(ev) {
            var data = ev.data;

            // Delete original data, and free memory
            delete(frame.data);

            // TODO grrr... HACK for object -> Array
            frame.pixels = Array.prototype.slice.call(data.pixels);
            frame.palette = Array.prototype.slice.call(data.palette);
            frame.done = true;
            frame.beingProcessed = false;

            freeWorker(worker);

            onFrameFinished();
        };

        
        // TODO maybe look into transfer objects
        // for further efficiency
        var frameData = frame.data;
        //worker.postMessage(frameData, [frameData]);
        worker.postMessage(frameData);
    }

    function processNextFrame() {

        var position = -1;

        for(var i = 0; i < frames.length; i++) {
            var frame = frames[i];
            if(!frame.done && !frame.beingProcessed) {
                position = i;
                break;
            }
        }
        
        if(position >= 0) {
            processFrame(position);
        }
    }

    function onFrameFinished() { // ~~~ taskFinished

        // The GIF is not written until we're done with all the frames
        // because they might not be processed in the same order
        var allDone = frames.every(function(frame) {
            return !frame.beingProcessed && frame.done;
        });

        numRenderedFrames++;
        onRenderProgressCallback(numRenderedFrames * 0.75 / frames.length);

        if(allDone) {
            if(!generatingGIF) {
                generateGIF(frames, onRenderCompleteCallback);
            }
        } else {
            setTimeout(processNextFrame, 1);
        }
        
    }

    // Takes the already processed data in frames and feeds it to a new
    // GifWriter instance in order to get the binary GIF file
    function generateGIF(frames, callback) {
        
        // TODO: Weird: using a simple JS array instead of a typed array,
        // the files are WAY smaller o_o. Patches/explanations welcome!
        var buffer = []; // new Uint8Array(width * height * frames.length * 5);
        var gifWriter = new GifWriter(buffer, width, height, { loop: repeat });

        generatingGIF = true;

        frames.forEach(function(frame) {
            onRenderProgressCallback(0.75 + 0.25 * frame.position * 1.0 / frames.length);
            gifWriter.addFrame(0, 0, width, height, frame.pixels, {
                palette: frame.palette, 
                delay: delay 
            });
        });

        gifWriter.end();
        onRenderProgressCallback(1.0);
        
        frames = [];
        generatingGIF = false;

        callback(buffer);
    }
    
    // ---

    this.setSize = function(w, h) {
        width = w;
        height = h;
        canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        ctx = canvas.getContext('2d');
    };

    // Internally, GIF uses tenths of seconds to store the delay
    this.setDelay = function(seconds) {
        delay = seconds * 0.1;
    };

    // From GIF: 0 = loop forever, null = not looping, n > 0 = loop n times and stop
    this.setRepeat = function(r) {
        repeat = r;
    };

    this.addFrame = function(element) {

        if(ctx === null) {
            this.setSize(width, height);
        }

        ctx.drawImage(element, 0, 0, width, height);
        var data = ctx.getImageData(0, 0, width, height);
        
        this.addFrameImageData(data.data);
    };

    this.addFrameImageData = function(imageData) {

        var dataLength = imageData.length,
            imageDataArray = new Uint8Array(imageData);

        frames.push({ data: imageDataArray, done: false, beingProcessed: false, position: frames.length });
    };

    this.onRenderProgress = function(callback) {
        onRenderProgressCallback = callback;
    };

    this.isRendering = function() {
        return generatingGIF;
    };

    this.getBase64GIF = function(completeCallback) {

        var onRenderComplete = function(buffer) {
            var str = bufferToString(buffer);
            var gif = 'data:image/gif;base64,' + btoa(str);
            completeCallback(gif);
        };

        startRendering(onRenderComplete);

    };

}

module.exports = Animated_GIF;

},{"./omggif.js":2}],2:[function(require,module,exports){
// (c) Dean McNamee <dean@gmail.com>, 2013.
//
// https://github.com/deanm/omggif
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.
//
// omggif is a JavaScript implementation of a GIF 89a encoder, including
// animation and compression.  It does not rely on any specific underlying
// system, so should run in the browser, Node, or Plask.

function GifWriter(buf, width, height, gopts) {
  var p = 0;

  var gopts = gopts === undefined ? { } : gopts;
  var loop_count = gopts.loop === undefined ? null : gopts.loop;
  var global_palette = gopts.palette === undefined ? null : gopts.palette;

  if (width <= 0 || height <= 0 || width > 65535 || height > 65535)
    throw "Width/Height invalid."

  function check_palette_and_num_colors(palette) {
    var num_colors = palette.length;
    if (num_colors < 2 || num_colors > 256 ||  num_colors & (num_colors-1))
      throw "Invalid code/color length, must be power of 2 and 2 .. 256.";
    return num_colors;
  }

  // - Header.
  buf[p++] = 0x47; buf[p++] = 0x49; buf[p++] = 0x46;  // GIF
  buf[p++] = 0x38; buf[p++] = 0x39; buf[p++] = 0x61;  // 89a

  // Handling of Global Color Table (palette) and background index.
  var gp_num_colors_pow2 = 0;
  var background = 0;
  if (global_palette !== null) {
    var gp_num_colors = check_palette_and_num_colors(global_palette);
    while (gp_num_colors >>= 1) ++gp_num_colors_pow2;
    gp_num_colors = 1 << gp_num_colors_pow2;
    --gp_num_colors_pow2;
    if (gopts.background !== undefined) {
      background = gopts.background;
      if (background >= gp_num_colors) throw "Background index out of range.";
      // The GIF spec states that a background index of 0 should be ignored, so
      // this is probably a mistake and you really want to set it to another
      // slot in the palette.  But actually in the end most browsers, etc end
      // up ignoring this almost completely (including for dispose background).
      if (background === 0)
        throw "Background index explicitly passed as 0.";
    }
  }

  // - Logical Screen Descriptor.
  // NOTE(deanm): w/h apparently ignored by implementations, but set anyway.
  buf[p++] = width & 0xff; buf[p++] = width >> 8 & 0xff;
  buf[p++] = height & 0xff; buf[p++] = height >> 8 & 0xff;
  // NOTE: Indicates 0-bpp original color resolution (unused?).
  buf[p++] = (global_palette !== null ? 0x80 : 0) |  // Global Color Table Flag.
             gp_num_colors_pow2;  // NOTE: No sort flag (unused?).
  buf[p++] = background;  // Background Color Index.
  buf[p++] = 0;  // Pixel aspect ratio (unused?).

  // - Global Color Table
  if (global_palette !== null) {
    for (var i = 0, il = global_palette.length; i < il; ++i) {
      var rgb = global_palette[i];
      buf[p++] = rgb >> 16 & 0xff;
      buf[p++] = rgb >> 8 & 0xff;
      buf[p++] = rgb & 0xff;
    }
  }

  if (loop_count !== null) {  // Netscape block for looping.
    if (loop_count < 0 || loop_count > 65535)
      throw "Loop count invalid."
    // Extension code, label, and length.
    buf[p++] = 0x21; buf[p++] = 0xff; buf[p++] = 0x0b;
    // NETSCAPE2.0
    buf[p++] = 0x4e; buf[p++] = 0x45; buf[p++] = 0x54; buf[p++] = 0x53;
    buf[p++] = 0x43; buf[p++] = 0x41; buf[p++] = 0x50; buf[p++] = 0x45;
    buf[p++] = 0x32; buf[p++] = 0x2e; buf[p++] = 0x30;
    // Sub-block
    buf[p++] = 0x03; buf[p++] = 0x01;
    buf[p++] = loop_count & 0xff; buf[p++] = loop_count >> 8 & 0xff;
    buf[p++] = 0x00;  // Terminator.
  }


  var ended = false;

  this.addFrame = function(x, y, w, h, indexed_pixels, opts) {
    if (ended === true) { --p; ended = false; }  // Un-end.

    opts = opts === undefined ? { } : opts;

    // TODO(deanm): Bounds check x, y.  Do they need to be within the virtual
    // canvas width/height, I imagine?
    if (x < 0 || y < 0 || x > 65535 || y > 65535)
      throw "x/y invalid."

    if (w <= 0 || h <= 0 || w > 65535 || h > 65535)
      throw "Width/Height invalid."

    if (indexed_pixels.length < w * h)
      throw "Not enough pixels for the frame size.";

    var using_local_palette = true;
    var palette = opts.palette;
    if (palette === undefined || palette === null) {
      using_local_palette = false;
      palette = global_palette;
    }

    if (palette === undefined || palette === null)
      throw "Must supply either a local or global palette.";

    var num_colors = check_palette_and_num_colors(palette);

    // Compute the min_code_size (power of 2), destroying num_colors.
    var min_code_size = 0;
    while (num_colors >>= 1) ++min_code_size;
    num_colors = 1 << min_code_size;  // Now we can easily get it back.

    var delay = opts.delay === undefined ? 0 : opts.delay;

    // From the spec:
    //     0 -   No disposal specified. The decoder is
    //           not required to take any action.
    //     1 -   Do not dispose. The graphic is to be left
    //           in place.
    //     2 -   Restore to background color. The area used by the
    //           graphic must be restored to the background color.
    //     3 -   Restore to previous. The decoder is required to
    //           restore the area overwritten by the graphic with
    //           what was there prior to rendering the graphic.
    //  4-7 -    To be defined.
    // NOTE(deanm): Dispose background doesn't really work, apparently most
    // browsers ignore the background palette index and clear to transparency.
    var disposal = opts.disposal === undefined ? 0 : opts.disposal;
    if (disposal < 0 || disposal > 3)  // 4-7 is reserved.
      throw "Disposal out of range.";

    var use_transparency = false;
    var transparent_index = 0;
    if (opts.transparent !== undefined && opts.transparent !== null) {
      use_transparency = true;
      transparent_index = opts.transparent;
      if (transparent_index < 0 || transparent_index >= num_colors)
        throw "Transparent color index.";
    }

    if (disposal !== 0 || use_transparency || delay !== 0) {
      // - Graphics Control Extension
      buf[p++] = 0x21; buf[p++] = 0xf9;  // Extension / Label.
      buf[p++] = 4;  // Byte size.

      buf[p++] = disposal << 2 | (use_transparency === true ? 1 : 0);
      buf[p++] = delay & 0xff; buf[p++] = delay >> 8 & 0xff;
      buf[p++] = transparent_index;  // Transparent color index.
      buf[p++] = 0;  // Block Terminator.
    }

    // - Image Descriptor
    buf[p++] = 0x2c;  // Image Seperator.
    buf[p++] = x & 0xff; buf[p++] = x >> 8 & 0xff;  // Left.
    buf[p++] = y & 0xff; buf[p++] = y >> 8 & 0xff;  // Top.
    buf[p++] = w & 0xff; buf[p++] = w >> 8 & 0xff;
    buf[p++] = h & 0xff; buf[p++] = h >> 8 & 0xff;
    // NOTE: No sort flag (unused?).
    // TODO(deanm): Support interlace.
    buf[p++] = using_local_palette === true ? (0x80 | (min_code_size-1)) : 0;

    // - Local Color Table
    if (using_local_palette === true) {
      for (var i = 0, il = palette.length; i < il; ++i) {
        var rgb = palette[i];
        buf[p++] = rgb >> 16 & 0xff;
        buf[p++] = rgb >> 8 & 0xff;
        buf[p++] = rgb & 0xff;
      }
    }

    p = GifWriterOutputLZWCodeStream(
            buf, p, min_code_size < 2 ? 2 : min_code_size, indexed_pixels);
  };

  this.end = function() {
    if (ended === false) {
      buf[p++] = 0x3b;  // Trailer.
      ended = true;
    }
    return p;
  };
}

// Main compression routine, palette indexes -> LZW code stream.
// |index_stream| must have at least one entry.
function GifWriterOutputLZWCodeStream(buf, p, min_code_size, index_stream) {
  buf[p++] = min_code_size;
  var cur_subblock = p++;  // Pointing at the length field.

  var clear_code = 1 << min_code_size;
  var code_mask = clear_code - 1;
  var eoi_code = clear_code + 1;
  var next_code = eoi_code + 1;

  var cur_code_size = min_code_size + 1;  // Number of bits per code.
  var cur_shift = 0;
  // We have at most 12-bit codes, so we should have to hold a max of 19
  // bits here (and then we would write out).
  var cur = 0;

  function emit_bytes_to_buffer(bit_block_size) {
    while (cur_shift >= bit_block_size) {
      buf[p++] = cur & 0xff;
      cur >>= 8; cur_shift -= 8;
      if (p === cur_subblock + 256) {  // Finished a subblock.
        buf[cur_subblock] = 255;
        cur_subblock = p++;
      }
    }
  }

  function emit_code(c) {
    cur |= c << cur_shift;
    cur_shift += cur_code_size;
    emit_bytes_to_buffer(8);
  }

  // I am not an expert on the topic, and I don't want to write a thesis.
  // However, it is good to outline here the basic algorithm and the few data
  // structures and optimizations here that make this implementation fast.
  // The basic idea behind LZW is to build a table of previously seen runs
  // addressed by a short id (herein called output code).  All data is
  // referenced by a code, which represents one or more values from the
  // original input stream.  All input bytes can be referenced as the same
  // value as an output code.  So if you didn't want any compression, you
  // could more or less just output the original bytes as codes (there are
  // some details to this, but it is the idea).  In order to achieve
  // compression, values greater then the input range (codes can be up to
  // 12-bit while input only 8-bit) represent a sequence of previously seen
  // inputs.  The decompressor is able to build the same mapping while
  // decoding, so there is always a shared common knowledge between the
  // encoding and decoder, which is also important for "timing" aspects like
  // how to handle variable bit width code encoding.
  //
  // One obvious but very important consequence of the table system is there
  // is always a unique id (at most 12-bits) to map the runs.  'A' might be
  // 4, then 'AA' might be 10, 'AAA' 11, 'AAAA' 12, etc.  This relationship
  // can be used for an effecient lookup strategy for the code mapping.  We
  // need to know if a run has been seen before, and be able to map that run
  // to the output code.  Since we start with known unique ids (input bytes),
  // and then from those build more unique ids (table entries), we can
  // continue this chain (almost like a linked list) to always have small
  // integer values that represent the current byte chains in the encoder.
  // This means instead of tracking the input bytes (AAAABCD) to know our
  // current state, we can track the table entry for AAAABC (it is guaranteed
  // to exist by the nature of the algorithm) and the next character D.
  // Therefor the tuple of (table_entry, byte) is guaranteed to also be
  // unique.  This allows us to create a simple lookup key for mapping input
  // sequences to codes (table indices) without having to store or search
  // any of the code sequences.  So if 'AAAA' has a table entry of 12, the
  // tuple of ('AAAA', K) for any input byte K will be unique, and can be our
  // key.  This leads to a integer value at most 20-bits, which can always
  // fit in an SMI value and be used as a fast sparse array / object key.

  // Output code for the current contents of the index buffer.
  var ib_code = index_stream[0] & code_mask;  // Load first input index.
  var code_table = { };  // Key'd on our 20-bit "tuple".

  emit_code(clear_code);  // Spec says first code should be a clear code.

  // First index already loaded, process the rest of the stream.
  for (var i = 1, il = index_stream.length; i < il; ++i) {
    var k = index_stream[i] & code_mask;
    var cur_key = ib_code << 8 | k;  // (prev, k) unique tuple.
    var cur_code = code_table[cur_key];  // buffer + k.

    // Check if we have to create a new code table entry.
    if (cur_code === undefined) {  // We don't have buffer + k.
      // Emit index buffer (without k).
      // This is an inline version of emit_code, because this is the core
      // writing routine of the compressor (and V8 cannot inline emit_code
      // because it is a closure here in a different context).  Additionally
      // we can call emit_byte_to_buffer less often, because we can have
      // 30-bits (from our 31-bit signed SMI), and we know our codes will only
      // be 12-bits, so can safely have 18-bits there without overflow.
      // emit_code(ib_code);
      cur |= ib_code << cur_shift;
      cur_shift += cur_code_size;
      while (cur_shift >= 8) {
        buf[p++] = cur & 0xff;
        cur >>= 8; cur_shift -= 8;
        if (p === cur_subblock + 256) {  // Finished a subblock.
          buf[cur_subblock] = 255;
          cur_subblock = p++;
        }
      }

      if (next_code === 4096) {  // Table full, need a clear.
        emit_code(clear_code);
        next_code = eoi_code + 1;
        cur_code_size = min_code_size + 1;
        code_table = { };
      } else {  // Table not full, insert a new entry.
        // Increase our variable bit code sizes if necessary.  This is a bit
        // tricky as it is based on "timing" between the encoding and
        // decoder.  From the encoders perspective this should happen after
        // we've already emitted the index buffer and are about to create the
        // first table entry that would overflow our current code bit size.
        if (next_code >= (1 << cur_code_size)) ++cur_code_size;
        code_table[cur_key] = next_code++;  // Insert into code table.
      }

      ib_code = k;  // Index buffer to single input k.
    } else {
      ib_code = cur_code;  // Index buffer to sequence in code table.
    }
  }

  emit_code(ib_code);  // There will still be something in the index buffer.
  emit_code(eoi_code);  // End Of Information.

  // Flush / finalize the sub-blocks stream to the buffer.
  emit_bytes_to_buffer(1);

  // Finish the sub-blocks, writing out any unfinished lengths and
  // terminating with a sub-block of length 0.  If we have already started
  // but not yet used a sub-block it can just become the terminator.
  if (cur_subblock + 1 === p) {  // Started but unused.
    buf[cur_subblock] = 0;
  } else {  // Started and used, write length and additional terminator block.
    buf[cur_subblock] = p - cur_subblock - 1;
    buf[p++] = 0;
  }
  return p;
}

function GifReader(buf) {
  var p = 0;

  // - Header.
  if (buf[p++] !== 0x47 || buf[p++] !== 0x49 || buf[p++] !== 0x46 ||  // GIF
      buf[p++] !== 0x38 || buf[p++] !== 0x39 || buf[p++] !== 0x61) {  // 89a
    throw "Invalid GIF 89a header.";
  }

  // - Logical Screen Descriptor.
  var width = buf[p++] | buf[p++] << 8;
  var height = buf[p++] | buf[p++] << 8;
  var pf0 = buf[p++];  // <Packed Fields>.
  var global_palette_flag = pf0 >> 7;
  var num_global_colors_pow2 = pf0 & 0x7;
  var num_global_colors = 1 << (num_global_colors_pow2 + 1);
  var background = buf[p++];
  buf[p++];  // Pixel aspect ratio (unused?).

  var global_palette_offset = null;

  if (global_palette_flag) {
    global_palette_offset = p;
    p += num_global_colors * 3;  // Seek past palette.
  }

  var loop_count = null;

  var no_eof = true;

  var frames = [ ];

  var delay = 0;
  var transparent_index = null;
  var disposal = 0;  // 0 - No disposal specified.
  var loop_count = null;

  this.width = width;
  this.height = height;

  while (no_eof && p < buf.length) {
    switch (buf[p++]) {
      case 0x21:  // Graphics Control Extension Block
        switch (buf[p++]) {
          case 0xff:  // Application specific block
            // Try if it's a Netscape block (with animation loop counter).
            if (buf[p   ] !== 0x0b ||  // 21 FF already read, check block size.
                // NETSCAPE2.0
                buf[p+1 ] == 0x4e && buf[p+2 ] == 0x45 && buf[p+3 ] == 0x54 &&
                buf[p+4 ] == 0x53 && buf[p+5 ] == 0x43 && buf[p+6 ] == 0x41 &&
                buf[p+7 ] == 0x50 && buf[p+8 ] == 0x45 && buf[p+9 ] == 0x32 &&
                buf[p+10] == 0x2e && buf[p+11] == 0x30 &&
                // Sub-block
                buf[p+12] == 0x03 && buf[p+13] == 0x01 && buf[p+16] == 0) {
              p += 14;
              loop_count = buf[p++] | buf[p++] << 8;
              p++;  // Skip terminator.
            } else {  // We don't know what it is, just try to get past it.
              p += 12;
              while (true) {  // Seek through subblocks.
                var block_size = buf[p++];
                if (block_size === 0) break;
                p += block_size;
              }
            }
            break;

          case 0xf9:  // Graphics Control Extension
            if (buf[p++] !== 0x4 || buf[p+4] !== 0)
              throw "Invalid graphics extension block.";
            var pf1 = buf[p++];
            delay = buf[p++] | buf[p++] << 8;
            transparent_index = buf[p++];
            if ((pf1 & 1) === 0) transparent_index = null;
            disposal = pf1 >> 2 & 0x7;
            p++;  // Skip terminator.
            break;

          case 0xfe:  // Comment Extension.
            while (true) {  // Seek through subblocks.
              var block_size = buf[p++];
              if (block_size === 0) break;
              // console.log(buf.slice(p, p+block_size).toString('ascii'));
              p += block_size;
            }
            break;

          default:
            throw "Unknown graphic control label: 0x" + buf[p-1].toString(16);
        }
        break;

      case 0x2c:  // Image Descriptor.
        var x = buf[p++] | buf[p++] << 8;
        var y = buf[p++] | buf[p++] << 8;
        var w = buf[p++] | buf[p++] << 8;
        var h = buf[p++] | buf[p++] << 8;
        var pf2 = buf[p++];
        var local_palette_flag = pf2 >> 7;
        var num_local_colors_pow2 = pf2 & 0x7;
        var num_local_colors = 1 << (num_local_colors_pow2 + 1);
        var palette_offset = global_palette_offset;
        var has_local_palette = false;
        if (local_palette_flag) {
          var has_local_palette = true;
          palette_offset = p;  // Override with local palette.
          p += num_local_colors * 3;  // Seek past palette.
        }

        var data_offset = p;

        p++;  // codesize
        while (true) {
          var block_size = buf[p++];
          if (block_size === 0) break;
          p += block_size;
        }

        frames.push({x: x, y: y, width: w, height: h,
                     has_local_palette: has_local_palette,
                     palette_offset: palette_offset,
                     data_offset: data_offset,
                     data_length: p - data_offset,
                     transparent_index: transparent_index,
                     delay: delay,
                     disposal: disposal});
        break;

      case 0x3b:  // Trailer Marker (end of file).
        no_eof = false;
        break;

      default:
        throw "Unknown gif block: 0x" + buf[p-1].toString(16);
        break;
    }
  }

  this.numFrames = function() {
    return frames.length;
  };

  this.frameInfo = function(frame_num) {
    if (frame_num < 0 || frame_num >= frames.length)
      throw "Frame index out of range.";
    return frames[frame_num];
  }

  this.decodeAndBlitFrameBGRA = function(frame_num, pixels) {
    var frame = this.frameInfo(frame_num);
    var num_pixels = frame.width * frame.height;
    var index_stream = new Uint8Array(num_pixels);  // Atmost 8-bit indices.
    GifReaderLZWOutputIndexStream(
        buf, frame.data_offset, index_stream, num_pixels);
    var palette_offset = frame.palette_offset;

    // NOTE(deanm): It seems to be much faster to compare index to 256 than
    // to === null.  Not sure why, but CompareStub_EQ_STRICT shows up high in
    // the profile, not sure if it's related to using a Uint8Array.
    var trans = frame.transparent_index;
    if (trans === null) trans = 256;

    var wstride = (width - frame.width) * 4;
    var op = ((frame.y * width) + frame.x) * 4;  // output pointer.
    var linex = frame.width;

    for (var i = 0, il = index_stream.length; i < il; ++i) {
      var index = index_stream[i];

      if (index === trans) {
        op += 4;
      } else {
        var r = buf[palette_offset + index * 3];
        var g = buf[palette_offset + index * 3 + 1];
        var b = buf[palette_offset + index * 3 + 2];
        pixels[op++] = b;
        pixels[op++] = g;
        pixels[op++] = r;
        pixels[op++] = 255;
      }

      if (--linex === 0) {
        op += wstride;
        linex = frame.width;
      }
    }
  };

  // I will go to copy and paste hell one day...
  this.decodeAndBlitFrameRGBA = function(frame_num, pixels) {
    var frame = this.frameInfo(frame_num);
    var num_pixels = frame.width * frame.height;
    var index_stream = new Uint8Array(num_pixels);  // Atmost 8-bit indices.
    GifReaderLZWOutputIndexStream(
        buf, frame.data_offset, index_stream, num_pixels);
    var op = 0;  // output pointer.
    var palette_offset = frame.palette_offset;

    // NOTE(deanm): It seems to be much faster to compare index to 256 than
    // to === null.  Not sure why, but CompareStub_EQ_STRICT shows up high in
    // the profile, not sure if it's related to using a Uint8Array.
    var trans = frame.transparent_index;
    if (trans === null) trans = 256;

    var wstride = (width - frame.width) * 4;
    var op = ((frame.y * width) + frame.x) * 4;  // output pointer.
    var linex = frame.width;

    for (var i = 0, il = index_stream.length; i < il; ++i) {
      var index = index_stream[i];

      if (index === trans) {
        op += 4;
      } else {
        var r = buf[palette_offset + index * 3];
        var g = buf[palette_offset + index * 3 + 1];
        var b = buf[palette_offset + index * 3 + 2];
        pixels[op++] = r;
        pixels[op++] = g;
        pixels[op++] = b;
        pixels[op++] = 255;
      }

      if (--linex === 0) {
        op += wstride;
        linex = frame.width;
      }
    }
  };
}

function GifReaderLZWOutputIndexStream(code_stream, p, output, output_length) {
  var min_code_size = code_stream[p++];

  var clear_code = 1 << min_code_size;
  var eoi_code = clear_code + 1;
  var next_code = eoi_code + 1;

  var cur_code_size = min_code_size + 1;  // Number of bits per code.
  // NOTE: This shares the same name as the encoder, but has a different
  // meaning here.  Here this masks each code coming from the code stream.
  var code_mask = (1 << cur_code_size) - 1;
  var cur_shift = 0;
  var cur = 0;

  var op = 0;  // Output pointer.
  
  var subblock_size = code_stream[p++];

  // TODO(deanm): Would using a TypedArray be any faster?  At least it would
  // solve the fast mode / backing store uncertainty.
  // var code_table = Array(4096);
  var code_table = new Int32Array(4096);  // Can be signed, we only use 20 bits.

  var prev_code = null;  // Track code-1.

  while (true) {
    // Read up to two bytes, making sure we always 12-bits for max sized code.
    while (cur_shift < 16) {
      if (subblock_size === 0) break;  // No more data to be read.

      cur |= code_stream[p++] << cur_shift;
      cur_shift += 8;

      if (subblock_size === 1) {  // Never let it get to 0 to hold logic above.
        subblock_size = code_stream[p++];  // Next subblock.
      } else {
        --subblock_size;
      }
    }

    // TODO(deanm): We should never really get here, we should have received
    // and EOI.
    if (cur_shift < cur_code_size)
      break;

    var code = cur & code_mask;
    cur >>= cur_code_size;
    cur_shift -= cur_code_size;

    // TODO(deanm): Maybe should check that the first code was a clear code,
    // at least this is what you're supposed to do.  But actually our encoder
    // now doesn't emit a clear code first anyway.
    if (code === clear_code) {
      // We don't actually have to clear the table.  This could be a good idea
      // for greater error checking, but we don't really do any anyway.  We
      // will just track it with next_code and overwrite old entries.

      next_code = eoi_code + 1;
      cur_code_size = min_code_size + 1;
      code_mask = (1 << cur_code_size) - 1;

      // Don't update prev_code ?
      prev_code = null;
      continue;
    } else if (code === eoi_code) {
      break;
    }

    // We have a similar situation as the decoder, where we want to store
    // variable length entries (code table entries), but we want to do in a
    // faster manner than an array of arrays.  The code below stores sort of a
    // linked list within the code table, and then "chases" through it to
    // construct the dictionary entries.  When a new entry is created, just the
    // last byte is stored, and the rest (prefix) of the entry is only
    // referenced by its table entry.  Then the code chases through the
    // prefixes until it reaches a single byte code.  We have to chase twice,
    // first to compute the length, and then to actually copy the data to the
    // output (backwards, since we know the length).  The alternative would be
    // storing something in an intermediate stack, but that doesn't make any
    // more sense.  I implemented an approach where it also stored the length
    // in the code table, although it's a bit tricky because you run out of
    // bits (12 + 12 + 8), but I didn't measure much improvements (the table
    // entries are generally not the long).  Even when I created benchmarks for
    // very long table entries the complexity did not seem worth it.
    // The code table stores the prefix entry in 12 bits and then the suffix
    // byte in 8 bits, so each entry is 20 bits.

    var chase_code = code < next_code ? code : prev_code;

    // Chase what we will output, either {CODE} or {CODE-1}.
    var chase_length = 0;
    var chase = chase_code;
    while (chase > clear_code) {
      chase = code_table[chase] >> 8;
      ++chase_length;
    }

    var k = chase;
    
    var op_end = op + chase_length + (chase_code !== code ? 1 : 0);
    if (op_end > output_length) {
      console.log("Warning, gif stream longer than expected.");
      return;
    }

    // Already have the first byte from the chase, might as well write it fast.
    output[op++] = k;

    op += chase_length;
    var b = op;  // Track pointer, writing backwards.

    if (chase_code !== code)  // The case of emitting {CODE-1} + k.
      output[op++] = k;

    chase = chase_code;
    while (chase_length--) {
      chase = code_table[chase];
      output[--b] = chase & 0xff;  // Write backwards.
      chase >>= 8;  // Pull down to the prefix code.
    }

    if (prev_code !== null && next_code < 4096) {
      code_table[next_code++] = prev_code << 8 | k;
      // TODO(deanm): Figure out this clearing vs code growth logic better.  I
      // have an feeling that it should just happen somewhere else, for now it
      // is awkward between when we grow past the max and then hit a clear code.
      // For now just check if we hit the max 12-bits (then a clear code should
      // follow, also of course encoded in 12-bits).
      if (next_code >= code_mask+1 && cur_code_size < 12) {
        ++cur_code_size;
        code_mask = code_mask << 1 | 1;
      }
    }

    prev_code = code;
  }

  if (op !== output_length) {
    console.log("Warning, gif stream shorter than expected.");
  }

  return output;
}

// try { exports.GifWriter = GifWriter; exports.GifReader = GifReader } catch(e) { }  // CommonJS.

module.exports = GifWriter;
},{}],3:[function(require,module,exports){
module.exports = {
	startVideoStreaming: startVideoStreaming,
	stopVideoStreaming: stopVideoStreaming
};

'use strict';

// A couple of shims for having a common interface
window.URL = window.URL || window.webkitURL || window.mozURL || window.msURL;
navigator.getMedia = (navigator.getUserMedia ||
	navigator.webkitGetUserMedia ||
	navigator.mozGetUserMedia ||
	navigator.msGetUserMedia
);

var video;
var cameraStream;
var noGUMSupportTimeout;

/**
 * Requests permission for using the user's camera,
 * starts reading video from the selected camera, and calls
 * `okCallback` when the video dimensions are known (with a fallback
 * for when the dimensions are not reported on time),
 * or calls `errorCallback` if something goes wrong
 */

function startStreaming(errorCallback, onStreaming, okCallback) {

	var videoElement;
	var cameraStream;
	var attempts = 0;
	var readyListener = function(event) {
		findVideoSize();
	};
	var findVideoSize = function() {
		if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
			videoElement.removeEventListener('loadeddata', readyListener);
			onDimensionsReady(videoElement.videoWidth, videoElement.videoHeight);
		} else {
			if (attempts < 10) {
				attempts++;
				setTimeout(findVideoSize, 200);
			} else {
				onDimensionsReady(640, 480);
			}
		}
	};
	var onDimensionsReady = function(width, height) {
		okCallback(cameraStream, videoElement, width, height);
	};

	videoElement = document.createElement('video');
	videoElement.autoplay = true;

	videoElement.addEventListener('loadeddata', readyListener);

	navigator.getMedia({
		video: true
	}, function(stream) {
		onStreaming();
		if (videoElement.mozSrcObject) {
			videoElement.mozSrcObject = stream;
		} else {
			videoElement.src = window.URL.createObjectURL(stream);
		}
		cameraStream = stream;
		videoElement.play();
	}, errorCallback);
}

/**
 * Try to initiate video streaming, and transparently handle cases
 * where that is not possible (includes 'deceptive' browsers, see inline
 * comment for more info)
 */

function startVideoStreaming(errorCallback, okCallback) {
	if (navigator.getMedia) {
		// Some browsers apparently have support for video streaming because of the
		// presence of the getUserMedia function, but then do not answer our
		// calls for streaming.
		// So we'll set up this timeout and if nothing happens after a while, we'll
		// conclude that there's no actual getUserMedia support.
		noGUMSupportTimeout = setTimeout(onNoGUMSupport, 10000);
		startStreaming(errorCallback, function() {
			// The streaming started somehow, so we can assume /there is/
			// gUM support
			clearTimeout(noGUMSupportTimeout);
		}, function(stream, videoElement, width, height) {
			// Keep references, for stopping the stream later on.
			cameraStream = stream;
			video = videoElement;
			okCallback(stream, videoElement, width, height);
		});
	} else {
		onNoGUMSupport();
	}

	function onNoGUMSupport() {
		errorCallback('Native device media streaming (getUserMedia) not supported in this browser.');
	}
}

function stopVideoStreaming() {
	if (cameraStream) {
		cameraStream.stop();
	}

	if (video) {
		video.pause();
		video.src = null;
		video = null;
	}
}
},{}],4:[function(require,module,exports){
var VideoShooter = require('./videoShooter');
var gumHelper = require('./gumhelper');
var saveAs = require('filesaver.js');
var request = require('browser-request');
var qs = require('querystring');
var slidr = require('../node_modules/slidr/slidr.js');
var videoShooter;

var imgur = {
	api: 'https://api.imgur.com/3/image',
	client: '76e5943d38e8f8e'
};

var s = slidr.create('slidr-div')
	.add('h', ['one', 'two', 'three'])
	.add('v', ['three', 'four'], 'cube')
	.start();

// buttons
var camera_button = document.querySelector('#camera');
var save_button = document.querySelector('#saveAs');
var upload_button = document.querySelector('#upload');
var capture_button = document.querySelector('#capture');

// allow to use camera
camera_button.addEventListener('click', function() {
	if (navigator.getMedia) {
		gumHelper.startVideoStreaming(function errorCb() {}, function successCallback(stream, videoElement, width, height) {
			videoElement.width = width / 2;
			videoElement.height = height / 2;
			document.querySelector('#webcam').appendChild(videoElement);
			videoElement.play();
			videoShooter = new VideoShooter(videoElement);

			s.slide('two');
		});
	} else {
		alert('sorry, your browser does\'s support getMedia.');
	}
})

function getScreenshot(callback, numFrames, interval) {
	if (videoShooter) {
		videoShooter.getShot(callback, numFrames, interval);
	} else {
		callback('');
	}
};

// capture a gif
capture_button.addEventListener('click', function() {
	var capture_text = capture_button.innerHTML;
	
	capture_button.innerHTML = 'capturing...';
	getScreenshot(function(pictureData) {
		save_button.disabled = false;
		upload_button.disabled = false;

		capture_button.innerHTML = capture_text;
		s.slide('three');
	}, 10, 0.2);

})

// save to local
save_button.addEventListener('click', function() {
	var imgUrl = document.querySelector('#target').getAttribute('src');
	var blob = dataURItoBlob(imgUrl, 'image/gif');
	var filename = (document.querySelector('#filename').value || 'gifme') + '.gif';

	saveAs(blob, filename);
})

// upload to imgur
upload_button.addEventListener('click', function() {
	upload_button.disabled = true;
	var button_text = upload_button.innerHTML;
	upload_button.innerHTML = 'uploading...';

	var imgUrl = document.querySelector('#target').getAttribute('src');
	var img_file = imgUrl.split(',')[1];
	var options = {
		url: imgur.api,
		method: 'post',
		headers: {
			Authorization: 'Client-ID ' + imgur.client,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: qs.stringify({
			type: 'base64',
			image: img_file
		})
	}
	request(options, function(error, res, body) {
		upload_button.disabled = false;
		upload_button.innerHTML = button_text;
		var data = JSON.parse(body).data;

		// add to dom
		var link_box = document.createElement('input');
		link_box.setAttribute('type', 'text');
		link_box.setAttribute('autofocus', true);
		link_box.value = data.link;

		document.querySelector('#share_link').appendChild(link_box);
	})
});

function dataURItoBlob(dataURI, dataTYPE) {
	var binary = atob(dataURI.split(',')[1]),
		array = [];
	for (var i = 0; i < binary.length; i++) array.push(binary.charCodeAt(i));
	return new Blob([new Uint8Array(array)], {
		type: dataTYPE
	});
}
},{"../node_modules/slidr/slidr.js":8,"./gumhelper":3,"./videoShooter":5,"browser-request":6,"filesaver.js":7,"querystring":9}],5:[function(require,module,exports){
var Animated_GIF = require('./Animated_GIF/Animated_GIF.js');

module.exports = function(videoElement) {
    'use strict';

    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');

    canvas.width = videoElement.width;
    canvas.height = videoElement.height;

    this.getShot = function(callback, numFrames, interval) {
        numFrames = numFrames !== undefined ? numFrames : 3;
        interval = interval !== undefined ? interval : 0.1; // In seconds

        var pendingFrames = numFrames;
        var ag = new Animated_GIF({
            workerPath: './lib/Animated_GIF/quantizer.js'
        });
        ag.setSize(canvas.width, canvas.height);
        ag.setDelay(interval);

        captureFrame();

        function captureFrame() {
            ag.addFrame(videoElement);
            pendingFrames--;

            if (pendingFrames > 0) {
                setTimeout(captureFrame, interval * 1000); // timeouts are in milliseconds
            } else {
                ag.getBase64GIF(function(image) {
                    var img = document.createElement('img');
                    img.setAttribute('id', 'target')
                    img.src = image;

                    document.querySelector('#target_box').appendChild(img);
                    callback(image);
                });
            }
        }

    };
}
},{"./Animated_GIF/Animated_GIF.js":1}],6:[function(require,module,exports){
// Browser Request
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var XHR = XMLHttpRequest
if (!XHR) throw new Error('missing XMLHttpRequest')

module.exports = request
request.log = {
  'trace': noop, 'debug': noop, 'info': noop, 'warn': noop, 'error': noop
}

var DEFAULT_TIMEOUT = 3 * 60 * 1000 // 3 minutes

//
// request
//

function request(options, callback) {
  // The entry-point to the API: prep the options object and pass the real work to run_xhr.
  if(typeof callback !== 'function')
    throw new Error('Bad callback given: ' + callback)

  if(!options)
    throw new Error('No options given')

  var options_onResponse = options.onResponse; // Save this for later.

  if(typeof options === 'string')
    options = {'uri':options};
  else
    options = JSON.parse(JSON.stringify(options)); // Use a duplicate for mutating.

  options.onResponse = options_onResponse // And put it back.

  if (options.verbose) request.log = getLogger();

  if(options.url) {
    options.uri = options.url;
    delete options.url;
  }

  if(!options.uri && options.uri !== "")
    throw new Error("options.uri is a required argument");

  if(typeof options.uri != "string")
    throw new Error("options.uri must be a string");

  var unsupported_options = ['proxy', '_redirectsFollowed', 'maxRedirects', 'followRedirect']
  for (var i = 0; i < unsupported_options.length; i++)
    if(options[ unsupported_options[i] ])
      throw new Error("options." + unsupported_options[i] + " is not supported")

  options.callback = callback
  options.method = options.method || 'GET';
  options.headers = options.headers || {};
  options.body    = options.body || null
  options.timeout = options.timeout || request.DEFAULT_TIMEOUT

  if(options.headers.host)
    throw new Error("Options.headers.host is not supported");

  if(options.json) {
    options.headers.accept = options.headers.accept || 'application/json'
    if(options.method !== 'GET')
      options.headers['content-type'] = 'application/json'

    if(typeof options.json !== 'boolean')
      options.body = JSON.stringify(options.json)
    else if(typeof options.body !== 'string')
      options.body = JSON.stringify(options.body)
  }

  // If onResponse is boolean true, call back immediately when the response is known,
  // not when the full request is complete.
  options.onResponse = options.onResponse || noop
  if(options.onResponse === true) {
    options.onResponse = callback
    options.callback = noop
  }

  // XXX Browsers do not like this.
  //if(options.body)
  //  options.headers['content-length'] = options.body.length;

  // HTTP basic authentication
  if(!options.headers.authorization && options.auth)
    options.headers.authorization = 'Basic ' + b64_enc(options.auth.username + ':' + options.auth.password);

  return run_xhr(options)
}

var req_seq = 0
function run_xhr(options) {
  var xhr = new XHR
    , timed_out = false
    , is_cors = is_crossDomain(options.uri)
    , supports_cors = ('withCredentials' in xhr)

  req_seq += 1
  xhr.seq_id = req_seq
  xhr.id = req_seq + ': ' + options.method + ' ' + options.uri
  xhr._id = xhr.id // I know I will type "_id" from habit all the time.

  if(is_cors && !supports_cors) {
    var cors_err = new Error('Browser does not support cross-origin request: ' + options.uri)
    cors_err.cors = 'unsupported'
    return options.callback(cors_err, xhr)
  }

  xhr.timeoutTimer = setTimeout(too_late, options.timeout)
  function too_late() {
    timed_out = true
    var er = new Error('ETIMEDOUT')
    er.code = 'ETIMEDOUT'
    er.duration = options.timeout

    request.log.error('Timeout', { 'id':xhr._id, 'milliseconds':options.timeout })
    return options.callback(er, xhr)
  }

  // Some states can be skipped over, so remember what is still incomplete.
  var did = {'response':false, 'loading':false, 'end':false}

  xhr.onreadystatechange = on_state_change
  xhr.open(options.method, options.uri, true) // asynchronous
  if(is_cors)
    xhr.withCredentials = !! options.withCredentials
  xhr.send(options.body)
  return xhr

  function on_state_change(event) {
    if(timed_out)
      return request.log.debug('Ignoring timed out state change', {'state':xhr.readyState, 'id':xhr.id})

    request.log.debug('State change', {'state':xhr.readyState, 'id':xhr.id, 'timed_out':timed_out})

    if(xhr.readyState === XHR.OPENED) {
      request.log.debug('Request started', {'id':xhr.id})
      for (var key in options.headers)
        xhr.setRequestHeader(key, options.headers[key])
    }

    else if(xhr.readyState === XHR.HEADERS_RECEIVED)
      on_response()

    else if(xhr.readyState === XHR.LOADING) {
      on_response()
      on_loading()
    }

    else if(xhr.readyState === XHR.DONE) {
      on_response()
      on_loading()
      on_end()
    }
  }

  function on_response() {
    if(did.response)
      return

    did.response = true
    request.log.debug('Got response', {'id':xhr.id, 'status':xhr.status})
    clearTimeout(xhr.timeoutTimer)
    xhr.statusCode = xhr.status // Node request compatibility

    // Detect failed CORS requests.
    if(is_cors && xhr.statusCode == 0) {
      var cors_err = new Error('CORS request rejected: ' + options.uri)
      cors_err.cors = 'rejected'

      // Do not process this request further.
      did.loading = true
      did.end = true

      return options.callback(cors_err, xhr)
    }

    options.onResponse(null, xhr)
  }

  function on_loading() {
    if(did.loading)
      return

    did.loading = true
    request.log.debug('Response body loading', {'id':xhr.id})
    // TODO: Maybe simulate "data" events by watching xhr.responseText
  }

  function on_end() {
    if(did.end)
      return

    did.end = true
    request.log.debug('Request done', {'id':xhr.id})

    xhr.body = xhr.responseText
    if(options.json) {
      try        { xhr.body = JSON.parse(xhr.responseText) }
      catch (er) { return options.callback(er, xhr)        }
    }

    options.callback(null, xhr, xhr.body)
  }

} // request

request.withCredentials = false;
request.DEFAULT_TIMEOUT = DEFAULT_TIMEOUT;

//
// defaults
//

request.defaults = function(options, requester) {
  var def = function (method) {
    var d = function (params, callback) {
      if(typeof params === 'string')
        params = {'uri': params};
      else {
        params = JSON.parse(JSON.stringify(params));
      }
      for (var i in options) {
        if (params[i] === undefined) params[i] = options[i]
      }
      return method(params, callback)
    }
    return d
  }
  var de = def(request)
  de.get = def(request.get)
  de.post = def(request.post)
  de.put = def(request.put)
  de.head = def(request.head)
  return de
}

//
// HTTP method shortcuts
//

var shortcuts = [ 'get', 'put', 'post', 'head' ];
shortcuts.forEach(function(shortcut) {
  var method = shortcut.toUpperCase();
  var func   = shortcut.toLowerCase();

  request[func] = function(opts) {
    if(typeof opts === 'string')
      opts = {'method':method, 'uri':opts};
    else {
      opts = JSON.parse(JSON.stringify(opts));
      opts.method = method;
    }

    var args = [opts].concat(Array.prototype.slice.apply(arguments, [1]));
    return request.apply(this, args);
  }
})

//
// CouchDB shortcut
//

request.couch = function(options, callback) {
  if(typeof options === 'string')
    options = {'uri':options}

  // Just use the request API to do JSON.
  options.json = true
  if(options.body)
    options.json = options.body
  delete options.body

  callback = callback || noop

  var xhr = request(options, couch_handler)
  return xhr

  function couch_handler(er, resp, body) {
    if(er)
      return callback(er, resp, body)

    if((resp.statusCode < 200 || resp.statusCode > 299) && body.error) {
      // The body is a Couch JSON object indicating the error.
      er = new Error('CouchDB error: ' + (body.error.reason || body.error.error))
      for (var key in body)
        er[key] = body[key]
      return callback(er, resp, body);
    }

    return callback(er, resp, body);
  }
}

//
// Utility
//

function noop() {}

function getLogger() {
  var logger = {}
    , levels = ['trace', 'debug', 'info', 'warn', 'error']
    , level, i

  for(i = 0; i < levels.length; i++) {
    level = levels[i]

    logger[level] = noop
    if(typeof console !== 'undefined' && console && console[level])
      logger[level] = formatted(console, level)
  }

  return logger
}

function formatted(obj, method) {
  return formatted_logger

  function formatted_logger(str, context) {
    if(typeof context === 'object')
      str += ' ' + JSON.stringify(context)

    return obj[method].call(obj, str)
  }
}

// Return whether a URL is a cross-domain request.
function is_crossDomain(url) {
  var rurl = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+))?)?/

  // jQuery #8138, IE may throw an exception when accessing
  // a field from window.location if document.domain has been set
  var ajaxLocation
  try { ajaxLocation = location.href }
  catch (e) {
    // Use the href attribute of an A element since IE will modify it given document.location
    ajaxLocation = document.createElement( "a" );
    ajaxLocation.href = "";
    ajaxLocation = ajaxLocation.href;
  }

  var ajaxLocParts = rurl.exec(ajaxLocation.toLowerCase()) || []
    , parts = rurl.exec(url.toLowerCase() )

  var result = !!(
    parts &&
    (  parts[1] != ajaxLocParts[1]
    || parts[2] != ajaxLocParts[2]
    || (parts[3] || (parts[1] === "http:" ? 80 : 443)) != (ajaxLocParts[3] || (ajaxLocParts[1] === "http:" ? 80 : 443))
    )
  )

  //console.debug('is_crossDomain('+url+') -> ' + result)
  return result
}

// MIT License from http://phpjs.org/functions/base64_encode:358
function b64_enc (data) {
    // Encodes string using MIME base64 algorithm
    var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var o1, o2, o3, h1, h2, h3, h4, bits, i = 0, ac = 0, enc="", tmp_arr = [];

    if (!data) {
        return data;
    }

    // assume utf8 data
    // data = this.utf8_encode(data+'');

    do { // pack three octets into four hexets
        o1 = data.charCodeAt(i++);
        o2 = data.charCodeAt(i++);
        o3 = data.charCodeAt(i++);

        bits = o1<<16 | o2<<8 | o3;

        h1 = bits>>18 & 0x3f;
        h2 = bits>>12 & 0x3f;
        h3 = bits>>6 & 0x3f;
        h4 = bits & 0x3f;

        // use hexets to index into b64, and append result to encoded string
        tmp_arr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
    } while (i < data.length);

    enc = tmp_arr.join('');

    switch (data.length % 3) {
        case 1:
            enc = enc.slice(0, -2) + '==';
        break;
        case 2:
            enc = enc.slice(0, -1) + '=';
        break;
    }

    return enc;
}

},{}],7:[function(require,module,exports){
/* FileSaver.js
 * A saveAs() FileSaver implementation.
 * 2013-01-23
 *
 * By Eli Grey, http://eligrey.com
 * License: X11/MIT
 *   See LICENSE.md
 */

/*global self */
/*jslint bitwise: true, regexp: true, confusion: true, es5: true, vars: true, white: true,
  plusplus: true */

/*! @source http://purl.eligrey.com/github/FileSaver.js/blob/master/FileSaver.js */

var saveAs = saveAs
  || (navigator.msSaveOrOpenBlob && navigator.msSaveOrOpenBlob.bind(navigator))
  || (function(view) {
	"use strict";
	var
		  doc = view.document
		  // only get URL when necessary in case BlobBuilder.js hasn't overridden it yet
		, get_URL = function() {
			return view.URL || view.webkitURL || view;
		}
		, URL = view.URL || view.webkitURL || view
		, save_link = doc.createElementNS("http://www.w3.org/1999/xhtml", "a")
		, can_use_save_link =  !view.externalHost && "download" in save_link
		, click = function(node) {
			var event = doc.createEvent("MouseEvents");
			event.initMouseEvent(
				"click", true, false, view, 0, 0, 0, 0, 0
				, false, false, false, false, 0, null
			);
			node.dispatchEvent(event);
		}
		, webkit_req_fs = view.webkitRequestFileSystem
		, req_fs = view.requestFileSystem || webkit_req_fs || view.mozRequestFileSystem
		, throw_outside = function (ex) {
			(view.setImmediate || view.setTimeout)(function() {
				throw ex;
			}, 0);
		}
		, force_saveable_type = "application/octet-stream"
		, fs_min_size = 0
		, deletion_queue = []
		, process_deletion_queue = function() {
			var i = deletion_queue.length;
			while (i--) {
				var file = deletion_queue[i];
				if (typeof file === "string") { // file is an object URL
					URL.revokeObjectURL(file);
				} else { // file is a File
					file.remove();
				}
			}
			deletion_queue.length = 0; // clear queue
		}
		, dispatch = function(filesaver, event_types, event) {
			event_types = [].concat(event_types);
			var i = event_types.length;
			while (i--) {
				var listener = filesaver["on" + event_types[i]];
				if (typeof listener === "function") {
					try {
						listener.call(filesaver, event || filesaver);
					} catch (ex) {
						throw_outside(ex);
					}
				}
			}
		}
		, FileSaver = function(blob, name) {
			// First try a.download, then web filesystem, then object URLs
			var
				  filesaver = this
				, type = blob.type
				, blob_changed = false
				, object_url
				, target_view
				, get_object_url = function() {
					var object_url = get_URL().createObjectURL(blob);
					deletion_queue.push(object_url);
					return object_url;
				}
				, dispatch_all = function() {
					dispatch(filesaver, "writestart progress write writeend".split(" "));
				}
				// on any filesys errors revert to saving with object URLs
				, fs_error = function() {
					// don't create more object URLs than needed
					if (blob_changed || !object_url) {
						object_url = get_object_url(blob);
					}
					if (target_view) {
						target_view.location.href = object_url;
					} else {
                        window.open(object_url, "_blank");
                    }
					filesaver.readyState = filesaver.DONE;
					dispatch_all();
				}
				, abortable = function(func) {
					return function() {
						if (filesaver.readyState !== filesaver.DONE) {
							return func.apply(this, arguments);
						}
					};
				}
				, create_if_not_found = {create: true, exclusive: false}
				, slice
			;
			filesaver.readyState = filesaver.INIT;
			if (!name) {
				name = "download";
			}
			if (can_use_save_link) {
				object_url = get_object_url(blob);
				save_link.href = object_url;
				save_link.download = name;
				click(save_link);
				filesaver.readyState = filesaver.DONE;
				dispatch_all();
				return;
			}
			// Object and web filesystem URLs have a problem saving in Google Chrome when
			// viewed in a tab, so I force save with application/octet-stream
			// http://code.google.com/p/chromium/issues/detail?id=91158
			if (view.chrome && type && type !== force_saveable_type) {
				slice = blob.slice || blob.webkitSlice;
				blob = slice.call(blob, 0, blob.size, force_saveable_type);
				blob_changed = true;
			}
			// Since I can't be sure that the guessed media type will trigger a download
			// in WebKit, I append .download to the filename.
			// https://bugs.webkit.org/show_bug.cgi?id=65440
			if (webkit_req_fs && name !== "download") {
				name += ".download";
			}
			if (type === force_saveable_type || webkit_req_fs) {
				target_view = view;
			}
			if (!req_fs) {
				fs_error();
				return;
			}
			fs_min_size += blob.size;
			req_fs(view.TEMPORARY, fs_min_size, abortable(function(fs) {
				fs.root.getDirectory("saved", create_if_not_found, abortable(function(dir) {
					var save = function() {
						dir.getFile(name, create_if_not_found, abortable(function(file) {
							file.createWriter(abortable(function(writer) {
								writer.onwriteend = function(event) {
									target_view.location.href = file.toURL();
									deletion_queue.push(file);
									filesaver.readyState = filesaver.DONE;
									dispatch(filesaver, "writeend", event);
								};
								writer.onerror = function() {
									var error = writer.error;
									if (error.code !== error.ABORT_ERR) {
										fs_error();
									}
								};
								"writestart progress write abort".split(" ").forEach(function(event) {
									writer["on" + event] = filesaver["on" + event];
								});
								writer.write(blob);
								filesaver.abort = function() {
									writer.abort();
									filesaver.readyState = filesaver.DONE;
								};
								filesaver.readyState = filesaver.WRITING;
							}), fs_error);
						}), fs_error);
					};
					dir.getFile(name, {create: false}, abortable(function(file) {
						// delete file if it already exists
						file.remove();
						save();
					}), abortable(function(ex) {
						if (ex.code === ex.NOT_FOUND_ERR) {
							save();
						} else {
							fs_error();
						}
					}));
				}), fs_error);
			}), fs_error);
		}
		, FS_proto = FileSaver.prototype
		, saveAs = function(blob, name) {
			return new FileSaver(blob, name);
		}
	;
	FS_proto.abort = function() {
		var filesaver = this;
		filesaver.readyState = filesaver.DONE;
		dispatch(filesaver, "abort");
	};
	FS_proto.readyState = FS_proto.INIT = 0;
	FS_proto.WRITING = 1;
	FS_proto.DONE = 2;

	FS_proto.error =
	FS_proto.onwritestart =
	FS_proto.onprogress =
	FS_proto.onwrite =
	FS_proto.onabort =
	FS_proto.onerror =
	FS_proto.onwriteend =
		null;

	view.addEventListener("unload", process_deletion_queue, false);
	return saveAs;
}(self));

if (typeof module !== 'undefined') module.exports = saveAs;

},{}],8:[function(require,module,exports){
/*!
 * slidr v0.1.0 - A Javascript library for adding slide effects.
 * bchanx.com/slidr
 * MIT licensed
 *
 * Copyright (c) 2013 Brian Chan (bchanx.com)
 */
(function(root, factory) {
  // CommonJS
  if (typeof exports === 'object') module['exports'] = factory();

  // AMD module
  else if (typeof define === 'function' && define['amd']) define(factory);

  // Browser globals
  else root['slidr'] = factory();

} (this, function() {
  'use strict';

  // Traverse [keys] in {object} to lookup a value, or null if nothing found.
  function lookup(obj, keys) {
    var result = obj;
    for (var k in keys) {
      if (!result.hasOwnProperty(keys[k])) return null;
      result = result[keys[k]];
    }
    return (result === obj) ? null : result;
  }

  // Merge all properties from {arguments} and return the new {object}.
  function extend(/* arg1, arg2.. */) {
    var newobj = {};
    for (var i = 0, arg; arg = arguments[i]; i++) for (var a in arg) newobj[a] = arg[a];
    return newobj;
  }

  // Check whether node a contains node b.
  function contains(a, b) {
    return (a.contains) ? a.contains(b) : a.compareDocumentPosition(b) & 16;
  }

  // Returns the tag name, normalized.
  function tagName(el) {
    return (el.tagName) ? el.tagName.toLowerCase() : null;
  }

  // Creates a document element, and sets any properties passed in.
  function createEl(tag, props) {
    var el = document.createElement(tag);
    for (var p in props) el[p] = props[p];
    return el;
  }

  // Add/rm class(es) on an element.
  function classname(el, type /* class1, class2... */) {
    var clsnames = el.className.trim();
    clsnames = (clsnames) ? clsnames.split(/\s+/) : [];
    for (var a = 2, cls, idx; cls = arguments[a]; a++) {
      idx = clsnames.indexOf(cls);
      if (type === 'add' && idx < 0) clsnames.push(cls);
      if (type === 'rm' && idx >= 0) clsnames.splice(idx, 1);
    }
    el.className = clsnames.join(' ');
    return el;
  }

  // Normalize a string. Strip spaces, single, and double quotes then return in alphabetical order.
  function normalize(str) {
    return str.replace(/[\s'"]/gi, '').split('').sort().join('');
  }

  // Set name:value attribute for an element.
  function setattr(el, name, value) {
    if (el && el.setAttribute) el.setAttribute(name, value);
    return el;
  }

  // Get attribute from an element.
  function getattr(el, name) {
    return (el && el.getAttribute) ? el.getAttribute(name) : null;
  }

  // If `prop` is a string, do a CSS lookup. Otherwise, add CSS styles to `el`.
  function css(el, prop) {
    if (typeof prop === 'string') {
      var style = document.defaultView.getComputedStyle(el)[browser.fix(prop)];
      if (style) {
        var val = style.slice(0, -2);
        return (style.slice(-2) === 'px' && !isNaN(parseInt(val)) && val.search('px') <= 0) ? parseInt(val) : style;
      }
      return 'none';
    }
    for (var p in prop) if (browser.fix(p)) el.style[browser.fix(p)] = prop[p];
    return el;
  }

  // Bind element event(s) to a callback.
  function bind(el, ev, callback) {
    if (typeof(ev) === 'string') ev = [ev];
    for (var i = 0, e; e = ev[i]; i++) {
      e = (e === 'click' && 'ontouchstart' in window) ? 'touchend' : (el.attachEvent) ? 'on' + e : e;
      (el.attachEvent) ? el.attachEvent(e, callback) : el.addEventListener(e, callback);
    }
  }

  var browser = {

    // Vendor prefixes.
    prefixes: ['webkit', 'Moz', 'ms', 'O'],

    // CSS property cache.
    cache: {},

    // Reference to the document style element.
    styleEl: document.getElementsByTagName('html')[0]['style'],

    // Slidr CSS style sheet.
    styleSheet: (function() {
      var el = createEl('style', { 'type' : 'text/css' });
      document.getElementsByTagName('head')[0].appendChild(el);
      return el.sheet || el.styleSheet;
    }()),

    // Adds a CSS rule to our Slidr stylesheet.
    addCSSRule: function(name, rule, optSafe) {
      name = normalize(name);
      for (var r = 0, cssRule, cssName; cssRule = browser.styleSheet.cssRules[r]; r++) {
        cssName = normalize((cssRule.name || cssRule.selectorText || cssRule.cssText.split(' {')[0] || ''));
        if (cssName === name) {
          if (!!optSafe || (normalize(cssRule.cssText) === normalize(rule))) return;
          browser.styleSheet.deleteRule(r);
          break;
        }
      }
      browser.styleSheet.insertRule(rule, browser.styleSheet.cssRules.length);
    },

    // Creates a CSS rule.
    createRule: function(name, props) {
      var rule = [name, '{'];
      for (var p in props) rule.push(browser.fix(p, true) + ':' + props[p] + ';');
      rule.push('}');
      return rule.join(' ');
    },

    // Creates a CSS style.
    createStyle: function(name, props, optSafe) {
      browser.addCSSRule(name, browser.createRule(name, props), optSafe);
    },

    // Creates a keyframe animation rule.
    createKeyframe: function(name, rules) {
      var animation = browser.fix('animation', true);
      if (animation) {
        var prefix = (animation.split('-').length === 3) ? '-' + animation.split('-')[1] + '-' : '';
        var rule = ['@' + prefix + 'keyframes ' + name + ' {'];
        for (var r in rules) rule.push(browser.createRule(r + '%', rules[r]));
        rule.push('}');
        browser.addCSSRule(name, rule.join(' '));
      }
    },

    // Returns the browser supported property name, or null.
    fix: function(prop, forCSS) {
      if (!(prop in browser.cache)) {
        var parts = prop.split('-');
        for (var i = 0, p; p = parts[i]; i++) parts[i] = p[0].toUpperCase() + p.toLowerCase().slice(1);
        var domprop = parts.join('');
        domprop = domprop[0].toLowerCase() + domprop.slice(1);
        if (browser.styleEl[domprop] !== undefined) {
          browser.cache[prop] = { css: prop, dom: domprop };
        } else {
          domprop = parts.join('');
          for (i = 0; i < browser.prefixes.length; i++) {
            if (browser.styleEl[browser.prefixes[i] + domprop] !== undefined) {
              browser.cache[prop] = {
                css: '-' + browser.prefixes[i].toLowerCase() + '-' + prop, dom: browser.prefixes[i] + domprop
              };
            }
          }
        }
        if (!browser.cache[prop]) browser.cache[prop] = null;
      }
      return (browser.cache[prop] !== null) ? (forCSS) ? browser.cache[prop].css : browser.cache[prop].dom : null;
    },

    // Check whether all given css properties are supported in the browser.
    supports: function(/* prop1, prop2... */) {
      for (var i = 0, prop; prop = arguments[i]; i++) if (!browser.fix(prop)) return false;
      return true;
    },

    // Add CSS keyframes.
    add: {
      'fade': function(name, oStart, oEnd) {
        browser.createKeyframe(name, {
          '0': { 'opacity': oStart, 'visibility': 'visible' }, '100': { 'opacity': oEnd, 'visibility': 'hidden' }
        });
      },
      'linear': function(name, type, tStart, tEnd, oStart, oEnd) {
        browser.createKeyframe(name, {
          '0': { 'transform': 'translate' + (type === 'in' ? tEnd : tStart) + 'px)',
            'opacity': (type === 'in' ? '0' : oStart), 'visibility': 'visible' },
          '1': { 'transform': 'translate' + tStart + 'px)', 'opacity': (type === 'in' ? '0' : oStart) },
          '2': { 'transform': 'translate' + tStart + 'px)', 'opacity': oStart },
          '98': { 'transform': 'translate' + tEnd + 'px)', 'opacity': oEnd },
          '99': { 'transform': 'translate' + tEnd + 'px)', 'opacity': type === 'out' ? '0' : oEnd },
          '100': { 'transform': 'translate' + (type === 'out' ? tStart : tEnd) + 'px)', 'visibility': 'hidden' }
        });
      },
      'cube': function(name, rStart, rEnd, tZ, oStart, oEnd) {
        browser.createKeyframe(name, {
          '0': { 'transform': 'rotate' + rStart + 'deg) translateZ(' + tZ + 'px)', 'opacity': oStart,
            'visibility': 'visible' },
          '100': { 'transform': 'rotate' + rEnd + 'deg) translateZ(' + tZ + 'px)', 'opacity': oEnd,
            'visibility': 'hidden' }
        });
      }
    },

    // CSS classnames for breadcrumbs/controls.
    classnames: function(cls) {
      return {
        main: cls,
        maincss: 'aside[id*="-' + cls + '"]',
        nav: 'slidr-' + cls,
        navcss: 'aside[id*="-' + cls + '"] .slidr-' + cls,
        data: 'data-slidr-' + cls,
        id: function(_, css) { return css ? 'aside[id="' + _.id + '-' + cls + '"]' : _.id + '-' + cls; }
      }
    }
  };

  var transition = {

    // Available transitions.
    available: ['cube', 'fade', 'linear', 'none'],

    // Validates a given transition.
    validate: function(_, trans) {
      trans = trans || _.settings['transition'];
      return (transition.available.indexOf(trans) < 0 || !fx.supported[trans]) ? 'none' : trans;
    },

    // Get the direction transition for an element.
    get: function(_, el, type, dir) {
      return lookup(_.trans, [el, (type === 'in') ? slides.opposite(dir) : dir]);
    },

    // Sets the direction transition for an element.
    set: function(_, el, dir, trans) {
      trans = transition.validate(_, trans);
      if (!_.trans[el]) _.trans[el] = {};
      _.trans[el][dir] = trans;
      return trans;
    },

    // Applies a directional transition to an element entering/leaving the Slidr.
    apply: function(_, el, type, dir, opt_trans) {
      var trans = opt_trans || transition.get(_, el, type, dir);
      if (trans) {
        breadcrumbs.update(_, el, type);
        fx.animate(_, el, trans, type, dir);
      }
    }
  };

  var slides = {

    // Possible directions.
    directions: ['left', 'up', 'top', 'right', 'down', 'bottom'],

    // Check if next is a direction.
    isdir: function(next) {
      return slides.directions.indexOf(next) >= 0;
    },

    // Get the opoosite direction.
    opposite: function(dir) {
      var length = slides.directions.length;
      return slides.isdir(dir) ? slides.directions[(slides.directions.indexOf(dir) + length/2) % length] : null;
    },

    // Get slide metadata.
    get: function(_) {
      var args = [];
      for (var i = 1, a; (a = arguments[i++]) !== undefined; args.push(a)) {};
      return lookup(_.slides, args);
    },

    // Display our starting slide.
    display: function(_) {
      if (!_.displayed && slides.get(_, _.start)) {
        _.current = _.start;
        breadcrumbs.create(_);
        controls.create(_);
        fx.init(_, _.current, 'fade');
        fx.animate(_, _.current, 'fade', 'in');
        _.displayed = true;
        actions.controls(_, _.settings['controls']);
        if (!!_.settings['breadcrumbs']) actions.breadcrumbs(_);
      }
    },

    // Transition to the next slide.
    slide: function(_, next) {
      return slides.isdir(next) ? slides.go(_, slides.get(_, _.current, next), next, next) : slides.jump(_, next);
    },

    // Jump to a target slide.
    jump: function(_, el) {
      if (el && el !== _.current && slides.get(_, el)) {
        var cur = _.crumbs[_.current];
        var next = _.crumbs[el];
        var hdir = (cur.x < next.x) ? 'right' : (cur.x > next.x) ? 'left' : null;
        var vdir = (cur.y < next.y) ? 'up': (cur.y > next.y) ? 'down': null;
        var outdir = (transition.get(_, _.current, 'out', hdir)) ? hdir :
                     (transition.get(_, _.current, 'out', vdir)) ? vdir : null;
        var indir = (transition.get(_, el, 'in', hdir)) ? hdir :
                    (transition.get(_, el, 'in', vdir)) ? vdir : null;
        slides.go(_, el, outdir, indir, (outdir) ? null : 'fade', (indir) ? null : 'fade');
      }
    },

    // Go to a target slide.
    go: function(_, el, outdir, indir, opt_outtrans, opt_intrans) {
      if (_.current && el) {
        transition.apply(_, el, 'in', indir, opt_intrans);
        transition.apply(_, _.current, 'out', outdir, opt_outtrans);
        _.current = el;
        controls.update(_);
        return true;
      }
      return false;
    },

    // Finds all valid slides (direct children with 'data-slidr' attributes).
    find: function(_, opt_asList) {
      var valid = (opt_asList) ? [] : {};
      for (var i = 0, slide, name; slide = _.slidr.childNodes[i]; i++) {
        name = getattr(slide, 'data-slidr');
        if (name) {
          if (opt_asList && valid.indexOf(name) < 0) valid.push(name);
          else if (!(name in valid)) valid[name] = slide;
        }
      }
      return valid;
    },

    // Validate the [ids] we're trying to add doesn't conflict with existing slide assignments.
    validate: function(_, ids, trans, valid, prev, next) {
      if (!ids || ids.constructor !== Array) return false;
      // For each slide we're trying to add, check it against our known mapping.
      for (var i = 0, current, newPrev, newNext, oldPrev, oldNext, 
           prevPrev, oldPrevTrans, oldNextTrans; current = ids[i]; i++) {
        if (!(current in valid)) return false;
        if (slides.get(_, current)) {
          newPrev = ids[i-1] || null;
          newNext = ids[i+1] || null;
          oldPrev = slides.get(_, current, prev);
          oldNext = slides.get(_, current, next);
          prevPrev = slides.get(_, newNext, prev);
          oldPrevTrans = transition.get(_, current, 'out', prev);
          oldNextTrans = transition.get(_, current, 'out', next);
          // Are we about to override an existing mapping?
          if ((oldNext && newNext && oldNext != newNext)
            || (oldPrev && newPrev && oldPrev != newPrev)
            || (prevPrev && prevPrev != current)
            || (newPrev && oldPrevTrans && oldPrevTrans != trans)
            || (newNext && oldNextTrans && oldNextTrans != trans)
          ) {
            return false;
          }
        }
      }
      return true;
    },

    // Adds a [list] of ids to our Slidr.
    add: function(_, ids, trans, valid, prev, next) {
      for (var i = 0, current; current = ids[i]; i++) {
        _.slides[current] = _.slides[current] || {};
        var s = slides.get(_, current);
        s.el = valid[current];
        if (ids[i-1]) {
          s[prev] = ids[i-1];
          transition.set(_, current, prev, trans);
        }
        if (ids[i+1]) {
          s[next] = ids[i+1];
          transition.set(_, current, next, trans);
        }
        fx.init(_, current, trans);
        _.start = (!_.start) ? current : _.start;
      }
      if (_.started) (!_.displayed) ? slides.display(_) : breadcrumbs.create(_);
      return true;
    }
  };

  var controls = {

    // Classnames
    cls: browser.classnames('control'),

    // Available control types.
    types: ['border', 'corner', 'none'],

    // Whether it's a valid control type.
    valid: function(ctrl) {
      return controls.types.indexOf(ctrl) >= 0;
    },

    // Create controls container.
    create: function(_) {
      if (_.slidr && !_.controls) {
        _.controls = css(classname(createEl('aside', { 'id': controls.cls.id(_) }), 'add', 'disabled'), {
          'opacity': '0',
          'z-index': '0',
          'visibility': 'hidden',
          'pointer-events': 'none'
        });
        for (var n in _.nav) {
          _.nav[n] = setattr(classname(createEl('div'), 'add', controls.cls.nav, n), controls.cls.data, n);
          _.controls.appendChild(_.nav[n]);
        }
        controls.css(_);
        _.slidr.appendChild(_.controls);
        bind(_.controls, 'click', controls.onclick(_));
      }
    },

    // Controls CSS rules.
    css: function(_) {
      browser.createStyle(controls.cls.maincss, {
        'position': 'absolute',
        'bottom': '0',
        'right': '0',
        'padding': '10px',
        'box-sizing': 'border-box',
        'width': '75px',
        'height': '75px',
        'transform': 'translateZ(9998px)'
      }, true);
      browser.createStyle(controls.cls.maincss + '.disabled', {
        'transform': 'translateZ(0px) !important'
      }, true);
      browser.createStyle(controls.cls.maincss + '.breadcrumbs', {
        'left': '0',
        'right': 'auto'
      }, true);
      browser.createStyle(controls.cls.maincss + '.border', {
        'width': '100%',
        'height': '100%'
      }, true);
      browser.createStyle(controls.cls.navcss, {
        'position': 'absolute',
        'pointer-events': 'auto',
        'cursor': 'pointer',
        'transition': 'opacity 0.2s linear'
      }, true);
      browser.createStyle(controls.cls.navcss + '.disabled', {
        'opacity': '0.05',
        'cursor': 'auto'
      }, true);

      for (var n in _.nav) {
        var horizontal = (n === 'left' || n === 'right');
        var pos = (n === 'up') ? 'top' : (n === 'down') ? 'bottom' : n;
        var dir = horizontal ? 'top' : 'left';

        var ctrl = {
          'width': horizontal ? '22px': '16px',
          'height': horizontal ? '16px' : '22px'
        };
        ctrl[pos] = '0';
        ctrl[dir] = '50%';
        ctrl['margin-' + dir] = '-8px';
        browser.createStyle(controls.cls.navcss + '.' + n, ctrl, true);

        var after = {
          'width': '0',
          'height': '0',
          'content': '""',
          'position': 'absolute',
          'border': '8px solid transparent'
        };
        after['border-' + slides.opposite(pos) + '-width'] = '12px';
        after['border-' + pos + '-width'] = '10px';
        after['border-' + slides.opposite(pos) + '-color'] = _.settings['theme'];
        after[pos] = '0';
        after[dir] = '50%';
        after['margin-' + dir] = '-8px';
        browser.createStyle(controls.cls.id(_, true) + ' .' + controls.cls.nav + '.' + n + '::after', after, true);

        var border = {};
        border[horizontal ? 'height': 'width'] = '100%';
        border[dir] = '0';
        border['margin-' + dir] = '0';
        browser.createStyle(controls.cls.maincss + '.border .' + controls.cls.nav + '.' + n, border, true);
      }
    },

    // On click callback.
    onclick: function(_) {
      return function handler(e) {
        e = e || window.event;
        if (!e.target) e.target = e.srcElement;
        actions.slide(_, getattr(e.target, controls.cls.data));
      }
    },

    // Update controls.
    update: function(_) {
      for (var n in _.nav) classname(_.nav[n], actions.canSlide(_, n) ? 'rm' : 'add', 'disabled');
    }
  };

  var breadcrumbs = {
  
    // Classnames
    cls: browser.classnames('breadcrumbs'),

    // Initialize breadcrumbs container.
    init: function(_) {
      if (_.slidr && !_.breadcrumbs) {
        _.breadcrumbs = css(classname(createEl('aside', { 'id': breadcrumbs.cls.id(_) }), 'add', 'disabled'), {
          'opacity': '0',
          'z-index': '0',
          'pointer-events': 'none',
          'visibility': 'hidden'
        });
        breadcrumbs.css(_);
        _.slidr.appendChild(_.breadcrumbs);
        bind(_.breadcrumbs, 'click', breadcrumbs.onclick(_));
      }
    },

    // Breadcrumbs CSS rules.
    css: function(_) {
      browser.createStyle(breadcrumbs.cls.maincss, {
        'position': 'absolute',
        'bottom': '0',
        'right': '0',
        'padding': '10px',
        'box-sizing': 'border-box',
        'transform': 'translateZ(9999px)'
      }, true);
      browser.createStyle(breadcrumbs.cls.maincss + '.disabled', {
        'transform': 'translateZ(0px) !important'
      }, true);
      browser.createStyle(breadcrumbs.cls.navcss, {
        'font-size': '0',
        'line-height': '0'
      }, true);
      browser.createStyle(breadcrumbs.cls.navcss + ' li', {
        'width': '10px',
        'height': '10px',
        'display': 'inline-block',
        'margin': '3px'
      }, true);
      browser.createStyle(breadcrumbs.cls.id(_, true) + ' .' + breadcrumbs.cls.nav + ' li.normal', {
        'border-radius': '100%',
        'border': '1px ' + _.settings['theme'] +' solid',
        'cursor': 'pointer',
        'pointer-events': 'auto'
      }, true);
      browser.createStyle(breadcrumbs.cls.id(_, true) + ' .' + breadcrumbs.cls.nav + ' li.active', {
        'width': '12px',
        'height': '12px',
        'margin': '2px',
        'background-color': _.settings['theme']
      }, true);
    },

    // On click callback.
    onclick: function(_) {
      return function handler(e) {
        e = e || window.event;
        if (!e.target) e.target = e.srcElement;
        actions.slide(_, getattr(e.target, breadcrumbs.cls.data));
      }
    },

    // Breadcrumb offsets.
    offsets: {
      'right': { x: 1, y: 0 },
      'up': { x: 0, y: 1 },
      'left': { x: -1, y: 0 },
      'down': { x: 0, y: -1 }
    },

    // Find breadcrumbs.
    find: function(_, crumbs, bounds, el, x, y) {
      if (el) {
        if (!crumbs[el]) {
          crumbs[el] = { x: x, y: y };
          if (x < bounds.x.min) bounds.x.min = x;
          if (x > bounds.x.max) bounds.x.max = x;
          if (y < bounds.y.min) bounds.y.min = y;
          if (y > bounds.y.max) bounds.y.max = y;
        }
        el = slides.get(_, el);
        for (var o in breadcrumbs.offsets) {
          if (el[o] && !crumbs[el[o]]) {
            breadcrumbs.find(_, crumbs, bounds, el[o], x + breadcrumbs.offsets[o].x, y + breadcrumbs.offsets[o].y);
          }
        }
      }
    },

    // Update breadcrumbs.
    update: function(_, el, type) {
      classname(_.crumbs[el].el, type === 'in' ? 'add' : 'rm', 'active');
    },

    // Create breadcrumbs.
    create: function(_) {
      breadcrumbs.init(_);
      if (_.breadcrumbs) {
        var crumbs = {};
        var bounds = { x: { min: 0, max: 0 }, y: { min: 0, max: 0 } };
        breadcrumbs.find(_, crumbs, bounds, _.start, 0, 0);
        bounds.x.modifier = 0 - bounds.x.min;
        bounds.y.modifier = 0 - bounds.y.min;
        var crumbsMap = {};
        for (var el in crumbs) {
          crumbs[el].x += bounds.x.modifier;
          crumbs[el].y += bounds.y.modifier;
          crumbsMap[crumbs[el].x + ',' + crumbs[el].y] = el;
        }
        var rows = bounds.y.max - bounds.y.min + 1;
        var columns = bounds.x.max - bounds.x.min + 1;
        while (_.breadcrumbs.firstChild) _.breadcrumbs.removeChild(_.breadcrumbs.firstChild);
        var ul = classname(createEl('ul'), 'add', breadcrumbs.cls.nav);
        var li = createEl('li');
        for (var r = rows - 1, ulclone; r >= 0; r--) {
          ulclone = ul.cloneNode(false);
          for (var c = 0, liclone, element; c < columns; c++) {
            liclone = li.cloneNode(false);
            element = crumbsMap[c + ',' + r];
            if (element) {
              classname(liclone, 'add', 'normal', element === _.current ? 'active' : null);
              setattr(liclone, breadcrumbs.cls.data, element);
              crumbs[element].el = liclone;
            }
            ulclone.appendChild(liclone);
          };
          _.breadcrumbs.appendChild(ulclone);
        }
        _.crumbs = crumbs;
      }
    }
  };

  var fx = {

    // CSS rules to apply to a slide on initialize.
    init: function(_, el, trans) {
      var init = lookup(fx.animation, [trans, 'init']) || {};
      var s = slides.get(_, el);
      if (!s.initialized) {
        var display = css(s.el, 'display');
        init = extend({
          'display': (display === 'none') ? 'block' : display,
          'visibility': 'hidden',
          'position': 'absolute',
          'opacity': '0',
          'z-index': '0',
          'pointer-events': 'none'
        }, init);
        s.initialized = true;
      }
      css(s.el, init);
    },

    // Properties defining animation support.
    supported: {
      'none': true,
      'fade': browser.supports('animation', 'opacity'),
      'linear': browser.supports('animation', 'opacity', 'transform'),
      'cube': browser.supports('animation', 'backface-visibility', 'opacity', 'transform', 'transform-style')
    },

    // Defines our slide animations.
    animation: {
      'fade': {
        'init': (function() {
          browser.add['fade']('slidr-fade-in', '0', '1');
          browser.add['fade']('slidr-fade-out', '1', '0');
          return null; 
        })()
      },
      'linear': {
        'in': {
          'left': function(name, w, o) { browser.add['linear'](name, 'in', 'X(-' + w, 'X(0', o, '1'); },
          'right': function(name, w, o) { browser.add['linear'](name, 'in', 'X(' + w, 'X(0', o, '1'); },
          'up': function(name, h, o) { browser.add['linear'](name, 'in', 'Y(-' + h, 'Y(0', o, '1'); },
          'down': function(name, h, o) { browser.add['linear'](name, 'in', 'Y(' + h, 'Y(0', o, '1'); }
        },
        'out': {
          'left': function(name, w, o) { browser.add['linear'](name, 'out', 'X(0', 'X(' + w, '1', o); },
          'right': function(name, w, o) { browser.add['linear'](name, 'out', 'X(0', 'X(-' + w, '1', o); },
          'up': function(name, h, o) { browser.add['linear'](name, 'out', 'Y(0', 'Y(' + h, '1', o); },
          'down': function(name, h, o) { browser.add['linear'](name, 'out', 'Y(0', 'Y(-' + h, '1', o); }
        }
      },
      'cube': {
        'init': { 'backface-visibility': 'hidden', 'transform-style': 'preserve-3d' },
        'in': {
          'left': function(name, w, o) { browser.add['cube'](name, 'Y(-90', 'Y(0', w/2, o, '1'); },
          'right': function(name, w, o) { browser.add['cube'](name, 'Y(90', 'Y(0', w/2, o, '1'); },
          'up': function(name, h, o) { browser.add['cube'](name, 'X(90', 'X(0', h/2, o, '1'); },
          'down': function(name, h, o) { browser.add['cube'](name, 'X(-90', 'X(0', h/2, o, '1'); }
        },
        'out': {
          'left': function(name, w, o) { browser.add['cube'](name, 'Y(0', 'Y(90', w/2, '1', o); },
          'right': function(name, w, o) { browser.add['cube'](name, 'Y(0', 'Y(-90', w/2, '1', o); },
          'up': function(name, h, o) { browser.add['cube'](name, 'X(0', 'X(-90', h/2, '1', o); },
          'down': function(name, h, o) { browser.add['cube'](name, 'X(0', 'X(90', h/2, '1', o); }
        }
      }
    },

    // Resolve keyframe animation name.
    name: function(_, trans, type, dir) {
      var parts = [trans === 'fade' ? 'slidr' : _.id, trans, type];
      if (trans !== 'fade') parts.push(dir);
      return parts.join('-');
    },

    // Animate an `el` with `trans` effects coming [in|out] as `type` from direction `dir`.
    animate: function(_, el, trans, type, dir, opt_target, opt_z, opt_pointer) {
      var anim = {
        'opacity': (type === 'in') ? '1': '0',
        'z-index': opt_z || (type === 'in' ? '1': '0'),
        'visibility': (type === 'in') ? 'visible': 'hidden',
        'pointer-events': opt_pointer || (type === 'in' ? 'auto': 'none')
      };
      var target = opt_target || slides.get(_, el).el;
      var timing = _.settings['timing'][trans];
      if (fx.supported[trans] && timing) {
        var name = fx.name(_, trans, type, dir);
        var keyframe = lookup(fx.animation, [trans, type, dir]);
        if (keyframe && dir) {
          var size = css(target, (dir === 'up' || dir === 'down') ? 'height' : 'width');
          var opacity = (!!_.settings['fade']) ? '0' : '1';
          keyframe(name, size, opacity);
        }
        anim['animation'] = (trans === 'none') ? 'none' : [name, timing].join(' ');
      }
      css(target, anim);
      if (slides.get(_, el)) fx.fixTranslateZ(_, target, type);
    },

    // Toggle translateZ on breadcrumbs/controls so it doesn't interfere with page flow.
    fixTranslateZ: function(_, el, opt_type) {
      var asides = el.getElementsByTagName('aside');
      if (asides.length) {
        for (var i = 0, aside, p, toggle, visibility; aside = asides[i]; i++) {
          if (!!aside.getAttribute('id')) {
            // Get the first parent data-slidr node, or use the current Slidr element.
            p = aside.parentNode;
            while (!getattr(p, 'data-slidr') && tagName(p) !== 'body') p = p.parentNode;
            if (tagName(p) === 'body') p = _.slidr;
            visibility = css(p, 'visibility');
            toggle = (opt_type === 'out' || !opt_type && visibility === 'hidden') ? 'add' :
                     (visibility === 'visible') ? 'rm' : null;
            if (toggle) classname(aside, toggle, 'disabled');
          }
        }
      }
    }
  };

  var size = {

    // Check whether width, height, and borderbox should by dynamically updated.
    dynamic: function(_) {
      var clone = css(_.slidr.cloneNode(false), { 'position': 'absolute', 'opacity': '0' });
      var probe = css(createEl('div'), { 'width': '42px', 'height': '42px' });
      clone.appendChild(probe);
      _.slidr.parentNode.insertBefore(clone, _.slidr);
      var borderbox = css(clone, 'box-sizing') === 'border-box';
      var originalWidth = (borderbox ? size.widthPad(_) + size.widthBorder(_) : 0) + 42;
      var originalHeight = (borderbox ? size.heightPad(_) + size.heightBorder(_) : 0) + 42;
      var cloneWidth = css(clone, 'width');
      var cloneHeight = css(clone, 'height');
      var dynamic = {
        width: cloneWidth === 'auto' || cloneWidth === originalWidth || css(clone, 'min-width') !== 0,
        height: cloneHeight === 'auto' || cloneHeight === originalHeight || css(clone, 'min-height') !== 0,
        borderbox: borderbox
      };
      _.slidr.parentNode.removeChild(clone);
      return dynamic;
    },

    // Grabs the Slidr width/height padding.
    widthPad: function(_) {
      return css(_.slidr, 'padding-left') + css(_.slidr, 'padding-right');
    },
    heightPad: function(_) {
      return css(_.slidr, 'padding-top') + css(_.slidr, 'padding-bottom');
    },

    // Grabs the Slidr width/height border.
    widthBorder: function(_) {
      return css(_.slidr, 'border-left-width') + css(_.slidr, 'border-right-width');
    },
    heightBorder: function(_) {
      return css(_.slidr, 'border-top-width') + css(_.slidr, 'border-bottom-width');
    },

    // Sets the width/height of our Slidr container.
    setWidth: function(_, w, borderbox) {
      css(_.slidr, { width: w + (borderbox ? size.widthPad(_) : 0) + 'px' }); return w;
    },
    setHeight: function(_, h, borderbox) {
      css(_.slidr, { height: h + (borderbox ? size.heightPad(_) : 0) + 'px' }); return h;
    },

    // Monitor our Slidr and auto resize if necessary.
    autoResize: function(_) {
      var h = 0;
      var w = 0;
      var d = size.dynamic(_);
      var timerId = setInterval((function watch() {
        if (!contains(document, _.slidr)) {
          clearInterval(timerId);
        } else if (css(_.slidr, 'visibility') === 'hidden') {
          h = size.setHeight(_, 0, d.borderbox);
          w = size.setWidth(_, 0, d.borderbox);
        } else if (slides.get(_, _.current)) {
          var el = slides.get(_, _.current).el;
          var height = css(el, 'height');
          var width = css(el, 'width');
          if (d.height && h != height) h = size.setHeight(_, height, d.borderbox);
          if (d.width && w != width) w = size.setWidth(_, width, d.borderbox);
        }
        return watch;
      })(), 250);
    }
  };

  var actions = {

    // Starts a Slidr.
    start: function(_, opt_start) {
      if (!_.started && _.slidr) {
        var display = css(_.slidr, 'display');
        var position = css(_.slidr, 'position');
        css(_.slidr, {
          'visibility': 'visible',
          'opacity': css(_.slidr, 'opacity'),
          'display': (display === 'inline-block' || display === 'inline') ? 'inline-block' : 'block',
          'position': (position === 'static') ? 'relative' : position,
          'overflow': (!!_.settings['overflow']) ? css(_.slidr, 'overflow') : 'hidden'
        });
        if (!_.start) actions.add(_, _.settings['direction'], slides.find(_, true), _.settings['transition']);
        if (slides.get(_, opt_start)) _.start = opt_start;
        slides.display(_);
        size.autoResize(_);
        fx.fixTranslateZ(_, _.slidr);
        _.started = true;
        controls.update(_);
      }
    },

    // Can we slide?
    canSlide: function(_, next) {
      return _.started && (slides.isdir(next) ? !!slides.get(_, _.current, next) : !!slides.get(_, next));
    },

    // Slide.
    slide: function(_, next) {
      if (_.started && next) slides.slide(_, next);
    },

    // Adds a set of slides.
    add: function(_, direction, ids, opt_transition, opt_overwrite) {
      if (_.slidr) {
        var trans = transition.validate(_, opt_transition);
        var valid = slides.find(_);
        var prev = (direction === 'horizontal' || direction === 'h') ? 'left' : 'up';
        var next = (direction === 'horizontal' || direction === 'h') ? 'right' : 'down';
        if (!slides.validate(_, ids, trans, valid, prev, next) && !opt_overwrite) {
          console.warn('[Slidr] Error adding [' + direction + '] slides for [' + _.id + '].');
        } else {
          slides.add(_, ids, trans, valid, prev, next);
        }
      }
    },

    // Automatically transition between slides.
    auto: function(_, msec, direction) {
      if (_.started && slides.isdir(direction)) {
        actions.stop(_);
        _.auto = setInterval(function() { slides.slide(_, direction); }, msec);
      }
    },

    // Stops auto transitioning.
    stop: function(_) {
      if (_.started && _.auto) {
        clearInterval(_.auto);
        _.auto = null;
      }
    },

    // Toggle breadcrumbs.
    breadcrumbs: function(_) {
      if (_.breadcrumbs && _.displayed) {
        var type = css(_.breadcrumbs, 'opacity') === '0' ? 'in' : 'out';
        fx.animate(_, null, 'fade', type, null, _.breadcrumbs, '3', 'none');
        if (_.controls) classname(_.controls, type === 'in' ? 'add' : 'rm', 'breadcrumbs');
      }
    },

    // Toggle controls.
    controls: function(_, opt_scheme) {
      if (_.controls && _.displayed) {
        if (!controls.valid(opt_scheme)) opt_scheme = null;
        var hidden = css(_.controls, 'visibility') === 'hidden';
        var type = (opt_scheme && opt_scheme !== 'none') ? 'in' : 'out';
        if (type === 'out' && hidden) return;
        if (opt_scheme === 'border') classname(_.controls, 'add', 'border');
        else if (opt_scheme === 'corner') classname(_.controls, 'rm', 'border');
        fx.animate(_, null, 'fade', type, null, _.controls, '2', 'none');
      }
    }
  };

  // The Slidr constructor.
  var Slidr = function(id, el, settings) {

    var _ = {
      // Slidr id.
      id: id,

      // Reference to the Slidr element.
      slidr: el,

      // Reference to the Slidr breadcrumbs element.
      breadcrumbs: null,

      // Reference to the Slidr controller element.
      controls: null,

      // Settings for this Slidr.
      settings: settings,

      // Whether we've successfully called start().
      started: false,

      // Whether we've successfully called slides.display().
      displayed: false,

      // The slide to start at.
      start: null,

      // The current slide.
      current: null,

      // Whether auto() is currently active. Stores the timer interval id.
      auto: null,

      // A {mapping} of slides to their neighbors.
      slides: {},

      // A {mapping} of slides and their transition effects.
      trans: {},

      // A {mapping} of slides and their (x, y) position.
      crumbs: {},

      // Reference to the Slidr controller navigators.
      nav: { 'up': null, 'down': null, 'left': null, 'right': null }
    };

    var api = {

      /**
       * Start the Slidr!
       * Automatically finds slides to create if nothing was added prior to calling start().
       * @param {string} opt_start `data-slidr` id to start on.
       * @return {this}
       */
      'start': function(opt_start) {
        actions.start(_, opt_start);
        return this;
      },

      /**
       * Check whether we can slide.
       * @param {string} next a direction ('up', 'down', 'left', 'right') or a `data-slidr` id.
       * @return {boolean}
       */
      'canSlide': function(next) {
        return actions.canSlide(_, next);
      },

      /**
       * Slide!
       * @param {string} next a direction ('up', 'down', 'left', 'right') or a `data-slidr` id.
       * @return {this}
       */
      'slide': function(next) {
        actions.slide(_, next);
        return this;
      },

      /**
       * Adds a set of slides.
       * @param {string} direction `horizontal || h` or `vertical || v`.
       * @param {Array} ids A list of `data-slidr` id's to add to Slidr. Slides must be direct children of the Slidr.
       * @param {string=} opt_transition The transition to apply between the slides, or uses the default.
       * @param {boolean=} opt_overwrite Whether to overwrite existing slide mappings/transitions if conflicts occur.
       * @return {this}
       */
      'add': function(direction, ids, opt_transition, opt_overwrite) {
        actions.add(_, direction, ids, opt_transition, opt_overwrite);
        return this;
      },

      /**
       * Automatically advance to the next slide after a certain timeout. Calls start() if not already called.
       * @param {int=} opt_msec The number of millis between each slide transition. Defaults to 5000 (5 seconds).
       * @param {string=} opt_direction 'up', 'down', 'left', or 'right'. Defaults to 'right'.
       * @param {string=} opt_start The `data-slidr` id to start at (only works if auto is called to start the Slidr).
       * @return {this}
       */
      'auto': function(opt_msec, opt_direction, opt_start) {
        actions.start(_, opt_start);
        actions.auto(_, opt_msec || 5000, opt_direction || 'right');
        return this;
      },

      /**
       * Stop auto transition if it's turned on.
       * @return {this}
       */
      'stop': function() {
        actions.stop(_);
        return this;
      },

      /**
       * Set custom animation timings.
       * @param {string|Object} transition Either a transition name (i.e. 'cube'), or a {'transition': 'timing'} object.
       * @param {string=} opt_timing The new animation timing (i.e "0.5s ease-in"). Not required if transition is an object.
       * @return {this}
       */
      'timing': function(transition, opt_timing) {
        if (!!transition && transition.constructor === Object) {
          _.settings['timing'] = extend(_.settings['timing'], transition);
        } else if (typeof(transition) === 'string' && typeof(opt_timing) === 'string') {
          _.settings['timing'][transition] = opt_timing;
        }
        return this;
      },

      /**
       * Toggle breadcrumbs.
       * @return {this}
       */
      'breadcrumbs': function() {
        actions.breadcrumbs(_);
        return this;
      },

      /**
       * Toggle controls.
       * @param {string=} opt_scheme Toggle on/off if not present, else change scheme. `border`, `corner` or `none`.
       * @return {this}
       */
      'controls': function(opt_scheme) {
        actions.controls(_, opt_scheme);
        return this;
      }
    };

    return api;
  };

  // Current version.
  var VERSION = '0.1.0';

  // Active Slidr instances.
  var INSTANCES = {};

  // Slidr default settings.
  var DEFAULTS = {
    'breadcrumbs': false,         // Show or hide breadcrumbs on start(). `true` or `false`.
    'controls': 'border',         // Show or hide control arrows on start(). `border`, `corner` or `none`.
    'direction': 'horizontal',    // The default direction for new slides. `horizontal` or `h`, `vertical` or `v`.
    'fade': true,                 // Whether slide transitions should fade in/out. `true` or `false`.
    'overflow': false,            // Whether to overflow transitions at slidr borders. `true` or `false`.
    'theme': '#fff',              // Sets color theme for breadcrumbs/controls. #hexcode or rgba(value).
    'timing': {},                 // Custom animation timings to apply. {'transition': 'timing'}.
    'transition': 'linear'        // The default transition to apply. `cube`, `linear`, `fade`, or `none`.
  };

  // Slidr default animation timings.
  var TIMING = {
    'none': 'none',
    'fade': '0.4s ease-out',
    'linear': '0.6s ease-out',
    'cube': '1s cubic-bezier(0.15, 0.9, 0.25, 1)'
  };

  // Global API.
  return {
    /**
     * Current version.
     * @return {string} major.minor.patch.
     */
    'version': function() {
      return VERSION;
    },

    /**
     * Available transitions.
     * @return {Array} of transitions.
     */
    'transitions': function() {
      return transition.available.slice(0);
    },

    /**
     * Creates and returns a Slidr.
     * Calling create on the same element twice returns the already instantiated Slidr.
     * @param {string} id The element id to turn into a Slidr.
     * @param {Object=} opt_settings Settings to apply.
     */
    'create': function(id, opt_settings) {
      var el = document.getElementById(id);
      if (!el) {
        console.warn('[Slidr] Could not find element with id [' + id + '].');
        return;
      }
      var settings = extend(DEFAULTS, opt_settings || {});
      settings['timing'] = extend(TIMING, settings['timing']);
      INSTANCES[id] = INSTANCES[id] || new Slidr(id, el, settings);
      return INSTANCES[id];
    }
  };

}));

},{}],9:[function(require,module,exports){

/**
 * Object#toString() ref for stringify().
 */

var toString = Object.prototype.toString;

/**
 * Array#indexOf shim.
 */

var indexOf = typeof Array.prototype.indexOf === 'function'
  ? function(arr, el) { return arr.indexOf(el); }
  : function(arr, el) {
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] === el) return i;
      }
      return -1;
    };

/**
 * Array.isArray shim.
 */

var isArray = Array.isArray || function(arr) {
  return toString.call(arr) == '[object Array]';
};

/**
 * Object.keys shim.
 */

var objectKeys = Object.keys || function(obj) {
  var ret = [];
  for (var key in obj) ret.push(key);
  return ret;
};

/**
 * Array#forEach shim.
 */

var forEach = typeof Array.prototype.forEach === 'function'
  ? function(arr, fn) { return arr.forEach(fn); }
  : function(arr, fn) {
      for (var i = 0; i < arr.length; i++) fn(arr[i]);
    };

/**
 * Array#reduce shim.
 */

var reduce = function(arr, fn, initial) {
  if (typeof arr.reduce === 'function') return arr.reduce(fn, initial);
  var res = initial;
  for (var i = 0; i < arr.length; i++) res = fn(res, arr[i]);
  return res;
};

/**
 * Cache non-integer test regexp.
 */

var isint = /^[0-9]+$/;

function promote(parent, key) {
  if (parent[key].length == 0) return parent[key] = {};
  var t = {};
  for (var i in parent[key]) t[i] = parent[key][i];
  parent[key] = t;
  return t;
}

function parse(parts, parent, key, val) {
  var part = parts.shift();
  // end
  if (!part) {
    if (isArray(parent[key])) {
      parent[key].push(val);
    } else if ('object' == typeof parent[key]) {
      parent[key] = val;
    } else if ('undefined' == typeof parent[key]) {
      parent[key] = val;
    } else {
      parent[key] = [parent[key], val];
    }
    // array
  } else {
    var obj = parent[key] = parent[key] || [];
    if (']' == part) {
      if (isArray(obj)) {
        if ('' != val) obj.push(val);
      } else if ('object' == typeof obj) {
        obj[objectKeys(obj).length] = val;
      } else {
        obj = parent[key] = [parent[key], val];
      }
      // prop
    } else if (~indexOf(part, ']')) {
      part = part.substr(0, part.length - 1);
      if (!isint.test(part) && isArray(obj)) obj = promote(parent, key);
      parse(parts, obj, part, val);
      // key
    } else {
      if (!isint.test(part) && isArray(obj)) obj = promote(parent, key);
      parse(parts, obj, part, val);
    }
  }
}

/**
 * Merge parent key/val pair.
 */

function merge(parent, key, val){
  if (~indexOf(key, ']')) {
    var parts = key.split('[')
      , len = parts.length
      , last = len - 1;
    parse(parts, parent, 'base', val);
    // optimize
  } else {
    if (!isint.test(key) && isArray(parent.base)) {
      var t = {};
      for (var k in parent.base) t[k] = parent.base[k];
      parent.base = t;
    }
    set(parent.base, key, val);
  }

  return parent;
}

/**
 * Parse the given obj.
 */

function parseObject(obj){
  var ret = { base: {} };
  forEach(objectKeys(obj), function(name){
    merge(ret, name, obj[name]);
  });
  return ret.base;
}

/**
 * Parse the given str.
 */

function parseString(str){
  return reduce(String(str).split('&'), function(ret, pair){
    var eql = indexOf(pair, '=')
      , brace = lastBraceInKey(pair)
      , key = pair.substr(0, brace || eql)
      , val = pair.substr(brace || eql, pair.length)
      , val = val.substr(indexOf(val, '=') + 1, val.length);

    // ?foo
    if ('' == key) key = pair, val = '';
    if ('' == key) return ret;

    return merge(ret, decode(key), decode(val));
  }, { base: {} }).base;
}

/**
 * Parse the given query `str` or `obj`, returning an object.
 *
 * @param {String} str | {Object} obj
 * @return {Object}
 * @api public
 */

exports.parse = function(str){
  if (null == str || '' == str) return {};
  return 'object' == typeof str
    ? parseObject(str)
    : parseString(str);
};

/**
 * Turn the given `obj` into a query string
 *
 * @param {Object} obj
 * @return {String}
 * @api public
 */

var stringify = exports.stringify = function(obj, prefix) {
  if (isArray(obj)) {
    return stringifyArray(obj, prefix);
  } else if ('[object Object]' == toString.call(obj)) {
    return stringifyObject(obj, prefix);
  } else if ('string' == typeof obj) {
    return stringifyString(obj, prefix);
  } else {
    return prefix + '=' + encodeURIComponent(String(obj));
  }
};

/**
 * Stringify the given `str`.
 *
 * @param {String} str
 * @param {String} prefix
 * @return {String}
 * @api private
 */

function stringifyString(str, prefix) {
  if (!prefix) throw new TypeError('stringify expects an object');
  return prefix + '=' + encodeURIComponent(str);
}

/**
 * Stringify the given `arr`.
 *
 * @param {Array} arr
 * @param {String} prefix
 * @return {String}
 * @api private
 */

function stringifyArray(arr, prefix) {
  var ret = [];
  if (!prefix) throw new TypeError('stringify expects an object');
  for (var i = 0; i < arr.length; i++) {
    ret.push(stringify(arr[i], prefix + '[' + i + ']'));
  }
  return ret.join('&');
}

/**
 * Stringify the given `obj`.
 *
 * @param {Object} obj
 * @param {String} prefix
 * @return {String}
 * @api private
 */

function stringifyObject(obj, prefix) {
  var ret = []
    , keys = objectKeys(obj)
    , key;

  for (var i = 0, len = keys.length; i < len; ++i) {
    key = keys[i];
    if (null == obj[key]) {
      ret.push(encodeURIComponent(key) + '=');
    } else {
      ret.push(stringify(obj[key], prefix
        ? prefix + '[' + encodeURIComponent(key) + ']'
        : encodeURIComponent(key)));
    }
  }

  return ret.join('&');
}

/**
 * Set `obj`'s `key` to `val` respecting
 * the weird and wonderful syntax of a qs,
 * where "foo=bar&foo=baz" becomes an array.
 *
 * @param {Object} obj
 * @param {String} key
 * @param {String} val
 * @api private
 */

function set(obj, key, val) {
  var v = obj[key];
  if (undefined === v) {
    obj[key] = val;
  } else if (isArray(v)) {
    v.push(val);
  } else {
    obj[key] = [v, val];
  }
}

/**
 * Locate last brace in `str` within the key.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function lastBraceInKey(str) {
  var len = str.length
    , brace
    , c;
  for (var i = 0; i < len; ++i) {
    c = str[i];
    if (']' == c) brace = false;
    if ('[' == c) brace = true;
    if ('=' == c && !brace) return i;
  }
}

/**
 * Decode `str`.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

function decode(str) {
  try {
    return decodeURIComponent(str.replace(/\+/g, ' '));
  } catch (err) {
    return str;
  }
}

},{}]},{},[4])
;