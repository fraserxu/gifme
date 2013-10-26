;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
},{}],2:[function(require,module,exports){
var VideoShooter = require('./videoShooter');
var gumHelper = require('./gumhelper');

if (navigator.getMedia) {
	gumHelper.startVideoStreaming(function errorCb() {}, function successCallback(stream, videoElement, width, height) {
		videoElement.width = width / 5;
		videoElement.height = height / 5;
		document.querySelector('body').appendChild(videoElement);
		videoElement.play();
		videoShooter = new VideoShooter(videoElement);
	});
} else {
	console.log('what?')
}
},{"./gumhelper":1,"./videoShooter":3}],3:[function(require,module,exports){
module.exports = function() {
	'use strict';

  function VideoShooter (videoElement) {
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');

    canvas.width = videoElement.width;
    canvas.height = videoElement.height;

    this.getShot = function (callback, numFrames, interval) {
      numFrames = numFrames !== undefined ? numFrames : 3;
      interval = interval !== undefined ? interval : 0.1; // In seconds
      
      var pendingFrames = numFrames;
      var ag = new Animated_GIF({ workerPath: 'javascripts/lib/Animated_GIF/quantizer.js' });
      ag.setSize(canvas.width, canvas.height);
      ag.setDelay(interval);

      captureFrame();

      function captureFrame() {
          ag.addFrame(videoElement);
          pendingFrames--;

          if(pendingFrames > 0) {
              setTimeout(captureFrame, interval * 1000); // timeouts are in milliseconds
          } else {
              ag.getBase64GIF(function(image) {
                  var img = document.createElement('img');
                  img.src = image;
                  document.body.appendChild(img);
                  callback(image);
              });
          }
      }

    };
  };

  return VideoShooter;
}

},{}]},{},[2])
;