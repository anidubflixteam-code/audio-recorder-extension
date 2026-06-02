// background.js - FIXED VERSION
let pendingRecording = null;

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  return contexts.length > 0;
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.target === 'background') {
    if (message.type === 'start') {
      const { streamId, tabTitle, bitrate } = message;
      pendingRecording = { streamId, tabTitle, bitrate };

      const exists = await hasOffscreenDocument();
      if (!exists) {
        try {
          await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Record high quality audio from tab'
          });
        } catch (err) {
          console.error('Offscreen creation failed:', err);
          sendErrorToPopup('Failed to create offscreen document: ' + err.message);
          pendingRecording = null;
        }
      } else {
        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'start-recording',
          streamId: streamId,
          tabTitle: tabTitle,
          bitrate: bitrate
        });
        pendingRecording = null;
      }

    } else if (message.type === 'offscreen-ready') {
      if (pendingRecording) {
        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'start-recording',
          streamId: pendingRecording.streamId,
          tabTitle: pendingRecording.tabTitle,
          bitrate: pendingRecording.bitrate
        });
        pendingRecording = null;
      }

    } else if (message.type === 'stop') {
      if (await hasOffscreenDocument()) {
        chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop-recording' });
      }

    } else if (message.type === 'pause') {
      if (await hasOffscreenDocument()) {
        chrome.runtime.sendMessage({ target: 'offscreen', type: 'pause-recording' });
      }

    } else if (message.type === 'resume') {
      if (await hasOffscreenDocument()) {
        chrome.runtime.sendMessage({ target: 'offscreen', type: 'resume-recording' });
      }

    } else if (message.type === 'download-file') {
      const cleanTitle = (message.tabTitle || 'audio').replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Audio_${cleanTitle}_${Date.now()}.webm`;

      chrome.downloads.download({
        url: message.url,
        filename: filename,
        saveAs: false
      }, () => {
        cleanup(true);
      });

    } else if (message.type === 'recording-error') {
      await cleanup(false);
      sendErrorToPopup(message.error);
    }
  }
});

function sendErrorToPopup(msg) {
    chrome.runtime.sendMessage({
        target: 'popup',
        type: 'recording-error',
        error: msg
    }).catch(() => {});
}

async function cleanup(isNormalStop) {
  await chrome.storage.local.set({ isRecording: false, isPaused: false });
  
  // Give download a chance to start before killing offscreen
  setTimeout(async () => {
      if (await hasOffscreenDocument()) {
        try { await chrome.offscreen.closeDocument(); } catch(e) {}
      }

      if (isNormalStop) {
        chrome.runtime.sendMessage({
          target: 'popup',
          type: 'recording-stopped-ack'
        }).catch(() => {});
      }
  }, 1000);
}
