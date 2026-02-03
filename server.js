import fs from "fs";
import path from "path";
import express from "express";
import dotenv from "dotenv";
import mammoth from "mammoth";
import OpenAI from "openai";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  console.error("Missing OPENAI_API_KEY in environment");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: openaiApiKey });
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const chaptersDir = path.join(__dirname, "chapters");
const publicDir = path.join(__dirname, "public");
const audioDir = path.join(publicDir, "audio");
const manifestPath = path.join(audioDir, "manifest.json");
const CHUNK_LIMIT = 3900; // stay below OpenAI 4096 char limit

app.use(express.json({ limit: "2mb" }));
app.use(express.static(publicDir));

function ensureAudioDir() {
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }
  if (!fs.existsSync(manifestPath)) {
    fs.writeFileSync(manifestPath, JSON.stringify([]), "utf8");
  }
}

function listDocxFiles() {
  if (!fs.existsSync(chaptersDir)) return [];
  return fs
    .readdirSync(chaptersDir)
    .filter((file) => file.toLowerCase().endsWith(".docx"));
}

function sanitizeBaseName(name) {
  return name.replace(/[^a-z0-9-_]+/gi, "_").toLowerCase();
}

function readManifest() {
  try {
    if (!fs.existsSync(manifestPath)) return [];
    const raw = fs.readFileSync(manifestPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeManifest(entries) {
  fs.writeFileSync(manifestPath, JSON.stringify(entries, null, 2), "utf8");
}

function removeFromManifest(audioUrl) {
  const manifest = readManifest();
  const filtered = manifest.filter((item) => item.audioUrl !== audioUrl);
  writeManifest(filtered);
}

function splitIntoChunks(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= CHUNK_LIMIT) return [cleaned];

  const words = cleaned.split(" ");
  const chunks = [];
  let current = "";

  for (const word of words) {
    const pending = current.length ? `${current} ${word}` : word;
    if (pending.length > CHUNK_LIMIT) {
      if (current.length) {
        chunks.push(current);
        current = word;
      } else {
        // Single word longer than limit; force split
        chunks.push(word.slice(0, CHUNK_LIMIT));
        current = word.slice(CHUNK_LIMIT);
      }
    } else {
      current = pending;
    }
  }
  if (current.length) {
    chunks.push(current);
  }
  return chunks;
}

async function parseDocxToText(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value || "";
}

async function synthesizeSpeech(text, { voice, model, speed }) {
  const chunks = splitIntoChunks(text);
  const audioBuffers = [];

  for (const chunk of chunks) {
    const speech = await openai.audio.speech.create({
      model,
      voice,
      input: chunk,
      response_format: "mp3",
      speed,
    });
    const buffer = Buffer.from(await speech.arrayBuffer());
    audioBuffers.push(buffer);
  }

  return Buffer.concat(audioBuffers);
}

app.get("/api/chapters", (_req, res) => {
  try {
    const files = listDocxFiles();
    res.json(files);
  } catch (err) {
    console.error("Error listing chapters:", err);
    res.status(500).json({ error: "Failed to list chapters" });
  }
});

app.get("/api/chapter-text", async (req, res) => {
  const { chapterName } = req.query;
  if (!chapterName) {
    return res.status(400).json({ error: "chapterName is required" });
  }
  const chapterPath = path.join(chaptersDir, chapterName);
  if (!fs.existsSync(chapterPath)) {
    return res.status(404).json({ error: "Chapter file not found" });
  }

  try {
    const text = await parseDocxToText(chapterPath);
    res.json({ text });
  } catch (err) {
    console.error("Error reading chapter text:", err);
    res.status(500).json({ error: "Failed to read chapter text" });
  }
});

app.get("/api/audios", (_req, res) => {
  try {
    ensureAudioDir();
    const manifest = readManifest();
    res.json(manifest);
  } catch (err) {
    console.error("Error reading manifest:", err);
    res.status(500).json({ error: "Failed to read audio manifest" });
  }
});

app.post("/api/generate", async (req, res) => {
  const { chapterName, voice, model = "tts-1", speed = 1 } = req.body || {};
  if (!chapterName || !voice) {
    return res
      .status(400)
      .json({ error: "chapterName and voice are required" });
  }

  const chapterPath = path.join(chaptersDir, chapterName);
  if (!fs.existsSync(chapterPath)) {
    return res.status(404).json({ error: "Chapter file not found" });
  }

  try {
    const text = await parseDocxToText(chapterPath);
    if (!text.trim()) {
      return res.status(400).json({ error: "Chapter has no readable text" });
    }

    const combined = await synthesizeSpeech(text, { voice, model, speed });

    ensureAudioDir();
    const base = sanitizeBaseName(path.basename(chapterName, ".docx"));
    const fileName = `${base}_${voice}_${model}_${Date.now()}.mp3`;
    const outputPath = path.join(audioDir, fileName);
    fs.writeFileSync(outputPath, combined);

    const entry = {
      audioUrl: `/audio/${fileName}`,
      chapter: chapterName,
      voice,
      model,
      createdAt: Date.now(),
    };
    const manifest = readManifest();
    manifest.push(entry);
    writeManifest(manifest);

    res.json(entry);
  } catch (err) {
    console.error("Error generating audio:", err);
    res.status(500).json({ error: "Failed to generate speech" });
  }
});

app.post("/api/generate-test", async (req, res) => {
  const {
    voice,
    model = "tts-1",
    speed = 1,
    message = "This is a test for Nick",
  } = req.body || {};

  if (!voice) {
    return res.status(400).json({ error: "voice is required" });
  }

  try {
    const combined = await synthesizeSpeech(message, { voice, model, speed });
    ensureAudioDir();
    const fileName = `test_${voice}_${model}_${Date.now()}.mp3`;
    const outputPath = path.join(audioDir, fileName);
    fs.writeFileSync(outputPath, combined);

    const entry = {
      audioUrl: `/audio/${fileName}`,
      chapter: "Test Message",
      voice,
      model,
      createdAt: Date.now(),
    };
    const manifest = readManifest();
    manifest.push(entry);
    writeManifest(manifest);

    res.json(entry);
  } catch (err) {
    console.error("Error generating test audio:", err);
    res.status(500).json({ error: "Failed to generate test speech" });
  }
});

app.delete("/api/audio", (req, res) => {
  const { audioUrl } = req.query;
  if (!audioUrl) {
    return res.status(400).json({ error: "audioUrl is required" });
  }

  try {
    const safePath = audioUrl.startsWith("/audio/") ? audioUrl.slice(1) : audioUrl;
    const targetPath = path.join(publicDir, safePath);
    if (!targetPath.startsWith(audioDir)) {
      return res.status(400).json({ error: "Invalid audio path" });
    }
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    removeFromManifest(audioUrl);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting audio:", err);
    res.status(500).json({ error: "Failed to delete audio" });
  }
});

// Return JSON for unknown /api routes to avoid HTML error bodies
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
