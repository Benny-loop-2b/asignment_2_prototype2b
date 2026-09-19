const startBtn = document.querySelector("#start");
const stopBtn = document.querySelector("#stop");
const statusText = document.querySelector("#status");
const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d");

let audioContext;
let analyser;
let stream;
let frame;
let requestId = 0;
let running = false;

stopBtn.disabled = true;
statusText.textContent = "Ready. Press Start Sound Visual.";

// Draw the initial background.
function clearCanvas() {
  ctx.fillStyle = "#0f1117";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

clearCanvas();

// Release microphone and audio resources.
function cleanup() {
  cancelAnimationFrame(frame);

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  if (audioContext && audioContext.state !== "closed") {
    audioContext.close().catch(console.error);
  }

  audioContext = null;
  analyser = null;
  running = false;
  clearCanvas();
}

function stopVisual(message) {
  requestId++;
  cleanup();

  startBtn.disabled = false;
  stopBtn.disabled = true;
  statusText.textContent = message;
}

startBtn.onclick = async function () {
  if (startBtn.disabled) return;

  const currentRequest = ++requestId;

  startBtn.disabled = true;
  stopBtn.disabled = false;
  statusText.textContent = "Opening microphone. Please allow access.";

  try {
    if (!window.isSecureContext) {
      throw new Error("Please open the published HTTPS webpage.");
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone access is unavailable in this browser.");
    }

    const AudioEngine = window.AudioContext || window.webkitAudioContext;

    if (!AudioEngine) {
      throw new Error("Web Audio is unavailable in this browser.");
    }

    audioContext = new AudioEngine();
    await audioContext.resume();

    if (currentRequest !== requestId) return;

    const incoming = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    // Stop can cancel a request while permission is pending.
    if (currentRequest !== requestId) {
      incoming.getTracks().forEach(track => track.stop());
      return;
    }

    stream = incoming;

    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();

    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    source.connect(analyser);

    // Keep the output silent to prevent microphone feedback.
    const mute = audioContext.createGain();
    mute.gain.value = 0;
    analyser.connect(mute);
    mute.connect(audioContext.destination);

    const data = new Uint8Array(analyser.frequencyBinCount);
    running = true;

    statusText.textContent = "Listening. Speak, clap or tap to move the bars.";

    stream.getAudioTracks().forEach(function (track) {
      track.addEventListener("ended", function () {
        if (currentRequest === requestId) {
          stopVisual("Microphone disconnected. Press Start to try again.");
        }
      });
    });

    function draw() {
      if (!running || currentRequest !== requestId) return;

      analyser.getByteFrequencyData(data);
      clearCanvas();

      const count = 32;
      const gap = 7;
      const padding = 16;
      const width =
        (canvas.width - padding * 2 - gap * (count - 1)) / count;

      for (let i = 0; i < count; i++) {
        // Combine nearby frequencies into one visual bar.
        const first = Math.floor(i * data.length / count);
        const last = Math.floor((i + 1) * data.length / count);

        let total = 0;

        for (let j = first; j < last; j++) {
          total += data[j];
        }

        const level = total / (last - first) / 255;
        const height = Math.max(4, level * (canvas.height - 32));
        const x = padding + i * (width + gap);
        const y = canvas.height - padding - height;

        ctx.fillStyle = "#c8ff61";
        ctx.fillRect(x, y, width, height);
      }

      frame = requestAnimationFrame(draw);
    }

    draw();
  } catch (error) {
    if (currentRequest !== requestId) return;

    const messages = {
      NotAllowedError: "Microphone blocked. Allow access in your browser and try again.",
      NotFoundError: "No microphone found. Connect one and try again.",
      NotReadableError: "Cannot open the microphone. Check your device settings."
    };

    stopVisual(messages[error.name] || "Error: " + error.message);
    console.error(error);
  }
};

stopBtn.onclick = function () {
  stopVisual("Microphone stopped. Press Start to try again.");
};

// Stop listening when this tab is hidden.
document.addEventListener("visibilitychange", function () {
  if (document.hidden && startBtn.disabled) {
    stopVisual("Microphone stopped because the tab was hidden.");
  }
});

window.addEventListener("pagehide", function () {
  stopVisual("Microphone stopped.");
});