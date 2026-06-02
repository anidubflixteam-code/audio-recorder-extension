let pendingRecording = null;

// Function to check if offscreen document is active
async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({});
  return contexts.some(c => c.contextType === 'OFFSCREEN_DOCUMENT');
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.target === 'background') {
    if (message.type === 'start') {
      const { streamId, tabTitle, bitrate } = message;
      pendingRecording = { streamId, tabTitle, bitrate };

      // Create offscreen document if it doesn't exist
      if (!await hasOffscreenDocument()) {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['USER_MEDIA'],
          justification: 'Record high quality audio from tab'
        });
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
      const cleanTitle = (message.tabTitle || 'audio').replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${cleanTitle}_${Date.now()}.webm`;

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
      chrome.runtime.sendMessage({
        target: 'popup',
        type: 'recording-error',
        error: message.error
      });
    }
  }
});

async function cleanup(isNormalStop) {
  await chrome.storage.local.set({ isRecording: false, isPaused: false });
  
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument();
  }

  if (isNormalStop) {
    chrome.runtime.sendMessage({
      target: 'popup',
      type: 'recording-stopped-ack'
    });
  }
          }
