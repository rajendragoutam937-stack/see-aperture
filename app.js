const $ = (id) => document.getElementById(id);
const state = { stream: null, imageData: null, detector: null, cameraLoop: false, frameBusy: false, lastFrame: null, messages: [] };
const messagesEl = $("chatMessages");

function toast(message) { const el = $("toast"); el.textContent = message; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2800); }
function appendText(parent, value) { const lines = String(value || "").split("\n"); lines.forEach((line, i) => { if (i) parent.appendChild(document.createElement("br")); parent.appendChild(document.createTextNode(line)); }); }
function renderAnswer(container, text) {
  const pattern = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"']+)/g;
  let last = 0, match;
  while ((match = pattern.exec(String(text || "")))) {
    appendText(container, String(text).slice(last, match.index));
    const url = match[2] || match[3];
    if (match[2] || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url)) {
      const img = document.createElement("img"); img.className = "chat-inline-image"; img.src = url; img.alt = match[1] || "Image in AI answer"; img.loading = "lazy"; container.appendChild(img);
    } else { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = url; container.appendChild(a); }
    last = pattern.lastIndex;
  }
  appendText(container, String(text || "").slice(last));
}
function addMessage(role, text) {
  const row = document.createElement("div"); row.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;
  const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.textContent = role === "user" ? "Y" : "✦";
  const bubble = document.createElement("div"); bubble.className = "bubble";
  if (role === "assistant") renderAnswer(bubble, text); else bubble.textContent = text;
  row.append(avatar, bubble); messagesEl.appendChild(row); messagesEl.scrollTop = messagesEl.scrollHeight; return row;
}
function setVisualStatus(active, text) { $("stageStatus").classList.toggle("active", active); $("stageStatusText").textContent = text; }
async function checkStatus() {
  try { const r = await fetch("/api/status"); const d = await r.json(); $("statusDot").style.background = d.groqConfigured ? "#20b56d" : "#e5a23b"; $("statusText").textContent = d.groqConfigured ? "Groq API · Connected" : "Groq key missing"; }
  catch { $("statusText").textContent = "Server offline"; $("statusDot").style.background = "#dc5965"; }
}
checkStatus();

$("themeBtn").addEventListener("click", () => { document.body.classList.toggle("dark"); $("themeBtn").textContent = document.body.classList.contains("dark") ? "☀" : "☾"; });

async function getDetector() {
  if (state.detector) return state.detector;
  if (!window.cocoSsd) throw new Error("Object detection model did not load. Check your internet connection and refresh.");
  toast("Loading object detection model for the first time…");
  state.detector = await cocoSsd.load({ base: "lite_mobilenet_v2" });
  return state.detector;
}
function drawDetections(predictions, source, canvas) {
  const width = source.videoWidth || source.naturalWidth; const height = source.videoHeight || source.naturalHeight;
  if (!width || !height) return;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, width, height);
  const scale = Math.max(1, width / 640); ctx.lineWidth = 2.5 * scale; ctx.font = `bold ${Math.max(13, 15 * scale)}px DM Sans`;
  predictions.forEach((p, index) => {
    const [x, y, w, h] = p.bbox; const color = index % 2 ? "#168bd2" : "#8427df";
    const label = `${p.class} ${Math.round(p.score * 100)}%`; const labelW = ctx.measureText(label).width + 16 * scale; const labelH = 25 * scale;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.strokeRect(x, y, w, h);
    const labelY = Math.max(0, y - labelH); ctx.fillRect(x, labelY, labelW, labelH); ctx.fillStyle = "#fff"; ctx.fillText(label, x + 7 * scale, labelY + 17 * scale);
  });
  $("objectCount").textContent = predictions.length;
  $("detectionList").textContent = predictions.length ? predictions.map(p => `${p.class} ${Math.round(p.score * 100)}%`).join(" · ") : "No common objects detected";
}
async function startCamera() {
  if (state.stream) return;
  if (!navigator.mediaDevices?.getUserMedia) { toast("Camera requires HTTPS and a supported browser."); return; }
  try {
    state.imageData = null;
    $("previewImage").hidden = true;
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    const video = $("cameraVideo"); video.srcObject = state.stream; video.hidden = false; await video.play();
    $("emptyState").hidden = true; $("detectCanvas").hidden = false; $("stageCornerLabel").hidden = false;
    $("stopCameraBtn").disabled = false; $("detectBtn").disabled = true;
    setVisualStatus(true, "Camera active · Detecting objects"); $("chatContext").textContent = "Camera is live. Ask about anything currently visible.";
    state.cameraLoop = true; runLiveDetection();
  } catch (error) { stopCamera(); toast(error.name === "NotAllowedError" ? "Allow camera permission in your browser to continue." : `Could not start camera: ${error.message}`); }
}
function stopCamera() {
  state.cameraLoop = false;
  if (state.stream) state.stream.getTracks().forEach(track => track.stop());
  state.stream = null; $("cameraVideo").pause(); $("cameraVideo").srcObject = null; $("cameraVideo").hidden = true;
  $("stopCameraBtn").disabled = true; $("detectCanvas").hidden = !state.imageData; $("stageCornerLabel").hidden = true;
  if (!state.imageData) $("emptyState").hidden = false;
  setVisualStatus(false, state.imageData ? "Picture loaded" : "Camera is off");
}
async function runLiveDetection() {
  try {
    const model = await getDetector();
    const video = $("cameraVideo"), canvas = $("detectCanvas");
    while (state.cameraLoop && state.stream) {
      if (video.readyState >= 2) {
        const predictions = await model.detect(video);
        if (state.cameraLoop) drawDetections(predictions, video, canvas);
      }
      await new Promise(resolve => setTimeout(resolve, 280));
    }
  } catch (error) { toast(error.message); stopCamera(); }
}
$("cameraBtn")?.addEventListener("click", startCamera);
$("emptyCameraBtn").addEventListener("click", startCamera);
$("stopCameraBtn").addEventListener("click", stopCamera);

