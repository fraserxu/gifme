var VideoShooter = require('./videoShooter');
var gumHelper = require('./gumhelper');
var saveAs = require('filesaver.js');
var request = require('browser-request');
var qs = require('querystring');
var videoShooter;

var imgur= {
	api: 'https://api.imgur.com/3/image',
	client: '76e5943d38e8f8e'
};

if (navigator.getMedia) {
	gumHelper.startVideoStreaming(function errorCb() {}, function successCallback(stream, videoElement, width, height) {
		videoElement.width = width / 2;
		videoElement.height = height / 2;
		document.querySelector('#webcam').appendChild(videoElement);
		videoElement.play();
		videoShooter = new VideoShooter(videoElement);
	});
} else {
	console.log('sorry, your browser does\'s support getMedia.');
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
	var imgUrl = document.querySelector('#target').getAttribute('src');
	var blob = dataURItoBlob(imgUrl, 'image/gif');
	var filename = (document.querySelector('#filename').value || 'gifme') + '.gif';

	saveAs(blob, filename);
})

// upload to imgur
var upload_button = document.querySelector('#upload');
upload_button.addEventListener('click', function() {
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
		var data = JSON.parse(body).data;
		console.log(data.link)
	})
	// var req = hq.post('https://api.imgur.com/3/image');
	// var req = hq.post('https://api.imgur.com/3/image');
	// req.setHeader('Authorization', 'Client-ID ' + imgUrl_client);
	// req.pipe(concat(function (err, data) {
 //    console.log('data=' + data);
	// }));
	// req.end({ image: imgUrl.split(',')[1]});
})

