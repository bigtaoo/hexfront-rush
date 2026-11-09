/** `version+commit` of this build, from scripts/buildId.mjs (Vite's `define`). */
declare const __HF_BUILD__: string;

interface ImportMetaEnv {
  /** Where solo replays go (replayUpload.ts); unset, the relay's own /r. */
  readonly VITE_REPLAY_URL?: string;
}
