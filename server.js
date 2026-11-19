const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.use(express.json({ limit: "12mb" }));
app.use(express.static(__dirname));

app.get("/api/status", (_req, res) => {
  res.json({
    server: "online",
    groqConfigured: Boolean(GROQ_API_KEY),
    chatModel: process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b",
    visionModel: process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b"
  });
});


// Search Wikimedia Commons and return direct thumbnail URLs for inline display.
app.get("/api/images", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim().slice(0, 120);
    if (!query) return res.status(400).json({ error: "Enter something to search for." });

    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: `filetype:bitmap ${query}`,
      gsrnamespace: "6",
      gsrlimit: "8",
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: "720",
      format: "json",
      origin: "*"
    });

    const upstream = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": "ApertureVision/1.0 (image search; educational project)" },
      signal: AbortSignal.timeout(15000)
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: "The image library is temporarily unavailable." });
    }

    const data = await upstream.json();
    const pages = Object.values(data?.query?.pages || {});
    const images = pages.map((page) => {
      const info = page.imageinfo?.[0];
      if (!info?.thumburl && !info?.url) return null;
      const meta = info.extmetadata || {};
      const clean = (value) => String(value?.value || "").replace(/<[^>]*>/g, "").trim();
      return {
        title: String(page.title || "").replace(/^File:/, ""),
        imageUrl: info.thumburl || info.url,
        sourceUrl: info.descriptionurl || info.url,
        creator: clean(meta.Artist) || "Wikimedia Commons contributor",
        license: clean(meta.LicenseShortName) || "See source page"
      };
    }).filter(Boolean);

    res.set("Cache-Control", "public, max-age=300");
    res.json({ images });
  } catch (error) {
    console.error("Image search error:", error);
    res.status(500).json({ error: "Could not search the image library. Please try again." });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!GROQ_API_KEY) {
      return res.status(503).json({ error: "Groq is not configured. Add GROQ_API_KEY in Render Environment." });
    }

    const { messages, image } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Please provide a message." });
    }

    const safeMessages = messages.slice(-12).map((m) => ({
      role: ["user", "assistant"].includes(m.role) ? m.role : "user",
      content: typeof m.content === "string" ? m.content.slice(0, 8000) : ""
    }));

    const systemMessage = {
      role: "system",
      content: "You are Aperture Vision, a helpful real-time visual AI assistant. When an image is attached, inspect the actual image carefully and answer questions about the visible scene, people, objects, text, colors, positions, and actions. The image may be the latest frame captured from the user’s live camera, so treat it as what the camera currently sees. Do not claim to see anything that is not visible. If no image is attached, answer general questions normally. Be clear about uncertainty. For health questions, provide general educational information only; do not diagnose or replace a qualified professional."
    };

    if (image && typeof image === "string" && image.startsWith("data:image/")) {
      const lastUserIndex = safeMessages.map(m => m.role).lastIndexOf("user");
      if (lastUserIndex < 0) return res.status(400).json({ error: "A user message is required with an image." });
      const userText = safeMessages[lastUserIndex].content || "Describe this image.";
      safeMessages[lastUserIndex] = {
        role: "user",
        content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: image } }
        ]
      };
    }

    const model = image
      ? (process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b")
      : (process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b");

    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [systemMessage, ...safeMessages],
        temperature: 0.5,
        max_tokens: 1200
      })
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      const message = data?.error?.message || `Groq returned HTTP ${upstream.status}`;
      return res.status(upstream.status).json({ error: message });
    }

    const answer = data?.choices?.[0]?.message?.content;
    if (!answer) return res.status(502).json({ error: "Groq returned an empty response." });
    res.json({ answer, model });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "The server could not complete the AI request." });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => console.log(`Aperture Vision running on port ${PORT}`));
