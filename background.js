// Function to check if offscreen document is active
async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({});
  return contexts.some(c => c.contextType === 'OFFSCREEN_DOCUMENT');
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.target === 'background') {
    if (message.type === 'start') {
      const { streamId, tabTitle } = message;

      // Create offscreen document if it doesn't exist
      if (!await hasOffscreenDocument()) {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['USER_MEDIA'],
          justification: 'Record high quality audio from tab'
        });
      }

      // Send signal to start recording after a short delay to ensure offscreen doc is loaded
      setTimeout(() => {
        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'start-recording',
          streamId: streamId,
          tabTitle: tabTitle
        });
      }, 500);

    } else if (message.type === 'stop') {
      if (await hasOffscreenDocument()) {
        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'stop-recording'
        });
      }
    } else if (message.type === 'recording-stopped') {
      // Update state in local storage
      await chrome.storage.local.set({ isRecording: false });
      
      // Close offscreen document
      if (await hasOffscreenDocument()) {
        await chrome.offscreen.closeDocument();
      }

      // Notify popup if it is open
      chrome.runtime.sendMessage({
        target: 'popup',
        type: 'recording-stopped-ack'
      });
    }
  }
});
