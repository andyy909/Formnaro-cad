import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
export function createSpeechFixture(target){
 fs.mkdirSync(path.dirname(target),{recursive:true});
 if(process.platform!=='win32')throw Error('Die Sprachprüfung benötigt Windows mit einer lokalen deutschen Systemstimme.');
 const file=path.resolve(target).replaceAll("'","''");
 execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Add-Type -AssemblyName System.Speech; $speaker=New-Object System.Speech.Synthesis.SpeechSynthesizer; try { $speaker.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::NotSet,[System.Speech.Synthesis.VoiceAge]::NotSet,0,[System.Globalization.CultureInfo]::GetCultureInfo('de-DE')); $speaker.SetOutputToWaveFile('${file}'); $speaker.Speak('Erstelle eine Wange mit einem Ring und einer Grundplatte. Die Grundplatte ist acht Millimeter dick.'); } finally { $speaker.Dispose(); }`],{windowsHide:true,stdio:'pipe'});
 return target;
}
