let count=0;
export function hasActiveOutputs(){return count>0;}
export function beginOutput(){count++;let ended=false;return ()=>{if(!ended){ended=true;count--;}};}
