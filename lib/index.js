var VideoShooter = require('./videoShooter');
var gumHelper = require('./gumhelper');
var saveAs = require('filesaver.js');
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

// capture a gif
var capture_button = document.querySelector('#capture');
capture_button.addEventListener('click', function() {
	getScreenshot(function(pictureData) {
		console.log(pictureData)
	}, 10, 0.2);
})

function dataURItoBlob(dataURI, dataTYPE) {
	var binary = atob(dataURI.split(',')[1]),
		array = [];
	for (var i = 0; i < binary.length; i++) array.push(binary.charCodeAt(i));
	return new Blob([new Uint8Array(array)], {
		type: dataTYPE
	});
}

// save to local
var save_button = document.querySelector('#saveAs');
save_button.addEventListener('click', function() {
	var img = document.querySelector('#target');
	var imgUrl = img.getAttribute('src');
	console.log('imgUrl', imgUrl);
	var blob = dataURItoBlob(imgUrl, 'image/gif');
	saveAs(blob, "test.gif");
})