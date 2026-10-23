import { modelPath } from "./installation.ts";
export type Lang = "pl" | "nl" | "en";
export const LANGUAGES: Record<
  Lang,
  { name: string; asr: string; locale: string }
> = {
  pl: { name: "Polski", asr: "polish", locale: "pl-PL" },
  nl: { name: "Niderlandzki", asr: "dutch", locale: "nl-NL" },
  en: { name: "Angielski", asr: "english", locale: "en-GB" },
};
export interface Artifact {
  path: string;
  bytes: number;
  sha256: string;
}
export interface Model {
  id: string;
  repo: string;
  revision: string;
  base: string;
  license: string;
  prefix: string;
  source: Lang | null;
  target: Lang | null;
  files: Artifact[];
}
export interface Manifest {
  version: number;
  models: Model[];
}

export function route(source: Lang, target: Lang, models: Model[]): Model[] {
  if (source === target) throw new Error("Wybierz dwa różne języki.");
  const direct = models.find((m) => m.source === source && m.target === target);
  if (direct) return [direct];
  const first = models.find((m) => m.source === source && m.target === "en");
  const second = models.find((m) => m.source === "en" && m.target === target);
  if (first && second) return [first, second];
  throw new Error(
    `Brak zweryfikowanego modelu ${source.toUpperCase()} → ${target.toUpperCase()}.`,
  );
}

export function conversationModels(a: Lang, b: Lang, models: Model[]): Model[] {
  const asr = models.find((m) => m.id === "asr");
  if (!asr) throw new Error("Brak zweryfikowanego modelu rozpoznawania mowy.");
  return [
    ...new Map(
      [asr, ...route(a, b, models), ...route(b, a, models)].map((m) => [
        m.id,
        m,
      ]),
    ).values(),
  ];
}

export function validateManifest(value: unknown): Manifest {
  const candidate = value as Manifest;
  if (
    candidate?.version !== 1 ||
    !Array.isArray(candidate.models) ||
    !candidate.models.length
  )
    throw new Error(
      "Brak katalogu zweryfikowanych modeli. Uruchom przygotowanie modeli.",
    );
  const ids = new Set<string>();
  for (const model of candidate.models) {
    if (
      !/^[a-z-]+$/.test(model.id) ||
      ids.has(model.id) ||
      !["apache-2.0", "mit"].includes(model.license) ||
      !/^[a-f0-9]{40}$/.test(model.revision) ||
      !model.files?.length
    )
      throw new Error("Nieprawidłowy katalog modeli.");
    ids.add(model.id);
    const paths = new Set<string>();
    for (const f of model.files) {
      modelPath(model.id, f.path);
      if (
        !/^[a-zA-Z0-9_./-]+$/.test(f.path) ||
        f.path.startsWith("/") ||
        f.path.split("/").includes("..") ||
        !/^[a-f0-9]{64}$/.test(f.sha256) ||
        !Number.isSafeInteger(f.bytes) ||
        f.bytes <= 0 || paths.has(f.path)
      )
        throw new Error("Nieprawidłowy plik modelu.");
      paths.add(f.path);
    }
  }
  return candidate;
}

export const bytesLabel = (bytes: number): string =>
  `${(bytes / 1_000_000).toFixed(1)} MB`;
export function microphoneError(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "PermissionDeniedError")
    return "Brak zgody na mikrofon. Zezwól na dostęp w ustawieniach przeglądarki i spróbuj ponownie.";
  if (name === "NotFoundError") return "Nie znaleziono mikrofonu.";
  if (name === "NotReadableError")
    return "Mikrofon jest zajęty lub niedostępny. Zamknij inne aplikacje korzystające z mikrofonu.";
  return error instanceof Error
    ? error.message
    : "Nie udało się rozpocząć rozmowy.";
}

/** Epochs invalidate every late completion after Stop, restart or navigation. */
export class RunToken {
  private epoch = 0;
  next(): number {
    return ++this.epoch;
  }
  valid(token: number): boolean {
    return token === this.epoch;
  }
}

export function localVoice<T extends { lang: string; localService: boolean }>(
  voices: T[],
  lang: Lang,
): T | undefined {
  return voices.find(
    (v) => v.localService && v.lang.toLowerCase().split(/[-_]/)[0] === lang,
  );
}
