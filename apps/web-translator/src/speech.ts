import { LANGUAGES, localVoice, type Lang } from "./core.ts";

export async function speakLocal(
  text: string,
  target: Lang,
  signal: AbortSignal,
): Promise<string | null> {
  if (signal.aborted) return null;
  if (!("speechSynthesis" in window))
    return "Ta przeglądarka nie udostępnia odczytu głosowego. Tłumaczenie tekstowe działa.";
  const synth = window.speechSynthesis;
  let voice = localVoice(synth.getVoices(), target);
  if (!voice) {
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        synth.removeEventListener("voiceschanged", finish);
        resolve();
      };
      const timer = setTimeout(finish, 1000);
      synth.addEventListener("voiceschanged", finish, { once: true });
    });
    voice = localVoice(synth.getVoices(), target);
  }
  if (signal.aborted) return null;
  if (!voice)
    return `Brak lokalnego głosu: ${LANGUAGES[target].name}. Tekst działa. Dodaj bezpłatny głos w ustawieniach systemu tego urządzenia (Windows, Android lub iPhone), a potem otwórz przeglądarkę ponownie. Nie używamy zastępczego głosu chmurowego.`;
  const warning = await new Promise<string | null>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice!;
    utterance.lang = voice!.lang;
    utterance.rate = 0.95;
    let settled = false;
    const finish = (message: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      resolve(message);
    };
    const cancel = () => {
      synth.cancel();
      finish(null);
    };
    const timer = setTimeout(() => {
      synth.cancel();
      finish(
        "Odczyt został przerwany po przekroczeniu czasu. Możesz odtworzyć tekst ponownie.",
      );
    }, 90_000);
    signal.addEventListener("abort", cancel, { once: true });
    utterance.onend = () => finish(null);
    utterance.onerror = () =>
      finish(
        "Przeglądarka zablokowała odczyt. Użyj przycisku „Odczytaj” pod tłumaczeniem.",
      );
    synth.cancel();
    synth.speak(utterance);
  });
  // Do not feed the loudspeaker's final reverberation back into recognition.
  if (!signal.aborted) await new Promise((resolve) => setTimeout(resolve, 450));
  return warning;
}
