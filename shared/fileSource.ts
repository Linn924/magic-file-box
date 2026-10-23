import { codeExtensions } from './codeFormats';

export type FileSourceKind = 'text' | 'csv' | 'xlsx' | 'docx' | 'pptx' | 'pdf' | 'image';
export type FileSource = { kind: FileSourceKind; size: number };
const text = new Set<string>(['txt','text','json','md','log','xml','js','ts','css','ini','yaml','yml','toml',...codeExtensions]);
/** Routing thresholds choose a bounded reader, rather than rejecting the file. */
export function fileSourceKind(ext: string, size: number): FileSourceKind | undefined {
  if(ext==='svg'&&size>4*1024*1024)return 'text';
  if (text.has(ext) && size > 4*1024*1024) return 'text';
  if ((ext==='csv'||ext==='tsv') && size > 8*1024*1024) return 'csv';
  if (ext==='pdf' && size > 16*1024*1024) return 'pdf';
  if (['xlsx','docx','pptx'].includes(ext) && size > 24*1024*1024) return ext as FileSourceKind;
  if (['png','jpg','jpeg','webp','gif','bmp'].includes(ext) && size > 8*1024*1024) return 'image';
}
export type SourceRow = { index: number; cells: string[]; line?: number; continued?: boolean; level?: number; assets?:string[]; assetWarning?:string };
export type SourceInfo = FileSource & { encoding?: string; sheets?: Array<{id: string; name: string}>; width?: number; height?: number; url?: string; /** At most 1 MiB, returned only to the image's owner; never persisted. */ imageHeader?:Uint8Array };
export type SourceRequest = { start: number; count?: number; column?: number; sheet?: string; query?: string };
export type SourcePage = { start: number; rows: SourceRow[]; more: boolean; scanned: number; total?: number; columns: number; match?: number };
/** Parser-facing I/O capability. No user paths leave the main process. */
export interface SourceReader {
  readonly size: number;
  readonly ext: string;
  read(offset: number, length: number, signal: AbortSignal): Promise<Uint8Array>;
}
export interface RecordSource {
  info: SourceInfo;
  page(request: SourceRequest, signal: AbortSignal): Promise<SourcePage>;
  close(): void | Promise<void>;
}
export interface SourceArchive {
  names: string[];
  size(name:string):number|undefined;
  begin(): void;
  stream(name:string,signal:AbortSignal):AsyncIterable<Uint8Array>;
  small(name:string,limit:number,signal:AbortSignal):Promise<Uint8Array>;
  close():void;
}
export const SOURCE_CHUNK = 128*1024;
export const SOURCE_PAGE_ROWS = 100;
export const SOURCE_PAGE_COLUMNS = 40;
export const SOURCE_REPLY_CHARS = 512*1024;
