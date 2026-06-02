let timerInterval;

document.addEventListener('DOMContentLoaded', async () => {
  const recordBtn = document.getElementById('record-btn');
  const btnText = document.getElementById('btn-text');
  const tabIndicator = document.getElementById('tab-indicator');
  const timerElement = document.getElementById('timer');
  const visualizer = document.getElementById('visualizer');

  // Restore state from local storage (helps keep state if popup is closed and reopened)
  chrome.storage.local.get(['isRecording', 'startTime', 'tabTitle'], (result) => {
    if (result.isRecording) {
      setRecordingUI(result.tabTitle);
      startTimer(result.startTime);
    } else {
      setIdleUI();
    }
  });

  // Record button click handler
  recordBtn.addEventListener('click', async () => {
    chrome.storage.local.get('isRecording', async (result) => {
      if (!result.isRecording) {
        // Get current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        // Request stream ID for tab capture (requires user gesture)
        chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, async (streamId) => {
          if (!streamId) {
            alert('Audio capture ID could not be generated. Please refresh the page and try again.');
            return;
          }

          const startTime = Date.now();
          // Save state to local storage
          await chrome.storage.local.set({ 
            isRecording: true, 
            startTime: startTime, 
            tabTitle: tab.title 
          });

          // Send signal to background script
          chrome.runtime.sendMessage({
            target: 'background',
            type: 'start',
            streamId: streamId,
            tabTitle: tab.title
          });

          setRecordingUI(tab.title);
          startTimer(startTime);
        });
      } else {
        // Stop recording
        chrome.runtime.sendMessage({ target: 'background', type: 'stop' });
      }
    });
  });

  // Handle incoming messages
  chrome.runtime.onMessage.addListener((message) => {
    if (message.target === 'popup') {
      if (message.type === 'recording-stopped-ack') {
        setIdleUI();
        stopTimer();
      } else if (message.type === 'recording-error') {
        alert('An error occurred: ' + message.error);
        setIdleUI();
        stopTimer();
      }
    }
  });

  function setRecordingUI(title) {
    recordBtn.className = 'btn btn-stop';
    btnText.innerText = 'Stop Capture';
    tabIndicator.innerText = `Recording: ${title}`;
    visualizer.classList.add('recording');
  }

  function setIdleUI() {
    recordBtn.className = 'btn btn-start';
    btnText.innerText = 'Start Capture';
    tabIndicator.innerText = 'Ready to record tab audio';
    visualizer.classList.remove('recording');
  }

  function startTimer(startTime) {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const seconds = Math.floor((elapsed / 1000) % 60);
      const minutes = Math.floor((elapsed / (1000 * 60)) % 60);
      const hours = Math.floor((elapsed / (1000 * 60 * 60)));

      const formatted = 
        (hours > 0 ? String(hours).padStart(2, '0') + ':' : '') +
        String(minutes).padStart(2, '0') + ':' +
        String(seconds).padStart(2, '0');

      timerElement.innerText = formatted;
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerElement.innerText = '00:00';
  }
});
