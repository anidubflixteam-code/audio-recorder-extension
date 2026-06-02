let mediaRecorder;
let recordedChunks = [];
let audioContext;
let streamInstance;

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
    // 1. Get the Tab Media Stream
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

    // 2. Set up Audio Context so the user can still hear the audio while recording
    audioContext = new AudioContext();
    
    // IMPORTANT FIX: Ensure context is running (sometimes it starts suspended)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioContext.destination);

    // 3. Configure Media Recorder
    const options = {
      // Try supported mime types in order of preference
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm',
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
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      
      // Important: keep the blob URL valid until downloaded
      const url = URL.createObjectURL(blob);
      
      // Send blob URL to background to download via chrome.downloads
      chrome.runtime.sendMessage({ 
        target: 'background', 
        type: 'download-file', 
        url: url,
        tabTitle: tabTitle
      });

      // Cleanup tracks and context
      if (streamInstance) {
          streamInstance.getTracks().forEach(track => track.stop());
      }
      if (audioContext) {
        // Small delay to ensure final audio bits are processed
        setTimeout(() => audioContext.close(), 500);
      }
    };

    // START RECORDING
    mediaRecorder.start(1000); // Slice every second for safer data handling

  } catch (error) {
    console.error('Offscreen error:', error);
    // Stop tracks if they were started before the error
    if (streamInstance) {
        streamInstance.getTracks().forEach(track => track.stop());
    }
    chrome.runtime.sendMessage({ 
      target: 'background', 
      type: 'recording-error', 
      error: error.message || 'Failed to start recording in offscreen document.'
    });
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
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
