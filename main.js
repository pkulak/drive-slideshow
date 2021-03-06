var images = [];
var loaded = false;
var docWidth;
var docHeight;
var screenRatio;
var accessToken;
var errorSleep = 2500;

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

  window.setInterval(function() {
    chrome.identity.removeCachedAuthToken({token: accessToken}, function() {
      chrome.identity.getAuthToken({interactive: false}, function(token) {
        if (token) {
          console.log("Refreshed the token: " + token);
          accessToken = token;
        } else {
          console.log("Could not refresh token!");
        }
      });
    });
  }, 600000)
});

function handleResize() {
  docWidth = $(document).width();
  docHeight = $(document).height();
  screenRatio = docWidth / docHeight;
}

function displayImages(newState) {
  if (!newState) {
    chrome.idle.queryState(60, function(newState) {
      displayImages(newState)
    })
    return;
  } else {
    if (newState == "locked") {
      console.log("Screen locked. Waiting five seconds.")
      setTimeout(displayImages, 5000);
      return;
    }
  }

  if (images.length == 0) {
    setTimeout(displayImages, 1000);
    return;
  }

  currentIndex = Math.floor(Math.random() * images.length);
  console.log("Downloading " + currentIndex);
  var id = images[currentIndex];
  var done = false;
  var title = null;

  var onDone = function() {
    if (done) {
      $('#title').text(title);
    }
    done = true;
  }

  getFile(id, function(file) {
    downloadFile(file, function(blob) {
      if (!blob) {
        console.log("File download error.")
        setTimeout(displayImages, 5000);
        return
      }

      var img = $("#image");
      var width;
      var height;

      document.getElementById("image").onload = function() {
        onDone();
        document.getElementById("image").onload = null;
        window.URL.revokeObjectURL(this.src);
        delete blob

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
  });
}

function retrieveImages() {
  retrieveAllFiles(function(list) {
    $(list).each(function() {
      if (this.imageMediaMetadata) {
        var area = this.imageMediaMetadata.width * this.imageMediaMetadata.height;

        if (area > 122500) {
          images.push(this.id);
          console.log(images.length);
        }
      }
    })
  });
}

function getFile(id, callback) {
  gapiRequest({
    path: "/drive/v2/files/" + id,
    params: {cache: Math.random()*1000000},
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
        params: {pageToken: nextPageToken, "maxResults": 1000, "q": "trashed=false and (mimeType = 'image/jpeg' or mimeType = 'image/png')"},
        callback: retrievePageOfFiles
      });
    } else {
      loaded = true;
    }
  };

  gapiRequest({
    path: "/drive/v2/files",
    params: {"maxResults": 100, "q": "trashed=false and (mimeType = 'image/jpeg' or mimeType = 'image/png')"},
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
      if (this.status != 200) {
        console.log("Response not 200 (" + this.status + "): sleeping for " + errorSleep)
        setTimeout(callback, errorSleep);
        errorSleep *= 2;
        return;
      }

      errorSleep = 1000;
      callback(new Blob([this.response], {type: file.mimeType}));
      delete this.response
    };

    xhr.onerror = function() {
      callback(null);
    };

    xhr.send();
  } else {
    console.log("No file.downloadUrl!!!");
    callback(null);
  }
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