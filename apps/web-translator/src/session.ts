import { RunToken, type Lang } from "./core.ts";

export type Phase =
  | "idle"
  | "preparing"
  | "listening"
  | "speech"
  | "recognizing"
  | "translating"
  | "speaking"
  | "error";
export interface Entry {
  id: number;
  source: Lang;
  target: Lang;
  original: string;
  translated: string;
  asrMs: number;
  mtMs: number;
}
export interface Resources {
  recognize(
    audio: Float32Array,
    source: Lang,
  ): Promise<{ text: string; ms: number; warning?: string }>;
  translate(
    text: string,
    source: Lang,
    target: Lang,
  ): Promise<{ text: string; ms: number }>;
  speak(
    text: string,
    target: Lang,
    signal: AbortSignal,
  ): Promise<string | null>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  close(): Promise<void>;
}
export interface SessionPorts {
  prepare(signal: AbortSignal): Promise<Resources>;
  state(phase: Phase, message?: string): void;
  entry(entry: Entry): void;
  warning(message: string): void;
}

export class Conversation {
  private tokens = new RunToken();
  private controller: AbortController | null = null;
  private resources: Resources | null = null;
  private busy = false;
  private rowId = 0;
  private ports: SessionPorts;
  constructor(ports: SessionPorts) {
    this.ports = ports;
  }
  get active() {
    return this.controller !== null;
  }

  async start(): Promise<void> {
    if (this.active) return;
    const token = this.tokens.next();
    const controller = new AbortController();
    this.controller = controller;
    this.ports.state("preparing");
    try {
      const resources = await this.ports.prepare(controller.signal);
      if (!this.tokens.valid(token)) {
        await resources.close();
        return;
      }
      this.resources = resources;
      await resources.resume();
      if (this.tokens.valid(token)) this.ports.state("listening");
    } catch (error) {
      if (this.tokens.valid(token)) {
        await this.stop();
        this.ports.state(
          "error",
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  speechStarted() {
    if (this.resources && !this.busy) this.ports.state("speech");
  }
  speechMisfire() {
    if (this.resources && !this.busy) this.ports.state("listening");
  }
  async submit(
    input: Float32Array | string,
    source: Lang,
    target: Lang,
  ): Promise<void> {
    const resources = this.resources;
    const signal = this.controller?.signal;
    if (!resources || !signal || this.busy) return;
    if (source === target) return;
    this.busy = true;
    const valid = () => !signal.aborted && this.resources === resources;
    try {
      // Pause before ASR/MT, and keep capture paused until TTS and its echo tail end.
      this.ports.state(
        typeof input === "string" ? "translating" : "recognizing",
      );
      await resources.pause();
      if (!valid()) return;
      const recognized =
        typeof input === "string"
          ? { text: input.trim(), ms: 0 }
          : await resources.recognize(input, source);
      if (!valid()) return;
      if ("warning" in recognized && recognized.warning) this.ports.warning(recognized.warning);
      if (!recognized.text) return;
      const entry: Entry = {
        id: ++this.rowId,
        source,
        target,
        original: recognized.text,
        translated: "",
        asrMs: recognized.ms,
        mtMs: 0,
      };
      this.ports.entry({ ...entry });
      this.ports.state("translating");
      const translated = await resources.translate(
        recognized.text,
        source,
        target,
      );
      if (!valid()) return;
      entry.translated = translated.text;
      entry.mtMs = translated.ms;
      this.ports.entry({ ...entry });
      this.ports.state("speaking");
      const warning = await resources.speak(entry.translated, target, signal);
      if (valid() && warning) this.ports.warning(warning);
    } catch (error) {
      if (valid()) {
        await this.stop();
        this.ports.state(
          "error",
          error instanceof Error ? error.message : String(error),
        );
      }
    } finally {
      if (valid()) {
        try {
          await resources.resume();
          if (valid()) this.ports.state("listening");
        } catch (error) {
          await this.stop();
          this.ports.state(
            "error",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
      // An old completion must not unlock a new session's processing gate.
      if (this.resources === resources || !this.resources) this.busy = false;
    }
  }
  async stop() {
    this.tokens.next();
    this.controller?.abort();
    this.controller = null;
    const resources = this.resources;
    this.resources = null;
    this.busy = false;
    try {
      await resources?.close();
    } finally {
      this.ports.state("idle");
    }
  }
}
