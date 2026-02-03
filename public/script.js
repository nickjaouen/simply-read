const chapterSelect = document.getElementById("chapterSelect");
const voiceSelect = document.getElementById("voiceSelect");
const modelSelect = document.getElementById("modelSelect");
const generateBtn = document.getElementById("generateBtn");
const testBtn = document.getElementById("testBtn");
const statusEl = document.getElementById("status");
const chapterTextEl = document.getElementById("chapterText");
const audioSelect = document.getElementById("audioSelect");
const audioDetail = document.getElementById("audioDetail");
let statusIntervalId = null;
let savedAudios = [];
let activeAudio = null;

document.addEventListener("DOMContentLoaded", () => {
  loadChapters().then(loadSavedAudios);
  generateBtn.addEventListener("click", onGenerate);
  testBtn.addEventListener("click", onTestGenerate);
  audioSelect.addEventListener("change", onAudioSelectChange);
  chapterSelect.addEventListener("change", () => {
    const chapterName = chapterSelect.value;
    if (chapterName) {
      loadChapterText(chapterName);
    } else {
      setChapterText("Select a chapter to load its text.");
    }
  });
});

async function loadChapters() {
  setStatus("Loading chapters...");
  try {
    const res = await fetch("/api/chapters");
    if (!res.ok) throw new Error(await res.text());
    const chapters = await res.json();
    chapterSelect.innerHTML = "";

    if (!chapters.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No chapters found";
      chapterSelect.appendChild(opt);
      setStatus("Add .docx files to the chapters folder.");
      return;
    }

    for (const chapter of chapters) {
      const opt = document.createElement("option");
      opt.value = chapter;
      opt.textContent = chapter;
      chapterSelect.appendChild(opt);
    }
    setStatus("");
    if (chapters[0]) {
      await loadChapterText(chapters[0]);
    }
  } catch (err) {
    console.error(err);
    setStatus("Could not load chapters.");
  }
}

async function onGenerate() {
  const chapterName = chapterSelect.value;
  const voice = voiceSelect.value;
  const model = modelSelect.value || "tts-1";

  if (!chapterName) {
    setStatus("Please select a chapter.");
    return;
  }

  generateBtn.disabled = true;
  testBtn.disabled = true;
  generateBtn.textContent = "Generating...";
  setStatus("Generating audio", true);

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterName, voice, model }),
    });

    const data = await parseJsonSafe(res);
    if (!res.ok || data?.error) {
      throw new Error(data?.error || "Failed to generate audio");
    }

    addOrUpdateAudio(data);
    setSelectedAudio(data.audioUrl);
    setStatus("Audio generated.");
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Error generating audio.");
  } finally {
    generateBtn.disabled = false;
    testBtn.disabled = false;
    generateBtn.textContent = "Generate Audio";
    clearStatusWorking();
  }
}

async function onTestGenerate() {
  const voice = voiceSelect.value;
  const model = modelSelect.value || "tts-1";

  generateBtn.disabled = true;
  testBtn.disabled = true;
  testBtn.textContent = "Generating Test...";
  setStatus("Generating test audio", true);

  try {
    const res = await fetch("/api/generate-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice, model }),
    });

    const data = await parseJsonSafe(res);
    if (!res.ok || data?.error) {
      throw new Error(data?.error || "Failed to generate test audio");
    }

    addOrUpdateAudio(data);
    setSelectedAudio(data.audioUrl);
    setStatus("Test audio generated.");
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Error generating test audio.");
  } finally {
    generateBtn.disabled = false;
    testBtn.disabled = false;
    testBtn.textContent = "Generate Test";
    clearStatusWorking();
  }
}

