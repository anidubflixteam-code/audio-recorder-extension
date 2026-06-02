let timerInterval;
let elapsedTime = 0; // Cumulative elapsed time in ms
let timerStart = 0;
let isRecordingState = false;
let isPausedState = false;
let activeTab = null;

document.addEventListener('DOMContentLoaded', () => {
  const recordBtn = document.getElementById('record-btn');
  const btnText = document.getElementById('btn-text');
  const pauseBtn = document.getElementById('pause-btn');
  const pauseBtnText = document.getElementById('pause-btn-text');
  const tabIndicator = document.getElementById('tab-indicator');
  const timerElement = document.getElementById('timer');
  const visualizer = document.getElementById('visualizer');
  const bitrateSelect = document.getElementById('bitrate-select');
  const settingsPanel = document.getElementById('settings-panel');

  // STEP 1: Fetch active tab immediately on load synchronously 
  // so the user gesture token is retained on click
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    activeTab = tab;
  });

  // STEP 2: Restore state from local storage
  chrome.storage.local.get(['isRecording', 'isPaused', 'startTime', 'pausedTime', 'tabTitle', 'bitrate'], (result) => {
    isRecordingState = !!result.isRecording;
    isPausedState = !!result.isPaused;

    if (result.bitrate) {
      bitrateSelect.value = result.bitrate;
    }

    if (isRecordingState) {
      setRecordingUI(result.tabTitle);
      settingsPanel.style.display = 'none';

      if (isPausedState) {
        setPausedUI();
        elapsedTime = result.pausedTime || 0;
        updateTimerUI(elapsedTime);
      } else {
        elapsedTime = result.pausedTime || (Date.now() - result.startTime);
        startTimer(Date.now() - elapsedTime);
      }
    } else {
      setIdleUI();
    }
  });

  // STEP 3: Handle Start/Stop Record click (Guaranteed synchronous User Gesture)
  recordBtn.addEventListener('click', () => {
    if (!isRecordingState) {
      if (!activeTab) {
        alert('Please wait, tab details are loading.');
        return;
      }

      // Check for chrome:// pages, which cannot be captured
      if (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('chrome-extension://') || activeTab.url.includes('chromewebstore')) {
        alert('Security Alert: Chrome does not allow capturing internal browser pages or the Chrome Web Store. Please try on a regular website like YouTube or Wikipedia.');
        return;
      }

      const bitrateValue = bitrateSelect.value;

      // Request stream ID (Synchronous user gesture call)
      chrome.tabCapture.getMediaStreamId({ targetTabId: activeTab.id }, (streamId) => {
        if (!streamId) {
          alert('Could not start capture. Please refresh the page and try again.');
          return;
        }

        const startTime = Date.now();
        elapsedTime = 0;
        isRecordingState = true;
        isPausedState = false;

        // Save states
        chrome.storage.local.set({ 
          isRecording: true, 
          isPaused: false,
          startTime: startTime, 
          pausedTime: 0,
          tabTitle: activeTab.title,
          bitrate: bitrateValue
        });

        // Start background service
        chrome.runtime.sendMessage({
          target: 'background',
          type: 'start',
          streamId: streamId,
          tabTitle: activeTab.title,
          bitrate: bitrateValue
        });

        setRecordingUI(activeTab.title);
        settingsPanel.style.display = 'none';
        startTimer(startTime);
      });

    } else {
      // Stop Capture
      chrome.runtime.sendMessage({ target: 'background', type: 'stop' });
    }
  });

  // STEP 4: Handle Pause/Resume click
  pauseBtn.addEventListener('click', () => {
    if (!isPausedState) {
      // Pause
      chrome.runtime.sendMessage({ target: 'background', type: 'pause' });
      pauseTimer();
      setPausedUI();
      isPausedState = true;
      chrome.storage.local.set({ isPaused: true, pausedTime: elapsedTime });
    } else {
      // Resume
      chrome.runtime.sendMessage({ target: 'background', type: 'resume' });
      resumeTimer();
      setRecordingUI(activeTab ? activeTab.title : 'Active Tab');
      isPausedState = false;
      chrome.storage.local.set({ isPaused: false, startTime: Date.now() - elapsedTime });
    }
  });

  // Handle incoming background messages
  chrome.runtime.onMessage.addListener((message) => {
    if (message.target === 'popup') {
      if (message.type === 'recording-stopped-ack') {
        isRecordingState = false;
        isPausedState = false;
        setIdleUI();
        stopTimer();
        settingsPanel.style.display = 'flex';
      } else if (message.type === 'recording-error') {
        alert('Recording Error: ' + message.error);
        isRecordingState = false;
        isPausedState = false;
        setIdleUI();
        stopTimer();
        settingsPanel.style.display = 'flex';
      }
    }
  });

  // UI States helpers
  function setRecordingUI(title) {
    recordBtn.className = 'btn btn-stop';
    btnText.innerText = 'Stop Capture';
    pauseBtn.style.display = 'flex';
    pauseBtnText.innerText = 'Pause';
    tabIndicator.innerText = `Recording: ${title}`;
    visualizer.className = 'visualizer-container recording';
  }

  function setPausedUI() {
    pauseBtnText.innerText = 'Resume';
    visualizer.className = 'visualizer-container recording paused';
  }

  function setIdleUI() {
    recordBtn.className = 'btn btn-start';
    btnText.innerText = 'Start Capture';
    pauseBtn.style.display = 'none';
    tabIndicator.innerText = 'Ready to record tab audio';
    visualizer.className = 'visualizer-container';
  }

  // Timer Management
  function startTimer(startTime) {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      elapsedTime = Date.now() - startTime;
      updateTimerUI(elapsedTime);
    }, 1000);
  }

  function pauseTimer() {
    clearInterval(timerInterval);
  }

  function resumeTimer() {
    const startTime = Date.now() - elapsedTime;
    startTimer(startTime);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    elapsedTime = 0;
    timerElement.innerText = '00:00';
  }

  function updateTimerUI(timeInMs) {
    const seconds = Math.floor((timeInMs / 1000) % 60);
    const minutes = Math.floor((timeInMs / (1000 * 60)) % 60);
    const hours = Math.floor((timeInMs / (1000 * 60 * 60)));

    const formatted = 
      (hours > 0 ? String(hours).padStart(2, '0') + ':' : '') +
      String(minutes).padStart(2, '0') + ':' +
      String(seconds).padStart(2, '0');

    timerElement.innerText = formatted;
  }
});
