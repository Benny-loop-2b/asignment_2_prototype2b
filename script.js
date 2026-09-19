// HTML loads this script with defer.
const guide = document.querySelector("#guide");
const recordBtn = document.querySelector("#record");
const stopBtn = document.querySelector("#stopRec");
const playBtn = document.querySelector("#play");
const audio = document.querySelector("#audio");

let recorder;
let stream;
let audioURL;
let timer;
let busy = false;
let requestId = 0;

guide.textContent = "Step 1 — Ready. Press Record.";
recordBtn.disabled = false;

function releaseMicrophone() {
  clearTimeout(timer);

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
    NotFoundError: "No microphone found. Connect one and try again.",
    NotReadableError: "Cannot open the microphone. Check your device settings."
  };

  guide.textContent = messages[error.name] ||
    "Error: " + error.message;

  console.error(error);
}

// Start recording.
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
      throw new Error("Please open your published HTTPS webpage.");
    }

    if (!navigator.mediaDevices?.getUserMedia ||
        !window.MediaRecorder) {
      throw new Error("Microphone recording is unavailable in this browser.");
    }

    const incoming = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

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

    timer = setTimeout(stopRecording, 30000);
  } catch (error) {
    if (currentRequest !== requestId) return;

    releaseMicrophone();
    resetButtons();
    showError(error);
  }
};

// Stop manually or after 30 seconds.
function stopRecording() {
  if (recorder && recorder.state === "recording") {
    clearTimeout(timer);
    stopBtn.disabled = true;
    guide.textContent = "Preparing your recording...";
    recorder.stop();
  }
}

stopBtn.onclick = stopRecording;

// Play the recording once.
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

// Release resources when leaving the page.
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