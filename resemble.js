/*
 James Cryer / Huddle 2014
 URL: https://github.com/Huddle/Resemble.js
 */
'use strict';

//var pngparse = require('pngparse');
var PNG = require('pngjs').PNG;
var fs = require('fs'),
	request = require('request');

//keeping wrong indentation and '_this' for better diff with origin resemble.js
var _this = {};
'use strict';

var pixelTransparency = 1;

var errorPixelColor = { // Color for Error Pixels. Between 0 and 255.
	red: 255,
	green: 0,
	blue: 255,
	alpha: 255
};

function colorsDistance(c1, c2){
	return (Math.abs(c1.r - c2.r) + Math.abs(c1.g - c2.g) + Math.abs(c1.b - c2.b))/3;
}

var errorPixelTransform = {
	flat : function (d1, d2){
		return {
			r: errorPixelColor.red,
			g: errorPixelColor.green,
			b: errorPixelColor.blue,
			a: errorPixelColor.alpha
		}
	},
	movement: function (d1, d2){
		return {
			r: ((d2.r*(errorPixelColor.red/255)) + errorPixelColor.red)/2,
			g: ((d2.g*(errorPixelColor.green/255)) + errorPixelColor.green)/2,
			b: ((d2.b*(errorPixelColor.blue/255)) + errorPixelColor.blue)/2,
			a: d2.a
		}
	},
	flatDifferenceIntensity: function (d1, d2){
		return {
			r: errorPixelColor.red,
			g: errorPixelColor.green,
			b: errorPixelColor.blue,
			a: colorsDistance(d1, d2)
		}
	},
	movementDifferenceIntensity: function (d1, d2){
		var ratio = colorsDistance(d1, d2)/255 * 0.8;
		return {
			r: ((1-ratio)*(d2.r*(errorPixelColor.red/255)) + ratio*errorPixelColor.red),
			g: ((1-ratio)*(d2.g*(errorPixelColor.green/255)) + ratio*errorPixelColor.green),
			b: ((1-ratio)*(d2.b*(errorPixelColor.blue/255)) + ratio*errorPixelColor.blue),
			a: d2.a
		}
	}
};

var errorPixelTransformer = errorPixelTransform.flat;
var largeImageThreshold = 1200;
var httpRegex = /^https?:\/\//i;

