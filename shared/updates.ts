export type UpdatePhase='idle'|'checking'|'available'|'downloading'|'downloaded'|'installing'|'error'|'unsupported';
export interface UpdateState {phase:UpdatePhase;currentVersion:string;version?:string;notes?:string;progress:number;transferred:number;total:number;message:string;retry?:'check'|'download';}
export type UpdateAction='check'|'download'|'cancel'|'install';
export interface RestartReport {busy:boolean;notes:boolean;}
export function stableVersion(value:unknown):value is string{return typeof value==='string'&&value.length<=32&&/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);}
export function newerVersion(next:string,current:string){if(!stableVersion(next)||!stableVersion(current))return false;const a=next.split('.').map(BigInt),b=current.split('.').map(BigInt);for(let i=0;i<3;i++){if(a[i]>b[i])return true;if(a[i]<b[i])return false;}return false;}
export function allowedUpdateUrl(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(['github.com','api.github.com'].includes(u.hostname)||u.hostname.endsWith('.githubusercontent.com'));}catch{return false;}}
