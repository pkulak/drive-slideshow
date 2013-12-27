var images = [];
var loaded = false;
var docWidth;
var docHeight;
var screenRatio;
var started = new Date().getTime();
var accessToken;

$(function() {
  handleResize();
  $(window).resize(handleResize);

  chrome.identity.getAuthToken({interactive: true}, function(token) {
    if (token) {
      accessToken = token;
      retrieveImages();
      displayImages();
    }
  });
});

function handleResize() {
  docWidth = $(document).width();
  docHeight = $(document).height();
  screenRatio = docWidth / docHeight;
}

function displayImages() {
  if (new Date().getTime() - started > 1200000) {
    pause();
    return;
  }

  if (images.length == 0) {
    setTimeout(displayImages, 1000);
    return;
  }

  currentIndex = Math.floor(Math.random() * images.length);
  console.log("Downloading " + currentIndex);
  var file = images[currentIndex];
  var done = false;
  var title = null;

  var onDone = function() {
    if (done) {
      $('#title').text(title);
    }
    done = true;
  }

  downloadFile(file, function(blob) {
    var img = $("#image");
    var width;
    var height;

    document.getElementById("image").onload = function() {
      onDone();
      document.getElementById("image").onload = null;
      
      var imgRatio = img.width() / img.height();

      if (screenRatio < imgRatio) {
        var width = docWidth;
        var height = (docWidth / img.width()) * img.height();
        img.css("margin-top", ((docHeight - height) / 2) + "px");
        img.css("margin-left", 0);
      } else {
        var width = (docHeight / img.height()) * img.width();
        var height = docHeight;
        img.css("margin-top", 0);
        img.css("margin-left", ((docWidth - width) / 2) + "px");
      }

      img.attr("width", width);
      img.attr("height", height);

      img.fadeIn(500);
    };

    img.fadeOut(500, function() {
      img.removeAttr("width");
      img.removeAttr("height");
      document.getElementById("image").src = window.URL.createObjectURL(blob);
    });
    
    setTimeout(displayImages, 5000);
  });

  getFile(file.parents[0].id, function(file) {
    title = file.title;
    onDone();
  });
}

function retrieveImages() {
  retrieveAllFiles(function(list) {
    $(list).each(function() {
      if (this.imageMediaMetadata && !this.labels.trashed && this.mimeType.match(/image\/(png)|(jpg)|(jpeg)/)) {
        var area = this.imageMediaMetadata.width * this.imageMediaMetadata.height;

        if (area > 122500) {
          images.push(this);
          console.log(images.length);
        }
      }
    })
  });
}

function getFile(id, callback) {
  gapiRequest({
    path: "/drive/v2/files/" + id,
    callback: callback
  });
}

function retrieveAllFiles(callback) {
  var retrievePageOfFiles = function(resp) {
    callback(resp.items);
    var nextPageToken = resp.nextPageToken;

    if (nextPageToken) {
      gapiRequest({
        path: "/drive/v2/files",
        params: {pageToken: nextPageToken},
        callback: retrievePageOfFiles
      });
    } else {
      loaded = true;
    }
  };

  gapiRequest({
    path: "/drive/v2/files",
    callback: retrievePageOfFiles
  });
}

function downloadFile(file, callback) {
  if (file.downloadUrl) {
    var xhr = new XMLHttpRequest();

    xhr.responseType = 'arraybuffer';
    xhr.open('GET', file.downloadUrl);
    xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);

    xhr.onload = function() {
      callback(new Blob([this.response], {type: file.mimeType}));
    };

    xhr.onerror = function() {
      callback(null);
    };

    xhr.send();
  } else {
    callback(null);
  }
}

function pause() {
  $("#image").hide();
  $("#title").text("Paused to save bandwidth. Click here to resume.");
  $("#title").css("cursor", "pointer");

  $("#title").click(function(e) {
    e.preventDefault();
    started = new Date().getTime();
    $("#title").unbind("click");
    $("#title").css("cursor", "auto");
    $("#title").text("Loading next image...");
    $("#image").show();
    displayImages();
  });
}

function gapiRequest(args) {
  if (typeof args !== 'object')
    throw new Error('args required');
  if (typeof args.callback !== 'function')
    throw new Error('callback required');
  if (typeof args.path !== 'string')
    throw new Error('path required');

  var path = 'https://www.googleapis.com' + args.path;
  if (typeof args.params === 'object') {
    var deliminator = '?';
    for (var i in args.params) {
      path += deliminator + encodeURIComponent(i) + "="
        + encodeURIComponent(args.params[i]);
      deliminator = '&';
    }
  }

  var xhr = new XMLHttpRequest();
  xhr.open(args.method || 'GET', path);
  xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);
  if (typeof args.body !== 'undefined') {
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.send(JSON.stringify(args.body));
  } else {
    xhr.send();
  }

  xhr.onload = function() {
    var rawResponseObject = {
      // TODO: body, headers.
      gapiRequest: {
        data: {
          status: this.status,
          statusText: this.statusText
        }
      }
    };

    var jsonResp = JSON.parse(this.response);
    var rawResp = JSON.stringify(rawResponseObject);
    args.callback(jsonResp, rawResp);
  };
};