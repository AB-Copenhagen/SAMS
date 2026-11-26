/*!
 * AB Media DAM embed widget (gh-123). Include once on a page with one or more
 * <iframe data-sams-embed src="https://media.ab.dk/embed/TOKEN"></iframe> elements:
 *
 *   <script src="https://media.ab.dk/embed/player.js" async></script>
 *
 * Auto-wires the resize handshake (no listener to hand-roll) and exposes a minimal API:
 *
 *   SamsEmbed.play([iframe])
 *   SamsEmbed.pause([iframe])
 *   SamsEmbed.onResize(function (iframe, height) { ... })
 *
 * iframe arguments are optional — omit to target the first data-sams-embed iframe on the page.
 * Static asset served from the public/ folder, not a route handler — there's no per-request logic.
 */
(function () {
  'use strict';

  function embedIframes() {
    return Array.prototype.slice.call(document.querySelectorAll('iframe[data-sams-embed]'));
  }

  var resizeListeners = [];

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object' || data.type !== 'sams-embed-resize') return;
    if (typeof data.height !== 'number') return;

    var iframes = embedIframes();
    for (var i = 0; i < iframes.length; i++) {
      if (iframes[i].contentWindow === event.source) {
        iframes[i].style.height = data.height + 'px';
        for (var j = 0; j < resizeListeners.length; j++) {
          resizeListeners[j](iframes[i], data.height);
        }
        break;
      }
    }
  });

  function sendCommand(iframe, command) {
    var target = iframe || embedIframes()[0];
    if (target && target.contentWindow) {
      target.contentWindow.postMessage({ type: 'sams-embed-command', command: command }, '*');
    }
  }

  window.SamsEmbed = {
    play: function (iframe) { sendCommand(iframe, 'play'); },
    pause: function (iframe) { sendCommand(iframe, 'pause'); },
    onResize: function (callback) { resizeListeners.push(callback); },
  };
})();
