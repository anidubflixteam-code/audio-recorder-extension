let pendingRecording = null;

// Function to check if offscreen document is active (IMPROVED)
async function hasOffscreenDocument() {
  // Filter specifically for OFFSCREEN_DOCUMENT to be safe
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
          sendErrorMessage('Could not initialize recording engine.');
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
      // Make filename safe
      const safeTitle = (message.tabTitle || 'audio').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      // Add timestamp for uniqueness
      const date = new Date();
      const timestamp = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}_${String(date.getHours()).padStart(2,'0')}${String(date.getMinutes()).padStart(2,'0')}${String(date.getSeconds()).padStart(2,'0')}`;
      const filename = `AudioCapture_${safeTitle}_${timestamp}.webm`;

      chrome.downloads.download({
        url: message.url,
        filename: filename,
        saveAs: false // Set true if you always want the save dialog
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
            console.error("Download failed:", chrome.runtime.lastError);
        }
        // Clean up after download completes
        cleanup(true);
      });

    } else if (message.type === 'recording-error') {
      await cleanup(false);
      sendErrorMessage(message.error);
    }
  }
  // Return true is not needed here as we are not sending asynchronous responses directly back to the sender via sendResponse
});

function sendErrorMessage(errorText) {
  chrome.runtime.sendMessage({
    target: 'popup',
    type: 'recording-error',
    error: errorText
  }).catch(() => {
     // Ignore error if popup is closed
  });
}

async function cleanup(isNormalStop) {
  await chrome.storage.local.set({ isRecording: false, isPaused: false });

  // IMPORTANT: Give the download a moment to engage before killing the offscreen doc URL
  setTimeout(async () => {
      if (await hasOffscreenDocument()) {
        // We must close the document to stop the tab sharing blue bar
        try {
            await chrome.offscreen.closeDocument();
        } catch(e) { console.log("Offscreen already closed"); }
      }

      if (isNormalStop) {
        chrome.runtime.sendMessage({
          target: 'popup',
          type: 'recording-stopped-ack'
        }).catch(() => { /* popup closed */ });
      }
  }, 1000);
}
