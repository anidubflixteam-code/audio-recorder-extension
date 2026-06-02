let timerInterval;
let elapsedTime = 0;
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

  // STEP 1: Fetch active tab
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab) {
      activeTab = tab;
    } else {
      tabIndicator.innerText = "Error: No active tab found. Refresh page.";
      recordBtn.disabled = true;
    }
  });

  // STEP 2: Restore state
  chrome.storage.local.get(['isRecording', 'isPaused', 'startTime', 'pausedTime', 'tabTitle', 'bitrate'], (result) => {
    isRecordingState = !!result.isRecording;
    isPausedState = !!result.isPaused;
    if (result.bitrate) bitrateSelect.value = result.bitrate;

    if (isRecordingState) {
      setRecordingUI(result.tabTitle || 'Active Tab');
      settingsPanel.style.display = 'none';
      if (isPausedState) {
        setPausedUI();
        elapsedTime = result.pausedTime || 0;
        updateTimerUI(elapsedTime);
      } else {
        elapsedTime = result.pausedTime || (Date.now() - (result.startTime || Date.now()));
        startTimer(Date.now() - elapsedTime);
      }
    } else {
      setIdleUI();
    }
  });

  // STEP 3: Handle Start/Stop click
  recordBtn.addEventListener('click', () => {
    if (!isRecordingState) {
      // Start Process
      if (!activeTab || !activeTab.id) {alert('Please refresh the page and try again.'); return;}
      if (activeTab.url.startsWith('chrome://') || activeTab.url.includes('chromewebstore')) {
        alert('Cannot capture internal browser pages.'); return;
      }

      const bitrateValue = bitrateSelect.value;
      
      // Get Stream ID
      chrome.tabCapture.getMediaStreamId({ targetTabId: activeTab.id }, (streamId) => {
        if (chrome.runtime.lastError || !streamId) {
          alert('Failed to get capture stream. Please refresh the page.');
          return;
        }

        const startTime = Date.now();
        elapsedTime = 0;
        isRecordingState = true;
        isPausedState = false;

        chrome.storage.local.set({ isRecording: true, isPaused: false, startTime: startTime, pausedTime: 0, tabTitle: activeTab.title, bitrate: bitrateValue });

        // Send to background
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
      // Stop Process
      recordBtn.disabled = true;
      btnText.innerText = "Saving...";
      chrome.runtime.sendMessage({ target: 'background', type: 'stop' });
    }
  });

  // STEP 4: Handle Pause/Resume click
  pauseBtn.addEventListener('click', () => {
    if (!isPausedState) {
      chrome.runtime.sendMessage({ target: 'background', type: 'pause' });
      pauseTimer(); setPausedUI(); isPausedState = true;
      chrome.storage.local.set({ isPaused: true, pausedTime: elapsedTime });
    } else {
      chrome.runtime.sendMessage({ target: 'background', type: 'resume' });
      resumeTimer(); setRecordingUI(activeTab ? activeTab.title : 'Active Tab'); isPausedState = false;
      chrome.storage.local.set({ isPaused: false, startTime: Date.now() - elapsedTime });
    }
  });

  // Handle messages from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.target === 'popup') {
      if (message.type === 'recording-stopped-ack') {
        resetToIdle();
      } else if (message.type === 'recording-error') {
        alert('Recording Error:\n' + message.error);
        resetToIdle();
      }
    }
  });

  function resetToIdle() {
    isRecordingState = false; isPausedState = false;
    setIdleUI(); stopTimer();
    settingsPanel.style.display = 'flex'; recordBtn.disabled = false;
    chrome.storage.local.set({ isRecording: false, isPaused: false });
  }

  // UI Helpers
  function setRecordingUI(title) {
    recordBtn.className = 'btn btn-stop'; btnText.innerText = 'Stop Capture';
    pauseBtn.style.display = 'flex'; pauseBtnText.innerText = 'Pause';
    tabIndicator.innerText = `Recording: ${title.substring(0, 35)}...`;
    visualizer.className = 'visualizer-container recording';
  }
  function setPausedUI() {
    pauseBtnText.innerText = 'Resume';
    visualizer.className = 'visualizer-container recording paused';
  }
  function setIdleUI() {
    recordBtn.className = 'btn btn-start'; btnText.innerText = 'Start Capture';
    pauseBtn.style.display = 'none';
    tabIndicator.innerText = activeTab ? `Ready to record: ${activeTab.title.substring(0, 30)}...` : 'Ready...';
    visualizer.className = 'visualizer-container';
  }

  // Timer Functions
  function startTimer(startTime) { clearInterval(timerInterval); timerInterval = setInterval(() => { elapsedTime = Date.now() - startTime; updateTimerUI(elapsedTime); }, 1000); }
  function pauseTimer() { clearInterval(timerInterval); }
  function resumeTimer() { const startTime = Date.now() - elapsedTime; startTimer(startTime); }
  function stopTimer() { clearInterval(timerInterval); elapsedTime = 0; timerElement.innerText = '00:00'; }
  function updateTimerUI(timeInMs) {
    const totalSec = Math.floor(timeInMs / 1000);
    const m = Math.floor(totalSec / 60) % 60; const s = totalSec % 60;
    timerElement.innerText = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
});