_this['resemble'] = function( fileData ) {

	var data = {};
	var images = [];
	var updateCallbackArray = [];

	var tolerance = { // between 0 and 255
		red: 16,
		green: 16,
		blue: 16,
		alpha: 16,
		minBrightness: 16,
		maxBrightness: 240
	};

	var ignoreAntialiasing = false;
	var ignoreColors = false;
	var ignoreRectangles = null;

	function triggerDataUpdate() {
		var len = updateCallbackArray.length;
		var i;
		for (i = 0; i < len; i++) {
			if (typeof updateCallbackArray[i] === 'function') {
				updateCallbackArray[i](data);
			}
		}
	}

	function loop(x, y, callback) {
		var i, j;

		for (i = 0; i < x; i++) {
			for (j = 0; j < y; j++) {
				callback(i, j);
			}
		}
	}

	function parseImage(sourceImageData, width, height) {

		var pixleCount = 0;
		var redTotal = 0;
		var greenTotal = 0;
		var blueTotal = 0;
		var brightnessTotal = 0;

		loop(height, width, function (verticalPos, horizontalPos) {
			var offset = (verticalPos * width + horizontalPos) * 4;
			var red = sourceImageData[offset];
			var green = sourceImageData[offset + 1];
			var blue = sourceImageData[offset + 2];
			var brightness = getBrightness(red, green, blue);

			pixleCount++;

			redTotal += red / 255 * 100;
			greenTotal += green / 255 * 100;
			blueTotal += blue / 255 * 100;
			brightnessTotal += brightness / 255 * 100;
		});

		data.red = Math.floor(redTotal / pixleCount);
		data.green = Math.floor(greenTotal / pixleCount);
		data.blue = Math.floor(blueTotal / pixleCount);
		data.brightness = Math.floor(brightnessTotal / pixleCount);

		triggerDataUpdate();
	}

	function loadImageData(fileData, callback) {
		var png = new PNG({filterType: 4});
		if (Buffer.isBuffer(fileData)) {
			png.parse(fileData, function (err, data) {
				return callback(data, data.width, data.height);
			});
		} else {
			if (httpRegex.test(fileData)) {
				request.get(fileData)
					.pipe(png)
					.on('parsed', function () {
						return callback(this, this.width, this.height);
					})
					.on('error', function(err) {
						data.error = err;
						return callback();
					});
			} else {
				fs.createReadStream(fileData)
					.pipe(png)
					.on('parsed', function () {
						return callback(this, this.width, this.height);
					}).on('error', function() {
						data.error = err;
						return callback();
					});
			}

		};
	}

	function isColorSimilar(a, b, color) {

		var absDiff = Math.abs(a - b);

		if (typeof a === 'undefined') {
			return false;
		}
		if (typeof b === 'undefined') {
			return false;
		}

		if (a === b) {
			return true;
		} else if (absDiff < tolerance[color]) {
			return true;
		} else {
			return false;
		}
	}

	function isNumber(n) {
		return !isNaN(parseFloat(n));
	}

	function isPixelBrightnessSimilar(d1, d2) {
		var alpha = isColorSimilar(d1.a, d2.a, 'alpha');
		var brightness = isColorSimilar(d1.brightness, d2.brightness, 'minBrightness');
		return brightness && alpha;
	}

	function getBrightness(r, g, b) {
		return 0.3 * r + 0.59 * g + 0.11 * b;
	}

	function isRGBSame(d1, d2) {
		var red = d1.r === d2.r;
		var green = d1.g === d2.g;
		var blue = d1.b === d2.b;
		return red && green && blue;
	}

	function isRGBSimilar(d1, d2) {
		var red = isColorSimilar(d1.r, d2.r, 'red');
		var green = isColorSimilar(d1.g, d2.g, 'green');
		var blue = isColorSimilar(d1.b, d2.b, 'blue');
		var alpha = isColorSimilar(d1.a, d2.a, 'alpha');

		return red && green && blue && alpha;
	}

	function isContrasting(d1, d2) {
		return Math.abs(d1.brightness - d2.brightness) > tolerance.maxBrightness;
	}

	function getHue(r, g, b) {

		r = r / 255;
		g = g / 255;
		b = b / 255;
		var max = Math.max(r, g, b), min = Math.min(r, g, b);
		var h;
		var d;

		if (max == min) {
			h = 0; // achromatic
		} else {
			d = max - min;
			switch (max) {
				case r:
					h = (g - b) / d + (g < b ? 6 : 0);
					break;
				case g:
					h = (b - r) / d + 2;
					break;
				case b:
					h = (r - g) / d + 4;
					break;
			}
			h /= 6;
		}

		return h;
	}

	function isAntialiased(sourcePix, data, cacheSet, verticalPos, horizontalPos, width) {
		var offset;
		var targetPix;
		var distance = 1;
		var i;
		var j;
		var hasHighContrastSibling = 0;
		var hasSiblingWithDifferentHue = 0;
		var hasEquivilantSibling = 0;

		addHueInfo(sourcePix);

		for (i = distance * -1; i <= distance; i++) {
			for (j = distance * -1; j <= distance; j++) {

				if (i === 0 && j === 0) {
					// ignore source pixel
				} else {

					offset = ((verticalPos + j) * width + (horizontalPos + i)) * 4;
					targetPix = getPixelInfo(data, offset, cacheSet);

					if (targetPix === null) {
						continue;
					}

					addBrightnessInfo(targetPix);
					addHueInfo(targetPix);

					if (isContrasting(sourcePix, targetPix)) {
						hasHighContrastSibling++;
					}

					if (isRGBSame(sourcePix, targetPix)) {
						hasEquivilantSibling++;
					}

					if (Math.abs(targetPix.h - sourcePix.h) > 0.3) {
						hasSiblingWithDifferentHue++;
					}

					if (hasSiblingWithDifferentHue > 1 || hasHighContrastSibling > 1) {
						return true;
					}
				}
			}
		}

		if (hasEquivilantSibling < 2) {
			return true;
		}

		return false;
	}

	function errorPixel(px, offset, data1, data2) {
		var data = errorPixelTransformer(data1, data2);
		px[offset] = data.r;
		px[offset + 1] = data.g;
		px[offset + 2] = data.b;
		px[offset + 3] = data.a;
	}

	function copyPixel(px, offset, data) {
		px[offset] = data.r; //r
		px[offset + 1] = data.g; //g
		px[offset + 2] = data.b; //b
		px[offset + 3] = data.a * pixelTransparency; //a
	}

	function copyGrayScalePixel(px, offset, data) {
		px[offset] = data.brightness; //r
		px[offset + 1] = data.brightness; //g
		px[offset + 2] = data.brightness; //b
		px[offset + 3] = data.a * pixelTransparency; //a
	}

	function getPixelInfo(data, offset, cacheSet) {
		var r;
		var g;
		var b;
		var d;
		var a;

		r = data[offset];

		if (typeof r !== 'undefined') {
			g = data[offset + 1];
			b = data[offset + 2];
			a = data[offset + 3];
			d = {
				r: r,
				g: g,
				b: b,
				a: a
			};

			return d;
		} else {
			return null;
		}
	}

	function addBrightnessInfo(data) {
		data.brightness = getBrightness(data.r, data.g, data.b); // 'corrected' lightness
	}

	function addHueInfo(data) {
		data.h = getHue(data.r, data.g, data.b);
	}

	function analyseImages(img1, img2, width, height) {

		var data1 = img1.data;
		var data2 = img2.data;

		//TODO
		var imgd = new PNG({
			width: img1.width,
			height: img1.height,
			deflateChunkSize: img1.deflateChunkSize,
			deflateLevel: img1.deflateLevel,
			deflateStrategy: img1.deflateStrategy,
		});
		var targetPix = imgd.data;

		var mismatchCount = 0;

		var time = Date.now();

		var skip;

		var currentRectangle = null;
		var rectagnlesIdx = 0;

		if(!!largeImageThreshold && ignoreAntialiasing && (width > largeImageThreshold || height > largeImageThreshold)){
			skip = 6;
		}

		loop(height, width, function (verticalPos, horizontalPos) {

			if (skip) { // only skip if the image isn't small
				if (verticalPos % skip === 0 || horizontalPos % skip === 0) {
					return;
				}
			}

			var offset = (verticalPos * width + horizontalPos) * 4;
			var pixel1 = getPixelInfo(data1, offset, 1);
			var pixel2 = getPixelInfo(data2, offset, 2);

			if (pixel1 === null || pixel2 === null) {
				return;
			}

			if (ignoreRectangles) {
				for (rectagnlesIdx = 0; rectagnlesIdx < ignoreRectangles.length; rectagnlesIdx++) {
					currentRectangle = ignoreRectangles[rectagnlesIdx];
					//console.log(currentRectangle, verticalPos, horizontalPos);
					if (
						(verticalPos >= currentRectangle[1]) &&
						(verticalPos < currentRectangle[1] + currentRectangle[3]) &&
						(horizontalPos >= currentRectangle[0]) &&
						(horizontalPos < currentRectangle[0] + currentRectangle[2])
					) {
						copyGrayScalePixel(targetPix, offset, pixel2);
						//copyPixel(targetPix, offset, pixel1, pixel2);
						return;
					}
				}
			}

			if (ignoreColors) {

				addBrightnessInfo(pixel1);
				addBrightnessInfo(pixel2);

				if (isPixelBrightnessSimilar(pixel1, pixel2)) {
					copyGrayScalePixel(targetPix, offset, pixel2);
				} else {
					errorPixel(targetPix, offset, pixel1, pixel2);
					mismatchCount++;
				}
				return;
			}

			if (isRGBSimilar(pixel1, pixel2)) {
				copyPixel(targetPix, offset, pixel1, pixel2);

			} else if (ignoreAntialiasing && (
					addBrightnessInfo(pixel1), // jit pixel info augmentation looks a little weird, sorry.
						addBrightnessInfo(pixel2),
					isAntialiased(pixel1, data1, 1, verticalPos, horizontalPos, width) ||
					isAntialiased(pixel2, data2, 2, verticalPos, horizontalPos, width)
				)) {

				if (isPixelBrightnessSimilar(pixel1, pixel2)) {
					copyGrayScalePixel(targetPix, offset, pixel2);
				} else {
					errorPixel(targetPix, offset, pixel1, pixel2);
					mismatchCount++;
				}
			} else {
				errorPixel(targetPix, offset, pixel1, pixel2);
				mismatchCount++;
			}

		});

		data.misMatchPercentage = (mismatchCount / (height * width) * 100).toFixed(2);
		data.analysisTime = Date.now() - time;

		data.getDiffImage = function (text) {
			return imgd;
		};
	}

	function compare(one, two) {

		function onceWeHaveBoth(img) {
			var width;
			var height;

			images.push(img);
			if (images.length === 2) {
				if (images[0] && images[1]){
					width = images[0].width > images[1].width ? images[0].width : images[1].width;
					height = images[0].height > images[1].height ? images[0].height : images[1].height;
					
					if ((images[0].width === images[1].width) && (images[0].height === images[1].height)) {
						data.isSameDimensions = true;
					} else {
						data.isSameDimensions = false;
					}
					
					data.dimensionDifference = {
						width: images[0].width - images[1].width,
						height: images[0].height - images[1].height
					};
					//lksv: normalization removed
					analyseImages(images[0], images[1], width, height);
				}

				triggerDataUpdate();
			}
		}

		images = [];
		loadImageData(one, onceWeHaveBoth);
		loadImageData(two, onceWeHaveBoth);
	}

	function getCompareApi(param) {

		var secondFileData,
			hasMethod = typeof param === 'function';

		if (!hasMethod) {
			// assume it's file data
			secondFileData = param;
		}

		var self = {
			ignoreNothing: function () {

				tolerance.red = 16;
				tolerance.green = 16;
				tolerance.blue = 16;
				tolerance.alpha = 16;
				tolerance.minBrightness = 16;
				tolerance.maxBrightness = 240;

				ignoreAntialiasing = false;
				ignoreColors = false;

				if (hasMethod) {
					param();
				}
				return self;
			},
			ignoreAntialiasing: function () {

				tolerance.red = 32;
				tolerance.green = 32;
				tolerance.blue = 32;
				tolerance.alpha = 32;
				tolerance.minBrightness = 64;
				tolerance.maxBrightness = 96;

				ignoreAntialiasing = true;
				ignoreColors = false;

				if (hasMethod) {
					param();
				}
				return self;
			},
			ignoreColors: function () {

				tolerance.alpha = 16;
				tolerance.minBrightness = 16;
				tolerance.maxBrightness = 240;

				ignoreAntialiasing = false;
				ignoreColors = true;

				if (hasMethod) {
					param();
				}
				return self;
			},
			//array of rectangles, each rectangle is defined as (x, y, width. height)
			//e.g. [[325, 170, 100, 40]]
			ignoreRectangles: function (rectangles) {
				ignoreRectangles = rectangles;
				return self;
			},
			repaint: function () {
				if (hasMethod) {
					param();
				}
				return self;
			},
			onComplete: function (callback) {

				updateCallbackArray.push(callback);

				var wrapper = function () {
					compare(fileData, secondFileData);
				};

				wrapper();

				return getCompareApi(wrapper);
			}
		};

		return self;
	}

	return {
		onComplete: function (callback) {
			updateCallbackArray.push(callback);
			loadImageData(fileData, function (imageData, width, height) {
				parseImage(imageData.data, width, height);
			});
		},
		compareTo: function (secondFileData) {
			return getCompareApi(secondFileData);
		}
	};

};

_this['resemble'].outputSettings = function(options) {
	var key;
	var undefined;

	if (options.errorColor) {
		for (key in options.errorColor) {
			errorPixelColor[key] = options.errorColor[key] === undefined ? errorPixelColor[key] : options.errorColor[key];
		}
	}

	if (options.errorType && errorPixelTransform[options.errorType]) {
		errorPixelTransformer = errorPixelTransform[options.errorType];
	}

	pixelTransparency = options.transparency || pixelTransparency;

	if (options.largeImageThreshold !== undefined) {
		largeImageThreshold = options.largeImageThreshold;
	}

	return this;
};

module.exports = _this['resemble'];
