export interface SyntaxStyle {light:string;dark:string;lightFont:number;darkFont:number;kind:string;}
export type SyntaxPart=[start:number,end:number,style:number];
export interface SyntaxData {lines:SyntaxPart[][];styles:SyntaxStyle[];cost:number;}
export const SYNTAX_MAX_CHARS=2*1024*1024,SYNTAX_MAX_LINES=50000,SYNTAX_MAX_TOKENS=120000,SYNTAX_CACHE=8*1024*1024;
export function withinSyntaxBudget(text:string){if(text.length>SYNTAX_MAX_CHARS)return false;const lines=text.split('\n');return lines.length<=SYNTAX_MAX_LINES&&lines.every(line=>line.length<=20000);}
