import type {PdfPrintJob} from '@shared/printing';

export interface PrintRenderContext {
  host: HTMLElement;
  isDisposed(): boolean;
  ready(): Promise<void>;
}

export interface PrintRenderer {
  render(job: PdfPrintJob): Promise<void>;
  dispose(): void;
}
