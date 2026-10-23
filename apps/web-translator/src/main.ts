import "./style.css";
import {
  bytesLabel,
  conversationModels,
  LANGUAGES,
  microphoneError,
  route,
  validateManifest,
  type Lang,
  type Manifest,
  type Model,
} from "./core.ts";
import { cachedBytes, modelCacheName, prepareModels } from "./cache.ts";
import { LocalEngine } from "./engine.ts";
import {
  Conversation,
  type Entry,
  type Phase,
  type Resources,
} from "./session.ts";
import { speakLocal } from "./speech.ts";

const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const a = el<HTMLSelectElement>("language-a");
const b = el<HTMLSelectElement>("language-b");
const start = el<HTMLButtonElement>("start");
const send = el<HTMLButtonElement>("send");
const progress = el<HTMLProgressElement>("progress");
const typed = el<HTMLTextAreaElement>("typed");
const base = new URL(import.meta.env.BASE_URL, document.baseURI).href;
const policy = (document as Document & {
  permissionsPolicy?: { allowsFeature(feature: string): boolean };
  featurePolicy?: { allowsFeature(feature: string): boolean };
}).permissionsPolicy ?? (document as Document & {
  featurePolicy?: { allowsFeature(feature: string): boolean };
}).featurePolicy;
const microphoneIssue = !window.isSecureContext || !navigator.mediaDevices?.getUserMedia
  ? "Mikrofon wymaga HTTPS i zgodnej przeglądarki. Tryb tekstowy działa niezależnie od mikrofonu."
  : policy && !policy.allowsFeature("microphone")
    ? "Ta ramka podglądu blokuje mikrofon. Otwórz aplikację bezpośrednio jako stronę HTTPS i udziel jej zgody na mikrofon. Tryb tekstowy pozostaje dostępny."
    : "";
let manifest: Manifest | null = null;
let source: Lang = "pl";
let speechSource: Lang = source;
let phase: Phase = "idle";
let audioMode = true;
let currentModels: Model[] = [];
let storageGeneration = 0;
const entries = new Map<number, Entry>();
let replaying = false;

function message(id: "error" | "warning", text: string) {
  el(id).textContent = text;
  el(id).hidden = !text;
}
const targetFor = (language: Lang): Lang =>
  language === a.value ? (b.value as Lang) : (a.value as Lang);
const usable = () =>
  !!manifest && ["idle", "error", "listening"].includes(phase) && !replaying;

function renderControls() {
  const active = conversation.active;
  a.disabled = active || replaying;
  b.disabled = active || replaying;
  el<HTMLButtonElement>("source-a").disabled = !usable();
  el<HTMLButtonElement>("source-b").disabled = !usable();
  el("source-a").textContent = LANGUAGES[a.value as Lang].name;
  el("source-b").textContent = LANGUAGES[b.value as Lang].name;
  el("source-a").setAttribute("aria-pressed", String(source === a.value));
  el("source-b").setAttribute("aria-pressed", String(source === b.value));
  start.disabled = !manifest || replaying || (!!microphoneIssue && !active);
  start.classList.toggle("stopping", active);
  start.querySelector("span")!.textContent = active
    ? "Zakończ rozmowę"
    : "Rozpocznij rozmowę";
  send.disabled = !usable() || !typed.value.trim();
  el<HTMLButtonElement>("delete-models").disabled = active || replaying;
  for (const button of document.querySelectorAll<HTMLButtonElement>(".replay"))
    button.disabled = active || replaying;
}

function state(next: Phase, text?: string) {
  phase = next;
  const labels: Record<Phase, string> = {
    idle: "Gotowe, kiedy Ty jesteś.",
    preparing: "Przygotowuję lokalny silnik. Zaczekaj na „Słucham”, zanim zaczniesz mówić.",
    listening: audioMode
      ? "Słucham. Teraz możesz mówić."
      : "Tryb tekstowy. Wpisz wiadomość poniżej.",
    speech: "Słyszę Cię. Zakończ zdanie i zrób krótką pauzę.",
    recognizing: "Rozpoznaję wypowiedź na urządzeniu…",
    translating: "Tłumaczę na urządzeniu…",
    speaking: "Odczytuję. Mikrofon jest chwilowo wstrzymany.",
    error: "Nie udało się kontynuować rozmowy.",
  };
  el("status").textContent = labels[next];
  el("status").dataset.phase = next;
  if (next === "error") message("error", microphoneError(new Error(text)));
  if (next !== "preparing") progress.hidden = true;
  renderControls();
}

