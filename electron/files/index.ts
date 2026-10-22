import { realpath,stat,open } from "node:fs/promises";
import path from "node:path";
import { previewError } from '@shared/previewError';
import { randomUUID } from "node:crypto";
import { extensions, type PreviewFile } from "@shared/contracts";
import { fileSourceKind } from '@shared/fileSource';
import { imageSize } from '@/modules/image/core/dimensions';

const selectedPaths = new Map<string, string>();
type ReadTask = { promise: Promise<PreviewFile>; controller: AbortController; users: Set<symbol>; done: boolean };
const reads = new Map<string, ReadTask>();
const references = new Map<string, Set<number>>();
const passwords=new Map<string,string>();
export function rememberPdfPassword(owner:number,id:string,password:string) {
  if(!references.get(id)?.has(owner)||typeof password!=='string'||password.length>2048)throw Error('文件已关闭，无法保存本次解锁状态。');
  passwords.set(id,password);
}
function sessionFile(file:PreviewFile):PreviewFile {
  const password=passwords.get(file.id);
  return password?{...file,view:{zoom:100,scroll:[],...file.view,pdfPassword:password}}:file;
}
export function retainPreparedFiles(owner:number,files:PreviewFile[]) {
  for(const file of files) {
    if(!selectedPaths.has(file.id))continue;
    let users=references.get(file.id);if(!users){users=new Set();references.set(file.id,users);}users.add(owner);
  }
}
export function releasePreparedReference(owner:number,id:string) {
  const users=references.get(id);if(!users)return;
  users.delete(owner);if(!users.size){references.delete(id);releasePreparedFile(id);}
}
export function releasePreparedOwner(owner:number) { for(const id of references.keys())releasePreparedReference(owner,id); }
export function discardUnownedFiles(files:PreviewFile[]) { for(const file of files)if(!references.has(file.id))releasePreparedFile(file.id); }
export function transferPreparedReference(source:number,target:number,id:string) {
  const users=references.get(id);if(users?.has(source))users.add(target);
}

/**
 * 打开只读句柄并检查类型、格式与按需预览路由。
 * 成功时返回句柄与大小；失败时设置 file.error 并返回 null。
 */
async function openAndValidate(
  filePath: string,
  file: PreviewFile,
): Promise<{ handle: Awaited<ReturnType<typeof open>>; size: number } | null> {
  let handle;
  try {
    handle = await open(filePath, "r");
    const stat = await handle.stat();
    file.size = stat.size;
    if (!stat.isFile()) throw new Error("请选择文件，暂不支持文件夹。");
    if (!extensions.includes(file.ext)) throw new Error("暂不支持此文件格式。");
    const kind = fileSourceKind(file.ext, stat.size);
    file.source = kind ? { kind, size: stat.size } : undefined;
    if(['png','jpg','jpeg','gif','webp','bmp'].includes(file.ext)){
      const header=Buffer.alloc(Math.min(stat.size,1024*1024));await handle.read(header,0,header.length,0);
      const dimensions=imageSize(header);
      if(!dimensions||dimensions.width*dimensions.height>6_000_000)file.source={kind:'image',size:stat.size};
    }
    return { handle, size: stat.size };
  } catch (e) {
    await handle?.close();
    file.error =
      (e as NodeJS.ErrnoException)?.code
        ? previewError(e, "文件")
        : e instanceof Error
          ? e.message
          : "无法读取文件。";
    return null;
  }
}

/** 元数据阶段：仅校验并记录路径，不读取字节。 */
export async function preparePreviewFile(filePath: string): Promise<PreviewFile> {
  const file: PreviewFile = {
    id: randomUUID(),
    name: path.basename(filePath),
    ext: path.extname(filePath).slice(1).toLowerCase(),
    size: 0,
    bytes: new Uint8Array(),
    error: "",
  };
  const result = await openAndValidate(filePath, file);
  if (result) {
    await result.handle.close();
    selectedPaths.set(file.id, filePath);
  }
  return file;
}

