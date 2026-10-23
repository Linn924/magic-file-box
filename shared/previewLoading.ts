/** Session-only preview task state; never persisted with file view/settings. */
export type PreviewLoadStage = 'reading' | 'queued' | 'parsing' | 'rendering' | 'password';
export type PreviewLoadPhase = PreviewLoadStage | 'idle' | 'ready' | 'error';
/** Renderer module lifetime, captured separately for every loading attempt. */
export interface PreviewTask {
  readonly signal: AbortSignal;
  report(stage: PreviewLoadStage): void;
}
