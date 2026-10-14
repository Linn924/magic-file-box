export function printError(error: unknown) {
  return String(error)
    .replace(/^Error: /, "")
    .replace(/^Error invoking remote method '[^']+': /, "")
    .replace(/^Error: /, "");
}
