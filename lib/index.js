var VideoShooter = require('./videoShooter');
var gumHelper = require('./gumhelper');
var videoShooter;

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

function getScreenshot(callback, numFrames, interval) {
	if (videoShooter) {
	  videoShooter.getShot(callback, numFrames, interval);
	} else {
	  callback('');
	}
};

var capture_button = document.querySelector('#capture');
capture_button.addEventListener('click', function() {
	getScreenshot(function(pictureData) {
    console.log(pictureData)
  }, 10, 0.2);
})