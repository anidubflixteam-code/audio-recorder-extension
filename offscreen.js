let mediaRecorder;
let recordedChunks = [];
let audioContext;

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.target === 'offscreen') {
    if (message.type === 'start-recording') {
      startRecording(message.streamId, message.tabTitle);
    } else if (message.type === 'stop-recording') {
      stopRecording();
    }
  }
});

async function startRecording(streamId, tabTitle) {
  try {
    // Capture tab's audio stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    // Keep audio playing in speakers while capturing so the user can hear it
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioContext.destination);

    // High quality settings (256kbps Opus Codec Stereo)
    const options = {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 256000 
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
      
      // Name the file based on tab title
      const cleanTitle = (tabTitle || 'audio').replace(/[^a-zA-Z0-9]/g, '_');
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${cleanTitle}_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // Stop tracks
      stream.getTracks().forEach(track => track.stop());
      if (audioContext) {
        audioContext.close();
      }
      
      // Notify background script
      chrome.runtime.sendMessage({ 
        target: 'background', 
        type: 'recording-stopped' 
      });
    };

    mediaRecorder.start();

  } catch (error) {
    console.error('Error in offscreen capture:', error);
    chrome.runtime.sendMessage({ 
      target: 'popup', 
      type: 'recording-error', 
      error: error.message 
    });
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}
