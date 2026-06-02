// background.js - FIXED VERSION
let pendingRecording = null;

// Function to check if offscreen document is active
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

      // Create offscreen document if it doesn't exist
      const exists = await hasOffscreenDocument();
      if (!exists) {
        try {
          await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Record high quality audio from tab'
          });
        } catch (err) {
          console.error('Failed to create offscreen doc:', err);
          sendErrorToPopup('Could not initialize recording engine (Offscreen failed).');
          pendingRecording = null;
        }
      } else {
        // If already exists, start recording immediately
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
      // Use official Chrome Downloads API
      const cleanTitle = (message.tabTitle || 'audio').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `Audio_${cleanTitle}_${Date.now()}.webm`;

      chrome.downloads.download({
        url: message.url,
        filename: filename,
        saveAs: false
      }, () => {
        // Clean up after download completes
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
  }).catch(() => { /* popup closed */ });
}

async function cleanup(isNormalStop) {
  await chrome.storage.local.set({ isRecording: false, isPaused: false });
  
  // Delay closing to allow download handoff
  setTimeout(async () => {
      if (await hasOffscreenDocument()) {
        try { await chrome.offscreen.closeDocument(); } catch(e) {}
      }

      if (isNormalStop) {
        chrome.runtime.sendMessage({
          target: 'popup',
          type: 'recording-stopped-ack'
        }).catch(() => { /* popup closed */ });
      }
  }, 1000);
}
