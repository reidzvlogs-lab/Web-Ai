const apiKey = document.getElementById("apiKey");
const model = document.getElementById("model");
const allowlist = document.getElementById("allowlist");
const denylist = document.getElementById("denylist");
const requireConfirmRisky = document.getElementById("requireConfirmRisky");
const maxSteps = document.getElementById("maxSteps");
const saveButton = document.getElementById("saveButton");

async function loadSettings() {
  const settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  apiKey.value = settings.apiKey || "";
  model.value = settings.model || "gpt-4o-mini";
  allowlist.value = (settings.allowlist || []).join("\n");
  denylist.value = (settings.denylist || []).join("\n");
  requireConfirmRisky.checked = settings.safety?.requireConfirmRisky ?? true;
  maxSteps.value = settings.maxSteps || 25;
}

function parseList(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

saveButton.addEventListener("click", async () => {
  const settings = {
    apiKey: apiKey.value.trim(),
    provider: "openai",
    model: model.value.trim() || "gpt-4o-mini",
    allowlist: parseList(allowlist.value),
    denylist: parseList(denylist.value),
    safety: {
      requireConfirmRisky: requireConfirmRisky.checked
    },
    maxSteps: Number.parseInt(maxSteps.value, 10) || 25
  };
  await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings });
  saveButton.textContent = "Saved!";
  setTimeout(() => {
    saveButton.textContent = "Save Settings";
  }, 1200);
});

loadSettings();
