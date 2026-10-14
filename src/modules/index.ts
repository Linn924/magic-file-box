import word from "@/modules/word";
import text from "@/modules/text";
import excel from "@/modules/excel";
import ppt from "@/modules/ppt";
import pdf from "@/modules/pdf";
import image from "@/modules/image";
export const previewModules = [word, text, excel, ppt, pdf, image];
export function getPreviewModule(extension: string) {
  return previewModules.find((module) =>
    module.extensions.includes(extension.toLowerCase()),
  );
}
