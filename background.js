let pendingRecording = null;

// Function to check if offscreen document is active
async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({});
  return contexts.some(c => c.contextType === 'OFFSCREEN_DOCUMENT');
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.target === 'background') {
    if (message.type === 'start') {
      const { streamId, tabTitle } = message;
      // Temporary storage for credentials until offscreen is ready
      pendingRecording = { streamId, tabTitle };

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
          tabTitle: tabTitle
        });
        pendingRecording = null;
      }

    } else if (message.type === 'offscreen-ready') {
      // Triggered when offscreen.js finishes loading
      if (pendingRecording) {
        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'start-recording',
          streamId: pendingRecording.streamId,
          tabTitle: pendingRecording.tabTitle
        });
        pendingRecording = null;
      }

    } else if (message.type === 'stop') {
      if (await hasOffscreenDocument()) {
        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'stop-recording'
        });
      }

    } else if (message.type === 'recording-stopped') {
      await cleanup(true);

    } else if (message.type === 'recording-error') {
      await cleanup(false);
      // Forward error to popup if it is open
      chrome.runtime.sendMessage({
        target: 'popup',
        type: 'recording-error',
        error: message.error
      });
    }
  }
});

// Centralized cleanup to ensure states and documents are reset properly
async function cleanup(isNormalStop) {
  await chrome.storage.local.set({ isRecording: false });
  
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