function renderEntry(entry: Entry) {
  entries.set(entry.id, entry);
  if (entries.size > 50) {
    const oldest = entries.keys().next().value!;
    entries.delete(oldest);
    document.getElementById(`entry-${oldest}`)?.remove();
  }
  el("empty")?.remove();
  let row = document.getElementById(`entry-${entry.id}`);
  if (!row) {
    row = document.createElement("article");
    row.id = `entry-${entry.id}`;
    row.className = "entry";
    const originalLabel = document.createElement("small");
    originalLabel.className = "entry-label original-label";
    const original = document.createElement("p");
    original.className = "original";
    const translatedLabel = document.createElement("small");
    translatedLabel.className = "entry-label translated-label";
    const translated = document.createElement("p");
    translated.className = "translated";
    const foot = document.createElement("div");
    foot.className = "entry-foot";
    const timing = document.createElement("small");
    timing.className = "timing";
    const replay = document.createElement("button");
    replay.type = "button";
    replay.className = "quiet replay";
    replay.textContent = "Odczytaj ↗";
    replay.addEventListener("click", async () => {
      if (conversation.active || replaying) return;
      const current = entries.get(entry.id);
      if (!current?.translated) return;
      replaying = true;
      renderControls();
      try {
        const warning = await speakLocal(
          current.translated,
          current.target,
          new AbortController().signal,
        );
        if (warning) message("warning", warning);
      } finally {
        replaying = false;
        renderControls();
      }
    });
    foot.append(timing, replay);
    row.append(originalLabel, original, translatedLabel, translated, foot);
    el("entries").append(row);
  }
  row.querySelector(".original-label")!.textContent =
    LANGUAGES[entry.source].name;
  row.querySelector(".original")!.textContent = entry.original;
  row.querySelector(".translated-label")!.textContent =
    LANGUAGES[entry.target].name;
  row.querySelector(".translated")!.textContent =
    entry.translated || "Tłumaczę…";
  row.querySelector(".timing")!.textContent = entry.translated
    ? `ASR ${(entry.asrMs / 1000).toFixed(1)} s · tłumaczenie ${(entry.mtMs / 1000).toFixed(1)} s`
    : "";
  row.querySelector<HTMLButtonElement>(".replay")!.hidden = !entry.translated;
  renderControls();
}

