* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #0f1117;
  color: #f4f5f7;
  font-family: Arial, sans-serif;
  line-height: 1.6;
}

header,
footer {
  padding: 25px 6%;
  background: #191d27;
}

header {
  border-bottom: 3px solid #c8ff61;
}

h1,
h2 {
  margin-top: 0;
  color: #c8ff61;
}

a {
  color: inherit;
}

main {
  width: 90%;
  max-width: 900px;
  margin: 30px auto;
}

.panel {
  padding: 25px;
  background: #191d27;
  border-radius: 10px;
}

.guide {
  padding: 18px;
  background: #222735;
  border-left: 4px solid #c8ff61;
  overflow-wrap: anywhere;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 20px 0;
}

button {
  padding: 10px 16px;
  background: #c8ff61;
  color: #111;
  border: 1px solid #c8ff61;
  border-radius: 6px;
  font: inherit;
  cursor: pointer;
}

#stopRec {
  background: transparent;
  color: #c8ff61;
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

button:focus-visible {
  outline: 3px solid white;
  outline-offset: 3px;
}

audio {
  width: 100%;
  margin-top: 10px;
}

footer {
  text-align: center;
  color: #aeb4c0;
}

@media (max-width: 600px) {
  .controls {
    flex-direction: column;
  }

  button {
    width: 100%;
  }
}

script.js

// The HTML uses defer, so these elements already exist.
const guide = document.querySelector("#guide");
const recordBtn = document.querySelector("#record");
const stopBtn = document.querySelector("#stopRec");
const playBtn = document.querySelector("#play");
const audio = document.querySelector("#audio");

let recorder;
let stream;
let audioURL;
let recordingTimer;
let busy = false;
let requestId = 0;

guide.textContent = "Step 1 — Ready. Press Record.";
recordBtn.disabled = false;

// Release the microphone after recording.
function releaseMicrophone() {
  clearTimeout(recordingTimer);

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
}

function resetButtons() {
  busy = false;
  recordBtn.disabled = false;
  stopBtn.disabled = true;
  playBtn.disabled = !audioURL;
  audio.hidden = !audioURL;
}

function showError(error) {
  const messages = {
    NotAllowedError: "Microphone blocked. Allow access in your browser and try again.",
    NotFoundError: "No microphone found. Connect a microphone and try again.",
    NotReadableError: "Cannot access the microphone. Check your device settings."
  };

  guide.textContent = messages[error.name] ||
    "Error: " + error.message;

  console.error(error);
}

// Record a new sample.
recordBtn.onclick = async function () {
  if (busy) return;

  const currentRequest = ++requestId;
  busy = true;
  recordBtn.disabled = true;
  playBtn.disabled = true;

  audio.pause();
  audio.hidden = true;
  guide.textContent = "Opening microphone. Please allow access.";

  try {
    if (!window.isSecureContext) {
      throw new Error("Please open the published HTTPS webpage.");
    }

    if (!navigator.mediaDevices?.getUserMedia ||
        !window.MediaRecorder) {
      throw new Error("This browser cannot record microphone audio.");
    }

    const incoming = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    // Ignore a request if the page was left while awaiting permission.
    if (currentRequest !== requestId) {
      incoming.getTracks().forEach(track => track.stop());
      return;
    }

    stream = incoming;
    const chunks = [];
    const session = new MediaRecorder(stream);
    let failed = false;

    recorder = session;

    session.ondataavailable = function (event) {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    session.onerror = function (event) {
      if (currentRequest !== requestId) return;

      failed = true;
      releaseMicrophone();
      resetButtons();
      showError(event.error || new Error("Recording failed."));
    };

    session.onstop = function () {
      if (currentRequest !== requestId || failed) return;

      releaseMicrophone();

      const blob = new Blob(chunks, {
        type: session.mimeType
      });

      if (blob.size > 0) {
        // Replace the previous recording.
        audio.removeAttribute("src");
        audio.load();

        if (audioURL) URL.revokeObjectURL(audioURL);

        audioURL = URL.createObjectURL(blob);
        audio.src = audioURL;
        audio.load();

        guide.textContent = "Step 3 — Your sound is ready. Press Play.";
      } else {
        guide.textContent = "No audio captured. Please record again.";
      }

      resetButtons();
    };

    session.start();
    stopBtn.disabled = false;

    guide.textContent =
      "Step 2 — Recording. Speak, then press Stop Recording.";

    // Prevent accidentally leaving the microphone recording.
    recordingTimer = setTimeout(stopRecording, 30000);
  } catch (error) {
    if (currentRequest !== requestId) return;

    releaseMicrophone();
    resetButtons();
    showError(error);
  }
};

function stopRecording() {
  if (recorder && recorder.state === "recording") {
    clearTimeout(recordingTimer);
    stopBtn.disabled = true;
    guide.textContent = "Preparing your recording...";
    recorder.stop();
  }
}

stopBtn.onclick = stopRecording;

// Play the sample once.
playBtn.onclick = async function () {
  if (!audioURL || busy) return;

  try {
    audio.currentTime = 0;
    await audio.play();
  } catch (error) {
    showError(error);
  }
};

audio.onplay = function () {
  guide.textContent = "Playing your sound...";
};

audio.onended = function () {
  guide.textContent = "Finished. Play again or record another sound.";
};

audio.onerror = function () {
  if (audio.getAttribute("src")) {
    guide.textContent = "This recording could not play. Please record again.";
  }
};

// Clean up when leaving the page.
window.addEventListener("pagehide", function () {
  requestId++;

  if (recorder && recorder.state === "recording") {
    recorder.stop();
  }

  releaseMicrophone();
  audio.pause();
  resetButtons();
  guide.textContent = "Step 1 — Ready. Press Record.";
});