function renderAudioDetail(entry) {
  audioDetail.innerHTML = "";
  if (!entry) {
    audioDetail.textContent = "Choose an audio file to view controls.";
    return;
  }

  const { audioUrl, chapter, voice, model } = entry;
  const card = document.createElement("article");
  card.className = "audio-card";

  const meta = document.createElement("div");
  meta.className = "audio-meta";

  const title = document.createElement("div");
  title.textContent = chapter && chapter !== "Test Message" ? chapter : "Test Audio";

  const details = document.createElement("p");
  details.className = "muted";
  details.textContent = `Voice: ${voice} · Model: ${model}`;

  const viewTextBtn = document.createElement("button");
  viewTextBtn.className = "secondary small";
  viewTextBtn.textContent = "Show Text";
  viewTextBtn.addEventListener("click", () => {
    if (chapter && chapter !== "Test Message") {
      chapterSelect.value = chapter;
      loadChapterText(chapter);
    } else {
      setChapterText("Test audio has no chapter text.");
    }
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "danger small";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => deleteAudio(entry));

  meta.appendChild(title);
  meta.appendChild(details);
  meta.appendChild(viewTextBtn);
  meta.appendChild(deleteBtn);

  const controls = document.createElement("div");
  controls.className = "controls";

  const playBtn = document.createElement("button");
  playBtn.className = "play-btn";
  playBtn.textContent = "Play";

  const seekWrap = document.createElement("div");
  seekWrap.className = "seek";
  const seek = document.createElement("input");
  seek.type = "range";
  seek.min = 0;
  seek.value = 0;
  seek.step = 0.01;
  seekWrap.appendChild(seek);

  const timeLabel = document.createElement("div");
  timeLabel.className = "time";
  timeLabel.textContent = "0:00 / 0:00";

  controls.appendChild(playBtn);
  controls.appendChild(seekWrap);
  controls.appendChild(timeLabel);

  card.appendChild(meta);
  card.appendChild(controls);
  audioDetail.appendChild(card);

  const audio = new Audio(audioUrl);
  audio.preload = "metadata";

  audio.addEventListener("loadedmetadata", () => {
    seek.max = audio.duration;
    updateTimeLabel();
  });

  audio.addEventListener("timeupdate", () => {
    seek.value = audio.currentTime;
    updateTimeLabel();
  });

  audio.addEventListener("ended", () => {
    playBtn.textContent = "Play";
  });

  playBtn.addEventListener("click", () => {
    if (audio.paused) {
      audio.play();
      playBtn.textContent = "Pause";
    } else {
      audio.pause();
      playBtn.textContent = "Play";
    }
  });

  seek.addEventListener("input", () => {
    audio.currentTime = Number(seek.value);
    updateTimeLabel();
  });

  function updateTimeLabel() {
    const current = formatTime(audio.currentTime || 0);
    const total = formatTime(audio.duration || 0);
    timeLabel.textContent = `${current} / ${total}`;
  }
}

function formatTime(seconds) {
  const totalSeconds = Math.floor(seconds || 0);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

async function loadChapterText(chapterName) {
  setChapterText("Loading chapter text...");
  try {
    const res = await fetch(`/api/chapter-text?chapterName=${encodeURIComponent(chapterName)}`);
    const data = await parseJsonSafe(res);
    if (!res.ok || data?.error) {
      throw new Error(data?.error || "Could not load chapter text");
    }
    setChapterText(data.text || "No text found in this chapter.");
  } catch (err) {
    console.error(err);
    setChapterText(err.message || "Failed to load chapter text.");
  }
}

function setChapterText(text) {
  chapterTextEl.textContent = text;
}

function setStatus(message, isWorking = false) {
  clearStatusWorking();
  statusEl.textContent = message;
  if (isWorking) {
    statusEl.classList.add("status--working");
    let dots = 0;
    statusIntervalId = window.setInterval(() => {
      dots = (dots + 1) % 4;
      const suffix = ".".repeat(dots);
      statusEl.textContent = `${message}${suffix}`;
    }, 400);
  } else {
    statusEl.classList.remove("status--working");
  }
}

function clearStatusWorking() {
  statusEl.classList.remove("status--working");
  if (statusIntervalId) {
    window.clearInterval(statusIntervalId);
    statusIntervalId = null;
  }
}

async function loadSavedAudios() {
  try {
    const res = await fetch("/api/audios");
    const data = await parseJsonSafe(res);
    if (!res.ok || !Array.isArray(data)) return;
    savedAudios = data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderAudioSelect();
    if (savedAudios[0]) {
      setSelectedAudio(savedAudios[0].audioUrl);
    } else {
      renderAudioDetail(null);
    }
  } catch (err) {
    console.error("Could not load saved audios", err);
  }
}

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || "Unexpected response from server");
  }
}

function renderAudioSelect() {
  audioSelect.innerHTML = "";
  if (!savedAudios.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No audio files yet";
    audioSelect.appendChild(opt);
    return;
  }

  for (const entry of savedAudios) {
    const opt = document.createElement("option");
    opt.value = entry.audioUrl;
    const chapterLabel =
      entry.chapter && entry.chapter !== "Test Message" ? entry.chapter : "Test Audio";
    opt.textContent = `${chapterLabel} — ${entry.voice} / ${entry.model}`;
    audioSelect.appendChild(opt);
  }
}

function setSelectedAudio(audioUrl) {
  audioSelect.value = audioUrl || "";
  activeAudio = savedAudios.find((a) => a.audioUrl === audioUrl) || null;
  renderAudioDetail(activeAudio);
}

function onAudioSelectChange() {
  const audioUrl = audioSelect.value;
  setSelectedAudio(audioUrl);
}

function addOrUpdateAudio(entry) {
  savedAudios = savedAudios.filter((a) => a.audioUrl !== entry.audioUrl);
  savedAudios.unshift(entry);
  renderAudioSelect();
}

async function deleteAudio(entry) {
  if (!entry?.audioUrl) return;
  try {
    setStatus("Deleting audio...", true);
    const res = await fetch(
      `/api/audio?audioUrl=${encodeURIComponent(entry.audioUrl)}`,
      { method: "DELETE" }
    );
    const data = await parseJsonSafe(res);
    if (!res.ok || data?.error) {
      throw new Error(data?.error || "Failed to delete audio");
    }
    savedAudios = savedAudios.filter((a) => a.audioUrl !== entry.audioUrl);
    renderAudioSelect();
    if (savedAudios.length) {
      setSelectedAudio(savedAudios[0].audioUrl);
    } else {
      setSelectedAudio("");
      renderAudioDetail(null);
    }
    setStatus("Audio deleted.");
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Error deleting audio.");
  } finally {
    clearStatusWorking();
  }
}
