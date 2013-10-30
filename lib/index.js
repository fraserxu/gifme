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
	.add('h', ['one', 'two'])
	.add('v', ['two', 'three'], 'cube')
	.start();

// buttons
var save_button = document.querySelector('#saveAs');
var upload_button = document.querySelector('#upload');
var capture_button = document.querySelector('#capture');

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
	
	if (navigator.getMedia) {
		gumHelper.startVideoStreaming(function errorCb() {}, function successCallback(stream, videoElement, width, height) {
			videoElement.width = width / 2;
			videoElement.height = height / 2;
			document.querySelector('#webcam').appendChild(videoElement);
			videoElement.play();
			videoShooter = new VideoShooter(videoElement);
			
			capture_button.innerHTML = 'capturing...';
			getScreenshot(function(pictureData) {
				save_button.disabled = false;
				upload_button.disabled = false;

				capture_button.innerHTML = capture_text;
				s.slide('two');
			}, 10, 0.2);
		});
	} else {
		alert('sorry, your browser does\'s support getMedia.');
	}

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