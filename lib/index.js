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