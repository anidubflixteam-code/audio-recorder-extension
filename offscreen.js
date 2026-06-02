let mediaRecorder;
let recordedChunks = [];
let audioContext;
let streamInstance;
let audioResumeInterval;

// Notify background that offscreen is ready
chrome.runtime.sendMessage({
  target: 'background',
  type: 'offscreen-ready'
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.target === 'offscreen') {
    if (message.type === 'start-recording') {
      startRecording(message.streamId, message.tabTitle, message.bitrate);
    } else if (message.type === 'stop-recording') {
      stopRecording();
    } else if (message.type === 'pause-recording') {
      pauseRecording();
    } else if (message.type === 'resume-recording') {
      resumeRecording();
    }
  }
});

async function startRecording(streamId, tabTitle, bitrate) {
  try {
    if (streamInstance) { streamInstance.getTracks().forEach(t => t.stop()); }
    if (audioContext) { await audioContext.close(); }
    clearInterval(audioResumeInterval);

    // 1. Get the stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    streamInstance = stream;

    // 2. Setup Audio Engine (CRITICAL FIX HERE)
    audioContext = new AudioContext();
    
    // Forcefully try to resume AudioContext if Chrome suspended it
    audioResumeInterval = setInterval(async () => {
        if (audioContext && audioContext.state === 'suspended') {
            console.log("Offscreen: Attempting to resume suspended AudioContext...");
            try {
                await audioContext.resume();
                if (audioContext.state === 'running') {
                     console.log("Offscreen: AudioContext resumed successfully.");
                     clearInterval(audioResumeInterval);
                }
            } catch (e) {
                console.error("Offscreen: Failed to resume AudioContext:", e);
            }
        } else if (audioContext && audioContext.state === 'running') {
             clearInterval(audioResumeInterval);
        }
    }, 1000); // Try every second

    const source = audioContext.createMediaStreamSource(stream);
    // Connect to destination so user can hear it while recording
    source.connect(audioContext.destination);

    // 3. Setup Recorder
    const options = {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: parseInt(bitrate) || 256000 
    };

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      clearInterval(audioResumeInterval);
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      
      chrome.runtime.sendMessage({ 
        target: 'background', 
        type: 'download-file', 
        url: url,
        tabTitle: tabTitle
      });

      // Cleanup
      if (streamInstance) streamInstance.getTracks().forEach(track => track.stop());
      if (audioContext) {
         try { await audioContext.close(); } catch(e) {}
      }
    };

    // Start recording in small chunks for safety
    mediaRecorder.start(1000); 
    console.log("Offscreen: MediaRecorder started successfully.");

  } catch (error) {
    console.error('Offscreen Start Error:', error);
    clearInterval(audioResumeInterval);
    if (streamInstance) streamInstance.getTracks().forEach(track => track.stop());
    chrome.runtime.sendMessage({ 
      target: 'background', 
      type: 'recording-error', 
      error: error.message || 'Failed to start recording engine.'
    });
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    console.log("Offscreen: Recording stopped successfully.");
  }
}

function pauseRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
  }
}

function resumeRecording() {
  if (mediaRecorder && mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
  }
}