/** 按需加载：标签挂载时读取字节。 */
export async function loadPreparedFile(file: PreviewFile, signal?: AbortSignal, whole = false): Promise<PreviewFile> {
  signal?.throwIfAborted();
  if (file.bytes?.byteLength || file.error) return sessionFile(file);
  const selected = selectedPaths.get(file.id);
  if (!selected) return { ...file, error: "文件已关闭，请重新选择。" };
  // Revalidate size and routing on retry; file-backed formats never enter the byte cache.
  const prepared = await prepareSourceMetadata(selected, file);
  signal?.throwIfAborted();
  if(selectedPaths.get(file.id)!==selected)return {...file,error:'文件已关闭，请重新选择。'};
  if ((!whole && prepared.source) || prepared.error) return sessionFile(prepared);
  let pending = reads.get(file.id);
  if (!pending) {
    const controller = new AbortController();
    pending = { controller, users: new Set(), done: false, promise: readPreviewFile(selected, controller.signal) };
    reads.set(file.id, pending);
    const task = pending;
    void task.promise.finally(() => {
      task.done = true;
      if (reads.get(file.id) === task) reads.delete(file.id);
    }).catch(() => {});
  }
  const task = pending, user = Symbol();
  task.users.add(user);
  const loaded = await new Promise<PreviewFile>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', cancel);
      task.users.delete(user);
      if (!task.done && !task.users.size) {
        // A retry must never attach to the read that was just cancelled.
        if (reads.get(file.id) === task) reads.delete(file.id);
        task.controller.abort();
      }
    };
    const cancel = () => { finish(); reject(signal!.reason); };
    signal?.addEventListener('abort', cancel, { once: true });
    task.promise.then(value => { finish(); resolve(value); }, error => { finish(); reject(error); });
    if (signal?.aborted) cancel();
  });
  signal?.throwIfAborted();
  if (selectedPaths.get(file.id) !== selected) return { ...file, error: "文件已关闭，请重新选择。" };
  return sessionFile({ ...loaded, id: file.id, view: file.view });
}

export function releasePreparedFile(id: string) { selectedPaths.delete(id);passwords.delete(id);reads.get(id)?.controller.abort(); }
/** Caller has already checked the window's prepared reference. */
export function selectedSourcePath(id:string) { const value=selectedPaths.get(id);if(!value)throw Error('来源文件已关闭。');return value; }
async function prepareSourceMetadata(filePath:string,file:PreviewFile) {
  const metadata={...file,bytes:new Uint8Array(),error:''};
  const result=await openAndValidate(filePath,metadata);
  await result?.handle.close();
  return metadata;
}
export function preparedFileName(owner:number,id:string){return ownsPreparedFile(owner,id)?path.basename(selectedPaths.get(id)||''):'';}
export function preparedFilePath(owner:number,id:string){if(!ownsPreparedFile(owner,id))throw Error('来源文件已关闭。');return selectedPaths.get(id)||'';}
export async function isPreparedSourceTarget(target:string){
  if(isPreparedSourcePath(target))return true;
  const actual=await realpath(target).catch(()=>path.resolve(target));const info=await stat(target).catch(()=>undefined);
  for(const source of selectedPaths.values()){
    const resolved=await realpath(source).catch(()=>path.resolve(source));if(actual.toLowerCase()===resolved.toLowerCase())return true;
    if(info){const original=await stat(source).catch(()=>undefined);if(original&&info.ino!==0&&info.ino===original.ino&&info.dev===original.dev)return true;}
  }
  return false;
}
export function ownsPreparedFile(owner:number,id:string){return references.get(id)?.has(owner)??false;}
export function isPreparedSourcePath(filePath:string){const target=path.resolve(filePath).toLowerCase();return [...selectedPaths.values()].some(source=>path.resolve(source).toLowerCase()===target);}
export function preparedFileCount() { return selectedPaths.size; }

/** 直接读取文件的完整字节（供打印等场景使用）。 */
export async function readPreviewFile(filePath: string, signal?:AbortSignal): Promise<PreviewFile> {
  const file: PreviewFile = {
    id: randomUUID(),
    name: path.basename(filePath),
    ext: path.extname(filePath).slice(1).toLowerCase(),
    size: 0,
    bytes: new Uint8Array(),
    error: "",
  };
  const result = await openAndValidate(filePath, file);
  if (!result) return file;
  try {
    // Full readers (legacy formats and output paths) keep an allocation budget.
    // Large preview-capable formats use file-backed readers instead.
    if (result.size > 128*1024*1024) {file.error='完整读取超出 128 MiB 缓冲区预算；此格式的完整解析或打印暂不支持该文件。';return file;}
    const buffer = await result.handle.readFile({signal});
    // Keep a whole owned backing buffer; pooled/sliced Buffers need one tight copy.
    file.bytes = buffer.byteOffset===0&&buffer.buffer.byteLength===buffer.byteLength
      ? new Uint8Array(buffer.buffer) : new Uint8Array(buffer);
    file.source = undefined;
  } catch (e) {
    file.error = previewError(e, "文件");
  } finally {
    await result.handle.close();
  }
  return file;
}

export function fileArguments(args: string[]): string[] {
  return args.filter(
    (arg) =>
      path.isAbsolute(arg) &&
      extensions.includes(path.extname(arg).slice(1).toLowerCase()),
  );
}
