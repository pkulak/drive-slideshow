chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('screensaver.html', {
    id: "main-window",
    bounds: {
      width: 1200,
      height: 800
    }
  });
});