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
          // Once created, wait for 'offscreen-ready' message
        } catch (err) {
          console.error('Failed to create offscreen doc:', err);
          sendErrorToPopup('Could not initialize recording engine.');
          pendingRecording = null;
        }
      } else {
        // If already exists, start recording immediately
        startOffscreenRecording(streamId, tabTitle, bitrate);
      }

    } else if (message.type === 'offscreen-ready') {
      if (pendingRecording) {
        startOffscreenRecording(pendingRecording.streamId, pendingRecording.tabTitle, pendingRecording.bitrate);
      }

    } else if (message.type === 'stop') {
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop-recording' }).catch(() => {});

    } else if (message.type === 'pause') {
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'pause-recording' }).catch(() => {});

    } else if (message.type === 'resume') {
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'resume-recording' }).catch(() => {});

    } else if (message.type === 'download-file') {
      const cleanTitle = (message.tabTitle || 'audio').replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50);
      const formattedDate = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // YYYY-MM-DDTHH-mm-ss
      const filename = `AudioCapture_${cleanTitle}_${formattedDate}.webm`;

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

function startOffscreenRecording(streamId, tabTitle, bitrate) {
    chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'start-recording',
        streamId: streamId,
        tabTitle: tabTitle,
        bitrate: bitrate
      });
      pendingRecording = null;
}

function sendErrorToPopup(msg) {
  chrome.runtime.sendMessage({
    target: 'popup',
    type: 'recording-error',
    error: msg
  }).catch(() => { /* popup closed, ignore */ });
}

async function cleanup(isNormalStop) {
  await chrome.storage.local.set({ isRecording: false, isPaused: false });
  
  // Important: Give download a moment to register before killing the offscreen doc
  setTimeout(async () => {
      if (await hasOffscreenDocument()) {
        try { await chrome.offscreen.closeDocument(); } catch(e) { console.log("Offscreen already closed"); }
      }

      if (isNormalStop) {
        chrome.runtime.sendMessage({
          target: 'popup',
          type: 'recording-stopped-ack'
        }).catch(() => { /* popup closed */ });
      }
  }, 1500);
}