async function prepare(signal: AbortSignal): Promise<Resources> {
  if (!manifest) throw new Error("Nie załadowano katalogu modeli.");
  const models = audioMode
    ? currentModels
    : currentModels.filter((m) => m.id !== "asr");
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let engine: LocalEngine | null = null;
  type Capture = Awaited<
    ReturnType<typeof import("./capture.ts").createCapture>
  >;
  let capture: Capture | null = null;
  let capturePending: Promise<Capture> | null = null;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener("abort", aborted);
    engine?.destroy();
    window.speechSynthesis?.cancel();
    for (const track of stream?.getTracks() ?? []) track.stop();
    try {
      await (capture ?? (await capturePending))?.destroy();
    } catch {
      /* Tracks and context are still released below. */
    }
    if (context && context.state !== "closed") await context.close();
  };
  const aborted = () => {
    void close();
  };
  signal.addEventListener("abort", aborted, { once: true });
  try {
    if (audioMode) {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error("Mikrofon wymaga HTTPS i zgodnej przeglądarki.");
      // Resume the audio context within the original user gesture, before downloads.
      context = new AudioContext();
      await context.resume();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (error) {
        throw new Error(microphoneError(error));
      }
      if (signal.aborted) {
        for (const track of stream.getTracks()) track.stop();
        signal.throwIfAborted();
      }
      for (const track of stream.getAudioTracks()) track.enabled = false;
      for (const track of stream.getTracks())
        track.addEventListener(
          "ended",
          () => {
            if (conversation.active && !signal.aborted) {
              void conversation.stop();
              message(
                "error",
                "Połączenie z mikrofonem zostało przerwane. Rozpocznij rozmowę ponownie.",
              );
            }
          },
          { once: true },
        );
    }
    const total = models.reduce(
      (n, m) => n + m.files.reduce((s, f) => s + f.bytes, 0),
      0,
    );
    const estimate = await navigator.storage?.estimate?.();
    const existing = await cachedBytes(base, models);
    if (
      estimate?.quota &&
      estimate.quota - (estimate.usage ?? 0) <
        Math.max(0, total - existing) * 1.15
    )
      throw new Error(
        "Za mało miejsca na pakiet językowy. Zwolnij pamięć urządzenia lub wybierz inną parę.",
      );
    signal.throwIfAborted();
    await prepareModels(base, models, signal, (done, size, cached) => {
      if (signal.aborted) return;
      progress.hidden = false;
      progress.value = size ? (done / size) * 100 : 0;
      el("status").textContent =
        `${cached ? "Sprawdzam zapisany pakiet" : "Pobieram pakiet"}: ${bytesLabel(done)} z ${bytesLabel(size)}`;
    });
    signal.throwIfAborted();
    engine = new LocalEngine();
    el("status").textContent = audioMode
      ? "Uruchamiam lokalne rozpoznawanie mowy…"
      : "Przygotowuję lokalne tłumaczenie…";
    await engine.init(base, models, audioMode);
    signal.throwIfAborted();
    if (stream && context) {
      const { createCapture } = await import("./capture.ts");
      signal.throwIfAborted();
      capturePending = createCapture(base, stream, context, {
        start() {
          speechSource = source;
          conversation.speechStarted();
        },
        end(audio) {
          void conversation.submit(
            audio,
            speechSource,
            targetFor(speechSource),
          );
        },
        misfire() {
          conversation.speechMisfire();
        },
        limit() {
          message(
            "warning",
            "Wypowiedź była zbyt długa. Mów krótszymi zdaniami, do 20 sekund, i rób pauzy.",
          );
          conversation.speechMisfire();
        },
      });
      capture = await capturePending;
      // A Stop during asynchronous VAD initialization still owns the new VAD.
      if (signal.aborted) {
        await capture.destroy();
        signal.throwIfAborted();
      }
    }
    return {
      recognize: (audio, language) => engine!.recognize(audio, language),
      translate: (text, from, to) => engine!.translate(text, from, to),
      speak: speakLocal,
      pause: async () => {
        await capture?.pause();
      },
      resume: async () => {
        signal.throwIfAborted();
        if (context?.state === "suspended") await context.resume();
        await capture?.start();
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

const conversation = new Conversation({
  prepare,
  state,
  entry: renderEntry,
  warning: (text) => message("warning", text),
});

async function pairChanged() {
  const generation = ++storageGeneration;
  source = a.value as Lang;
  message("error", "");
  try {
    if (!manifest) return;
    currentModels = conversationModels(
      a.value as Lang,
      b.value as Lang,
      manifest.models,
    );
    const bytes = currentModels.reduce(
      (n, m) => n + m.files.reduce((s, f) => s + f.bytes, 0),
      0,
    );
    renderControls();
    const cached = await cachedBytes(base, currentModels);
    if (generation !== storageGeneration) return;
    const pivot =
      route(a.value as Lang, b.value as Lang, manifest.models).length > 1;
    el("download-info").textContent =
      cached === bytes
        ? `Pakiet zapisany na urządzeniu · ${bytesLabel(bytes)}${pivot ? " · tłumaczenie przez angielski" : ""}`
        : `Pierwsze uruchomienie: do ${bytesLabel(bytes - cached)} do pobrania. Zalecamy Wi-Fi.${pivot ? " Tłumaczenie przez angielski." : ""}`;
  } catch (error) {
    state("error", microphoneError(error));
  }
}
a.addEventListener("change", () => {
  if (a.value === b.value)
    b.value = ["pl", "nl", "en"].find((l) => l !== a.value)!;
  void pairChanged();
});
b.addEventListener("change", () => {
  if (a.value === b.value)
    a.value = ["pl", "nl", "en"].find((l) => l !== b.value)!;
  void pairChanged();
});
el("source-a").addEventListener("click", () => {
  if (usable()) {
    source = a.value as Lang;
    renderControls();
  }
});
el("source-b").addEventListener("click", () => {
  if (usable()) {
    source = b.value as Lang;
    renderControls();
  }
});
start.addEventListener("click", async () => {
  if (conversation.active) {
    await conversation.stop();
    void pairChanged();
    return;
  }
  audioMode = true;
  message("error", "");
  message("warning", "");
  await conversation.start();
});
typed.addEventListener("input", renderControls);
send.addEventListener("click", async () => {
  const text = typed.value.trim();
  if (!text || !usable()) return;
  const from = source,
    to = targetFor(from);
  message("error", "");
  message("warning", "");
  if (!conversation.active) {
    audioMode = false;
    await conversation.start();
  }
  if (phase === "listening") {
    typed.value = "";
    await conversation.submit(text, from, to);
  }
});
el("clear").addEventListener("click", async () => {
  await conversation.stop();
  window.speechSynthesis?.cancel();
  entries.clear();
  el("entries").replaceChildren();
});
el("delete-models").addEventListener("click", async () => {
  if (conversation.active) return;
  await caches.delete(modelCacheName(base));
  await pairChanged();
  el("status").textContent = "Pobrane modele zostały usunięte.";
});
window.addEventListener("pagehide", () => {
  window.speechSynthesis?.cancel();
  void conversation.stop();
});

async function boot() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(new URL("models-manifest.json", base), {
      cache: "no-cache",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error("Pakiety językowe nie są przygotowane na tym serwerze.");
    manifest = validateManifest(await response.json());
    clearTimeout(timeout);
    for (const [from, to] of [
      ["pl", "nl"],
      ["pl", "en"],
      ["nl", "en"],
    ] as [Lang, Lang][])
      conversationModels(from, to, manifest.models);
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
      .deviceMemory;
    if (deviceMemory && deviceMemory < 4)
      message(
        "warning",
        "To urządzenie ma mało pamięci. Lokalne modele mogą działać wolno lub przekroczyć limit karty.",
      );
    el("device-info").textContent =
      "Silnik: CPU / WebAssembly. WebGPU nie jest wymagane. Prototyp wymaga otwartej karty i krótkich, naprzemiennych wypowiedzi.";
    el("microphone-info").textContent = microphoneIssue;
    el("microphone-info").hidden = !microphoneIssue;
    state("idle");
    document.documentElement.dataset.startup = "ready";
    window.dispatchEvent(new Event("app-startup-complete"));
    await pairChanged();
    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      // Registration is optional: online translation remains usable if storage is denied.
      void navigator.serviceWorker
        .register(new URL("sw.js", base), { scope: base })
        .catch(() =>
          message(
            "warning",
            "Przeglądarka nie zapisała aplikacji offline. Pozostaw połączenie z Internetem.",
          ),
        );
    }
  } catch (error) {
    manifest = null;
    state("error", controller.signal.aborted
      ? "Przekroczono czas pobierania katalogu modeli (15 sekund). Sprawdź połączenie i załaduj stronę ponownie."
      : microphoneError(error));
    el("retry-startup").hidden = false;
    document.documentElement.dataset.startup = "error";
    window.dispatchEvent(new Event("app-startup-complete"));
  } finally {
    clearTimeout(timeout);
  }
}
// An asset failure reported by the independent bootstrap must stay visible.
if (document.documentElement.dataset.startup !== "error") void boot();
