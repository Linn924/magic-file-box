import { mkdirSync, writeFileSync } from 'node:fs';
import { extensions } from '@shared/contracts';

// Register Open With candidates only. Never replace an extension's default value
// or Windows UserChoice. Uninstall removes only our own registration.
const formats = [...new Set(extensions)];
const install = formats.map(ext =>
  `  WriteRegNone SHELL_CONTEXT "Software\\Classes\\.${ext}\\OpenWithProgids" "FilePreview.Document"\n` +
  `  WriteRegStr SHELL_CONTEXT "Software\\Classes\\Applications\\File Preview.exe\\SupportedTypes" ".${ext}" ""`
).join('\n');
const uninstall = formats.map(ext =>
  `  DeleteRegValue SHELL_CONTEXT "Software\\Classes\\.${ext}\\OpenWithProgids" "FilePreview.Document"`
).join('\n');
const source = String.raw`!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\FilePreview.Document" "" "File Preview document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\FilePreview.Document\DefaultIcon" "" '"$INSTDIR\File Preview.exe",0'
  WriteRegStr SHELL_CONTEXT "Software\Classes\FilePreview.Document\shell\open\command" "" '"$INSTDIR\File Preview.exe" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\File Preview.exe" "FriendlyAppName" "File Preview"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\File Preview.exe\shell\open\command" "" '"$INSTDIR\File Preview.exe" "%1"'
${install}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
${uninstall}
  DeleteRegKey SHELL_CONTEXT "Software\Classes\FilePreview.Document"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\File Preview.exe"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
`;
mkdirSync('electron-dist', { recursive: true });
writeFileSync('electron-dist/associations.nsh', source);
