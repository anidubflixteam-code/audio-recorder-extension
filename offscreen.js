// offscreen.js - FIXED VERSION
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
    
    // IMPORTANT: Ensure AudioContext is running
    audioContext = new AudioContext();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioContext.destination);

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

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      
      chrome.runtime.sendMessage({ 
        target: 'background', 
        type: 'download-file', 
        url: url,
        tabTitle: tabTitle
      });

      // Cleanup tracks and context
      if (streamInstance) streamInstance.getTracks().forEach(track => track.stop());
      if (audioContext) setTimeout(() => audioContext.close(), 500);
    };

    mediaRecorder.start(1000);

  } catch (error) {
    console.error('Offscreen error:', error);
    if (streamInstance) streamInstance.getTracks().forEach(track => track.stop());
    chrome.runtime.sendMessage({ 
      target: 'background', 
      type: 'recording-error', 
      error: error.message || 'Offscreen capture failed'
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
