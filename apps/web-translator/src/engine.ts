import type { Lang, Model } from "./core.ts";
export class LocalEngine {
  private worker = new Worker(
    new URL("./inference.worker.ts", import.meta.url),
    { type: "module" },
  );
  private next = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor() {
    this.worker.onmessage = ({ data }) => {
      const request = this.pending.get(data.id);
      if (!request) return;
      clearTimeout(request.timer);
      this.pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve({ ...data.result, ms: data.ms });
    };
    this.worker.onerror = () =>
      this.destroy(
        new Error(
          "Silnik został przerwany. Urządzenie może mieć za mało pamięci. Wybierz mniej wymagający pakiet lub spróbuj na komputerze.",
        ),
      );
  }
  private call(
    type: string,
    args: object,
    transfer: Transferable[] = [],
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      const timer = setTimeout(
        () =>
          this.destroy(
            new Error(
              "Przekroczono czas obliczeń. Spróbuj na mocniejszym urządzeniu.",
            ),
          ),
        180_000,
      );
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, type, ...args }, transfer);
    });
  }
  init(base: string, models: Model[], speech = true) {
    return this.call("init", { base, models, speech });
  }
  recognize(
    audio: Float32Array,
    source: Lang,
  ): Promise<{ text: string; ms: number; warning?: string }> {
    return this.call("recognize", { audio, source }, [audio.buffer]);
  }
  translate(
    text: string,
    source: Lang,
    target: Lang,
  ): Promise<{ text: string; ms: number }> {
    return this.call("translate", { text, source, target });
  }
  destroy(error = new Error("Rozmowa została zakończona.")) {
    this.worker.terminate();
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
}