$("imageInput").addEventListener("change", event => {
  const file = event.target.files?.[0]; if (!file) return;
  if (file.size > 8 * 1024 * 1024) { toast("Choose an image smaller than 8 MB."); event.target.value = ""; return; }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast("Use JPG, PNG or WEBP."); event.target.value = ""; return; }
  stopCamera(); const reader = new FileReader();
  reader.onload = () => { state.imageData = reader.result; const img = $("previewImage"); img.onload = async () => { img.hidden = false; $("emptyState").hidden = true; $("detectCanvas").hidden = false; $("stageCornerLabel").hidden = false; $("stageCornerLabel").textContent = "UPLOADED IMAGE"; $("detectBtn").disabled = false; setVisualStatus(false, "Picture ready · Ask a question"); $("chatContext").textContent = `Image loaded: ${file.name}. Ask about what is in it.`; await detectUploadedImage(); }; img.src = state.imageData; };
  reader.readAsDataURL(file); event.target.value = "";
});
async function detectUploadedImage() { try { const model = await getDetector(); const predictions = await model.detect($("previewImage")); drawDetections(predictions, $("previewImage"), $("detectCanvas")); } catch (e) { toast(e.message); } }
$("detectBtn").addEventListener("click", detectUploadedImage);
$("clearBtn").addEventListener("click", () => { stopCamera(); state.imageData = null; $("previewImage").src = ""; $("previewImage").hidden = true; $("emptyState").hidden = false; $("detectCanvas").hidden = true; $("stageCornerLabel").hidden = true; $("detectBtn").disabled = true; $("objectCount").textContent = "0"; $("detectionList").textContent = "Waiting for camera or image"; setVisualStatus(false, "Camera is off"); $("chatContext").textContent = "Ask about anything you see."; });

// Capture the latest live camera frame (or uploaded image) for Groq Vision.
function getCurrentVisual() {
  if (state.stream && $("cameraVideo").readyState >= 2) {
    const video = $("cameraVideo"); const maxWidth = 900; const ratio = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas"); canvas.width = Math.round(video.videoWidth * ratio); canvas.height = Math.round(video.videoHeight * ratio);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.76);
  }
  return state.imageData;
}
async function sendChat(rawText) {
  const prompt = rawText.trim(); if (!prompt) return;
  addMessage("user", prompt); state.messages.push({ role: "user", content: prompt }); $("chatInput").value = "";
  const waiting = addMessage("assistant", "Thinking…"); waiting.classList.add("thinking-message");
  try {
    const visual = getCurrentVisual();
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: state.messages.slice(-12), image: visual || undefined }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "AI request failed.");
    waiting.remove(); addMessage("assistant", data.answer); state.messages.push({ role: "assistant", content: data.answer });
  } catch (error) { waiting.remove(); addMessage("assistant", `I couldn't complete that request: ${error.message}`); }
}
$("chatForm").addEventListener("submit", event => { event.preventDefault(); sendChat($("chatInput").value); });
$("chatInput").addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); $("chatForm").requestSubmit(); } });
document.querySelectorAll(".suggestion").forEach(button => button.addEventListener("click", () => sendChat(button.textContent)));
$("clearChatBtn").addEventListener("click", () => { state.messages = []; messagesEl.replaceChildren(); addMessage("assistant", "Chat cleared. Ask me about the live camera, uploaded picture, or any other question."); });

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) $("micBtn").addEventListener("click", () => { const recognition = new SpeechRecognition(); recognition.lang = "en-IN"; recognition.interimResults = false; recognition.onresult = e => { $("chatInput").value = e.results[0][0].transcript; $("chatInput").focus(); }; recognition.onerror = () => toast("Voice input was unavailable."); recognition.start(); });
else $("micBtn").addEventListener("click", () => toast("Voice input is not supported in this browser. Try Chrome."));

const modal = $("infoModal"); function closeInfo() { modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); }
$("infoBtn").addEventListener("click", () => { modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); $("infoClose").focus(); });
$("infoClose").addEventListener("click", closeInfo); $("infoBackdrop").addEventListener("click", closeInfo);
document.addEventListener("keydown", event => { if (event.key === "Escape" && modal.classList.contains("open")) closeInfo(); });
