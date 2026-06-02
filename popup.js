// popup.js - DEBUG VERSION
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
      tabIndicator.innerText = "Error: No active tab found.";
      alert("DEBUG ERROR: Popup could not find the active tab.");
    }
  });

  // STEP 2: Restore state
  chrome.storage.local.get(['isRecording', 'isPaused', 'startTime', 'pausedTime', 'tabTitle', 'bitrate'], (result) => {
    isRecordingState = !!result.isRecording;
    isPausedState = !!result.isPaused;

    if (result.bitrate) bitrateSelect.value = result.bitrate;

    if (isRecordingState) {
      alert("DEBUG: Restoring previous recording state...");
      setRecordingUI(result.tabTitle || 'Unknown');
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
      // --- DEBUG START ---
      alert("DEBUG 1: 'Start Capture' clicked. Checking tab info...");

      if (!activeTab || !activeTab.id) {
        alert('DEBUG ERROR: Tab info not loaded correctly. Close popup and reopen.');
        return;
      }

      if (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('edge://') || activeTab.url.includes('chromewebstore')) {
        alert('Security Alert: Cannot capture internal browser pages.');
        return;
      }

      const bitrateValue = bitrateSelect.value;
      alert(`DEBUG 2: Requesting Stream ID for tab ${activeTab.id}...`);

      // Request stream ID
      chrome.tabCapture.getMediaStreamId({ targetTabId: activeTab.id }, (streamId) => {
        if (chrome.runtime.lastError || !streamId) {
          alert('DEBUG ERROR: getMediaStreamId failed: ' + (chrome.runtime.lastError?.message || "No ID returned"));
          return;
        }

        alert("DEBUG 3: Got Stream ID: " + streamId + ". Sending message to Background script...");

        const startTime = Date.now();
        elapsedTime = 0;
        isRecordingState = true;
        isPausedState = false;

        chrome.storage.local.set({ 
          isRecording: true, 
          isPaused: false,
          startTime: startTime, 
          pausedTime: 0,
          tabTitle: activeTab.title,
          bitrate: bitrateValue
        });

        // Start background service
        try {
            chrome.runtime.sendMessage({
              target: 'background',
              type: 'start',
              streamId: streamId,
              tabTitle: activeTab.title,
              bitrate: bitrateValue
            }, (response) => {
                 if (chrome.runtime.lastError) {
                     alert("DEBUG ERROR: Message to background failed: " + chrome.runtime.lastError.message);
                 } else {
                     alert("DEBUG 4: Message sent to background successfully. Recording should start now.");
                 }
            });
        } catch (e) {
             alert("DEBUG CRITICAL ERROR sending message: " + e.message);
             resetToIdle();
             return;
        }

        setRecordingUI(activeTab.title);
        settingsPanel.style.display = 'none';
        startTimer(startTime);
      });

    } else {
      // Stop Capture
      alert("DEBUG: 'Stop Capture' clicked. Sending stop message...");
      recordBtn.disabled = true;
      btnText.innerText = "Stopping...";
      chrome.runtime.sendMessage({ target: 'background', type: 'stop' });
    }
  });

  // STEP 4: Handle Pause/Resume click
  pauseBtn.addEventListener('click', () => {
    if (!isPausedState) {
      chrome.runtime.sendMessage({ target: 'background', type: 'pause' });
      pauseTimer();
      setPausedUI();
      isPausedState = true;
      chrome.storage.local.set({ isPaused: true, pausedTime: elapsedTime });
    } else {
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
      alert("DEBUG: Received message from background: " + message.type);
      if (message.type === 'recording-stopped-ack') {
        resetToIdle();
      } else if (message.type === 'recording-error') {
        alert('Recording Error:\n' + message.error);
        resetToIdle();
      }
    }
  });

  function resetToIdle() {
    isRecordingState = false;
    isPausedState = false;
    setIdleUI();
    stopTimer();
    settingsPanel.style.display = 'flex';
    recordBtn.disabled = false;
    chrome.storage.local.set({ isRecording: false, isPaused: false });
  }

  // UI States helpers
  function setRecordingUI(title) {
    recordBtn.className = 'btn btn-stop';
    btnText.innerText = 'Stop Capture';
    pauseBtn.style.display = 'flex';
    pauseBtnText.innerText = 'Pause';
    let displayTitle = title || "Active Tab";
    tabIndicator.innerText = `Recording: ${displayTitle.substring(0, 40)}${displayTitle.length > 40 ? '...' : ''}`;
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
    tabIndicator.innerText = activeTab ? `Ready to record: ${activeTab.title.substring(0, 30)}...` : 'Ready to record tab audio';
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
    const totalSeconds = Math.floor(timeInMs / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);

    const formatted = 
      (hours > 0 ? String(hours).padStart(2, '0') + ':' : '') +
      String(minutes).padStart(2, '0') + ':' +
      String(seconds).padStart(2, '0');

    timerElement.innerText = formatted;
  }
});
