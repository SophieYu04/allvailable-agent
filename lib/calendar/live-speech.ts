// Browser interim captions are optional; recorded audio remains the authoritative
// input for the server's Whisper → Nemotron pipeline after explicit confirmation.
type SpeechResult = { length: number; [index: number]: { isFinal: boolean; 0: { transcript: string } } };
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: {results: SpeechResult}) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start(): void; stop(): void; abort(): void };
export function startLiveSpeech(language: string, onText: (text: string) => void, onUnavailable: () => void, onStable?: (text:string)=>void) {
  const Constructor = (window as unknown as {SpeechRecognition?: new()=>Recognition; webkitSpeechRecognition?: new()=>Recognition}).SpeechRecognition ?? (window as unknown as {webkitSpeechRecognition?: new()=>Recognition}).webkitSpeechRecognition;
  if (!Constructor) { onUnavailable(); return null; }
  const recognition = new Constructor();
  let stopped = false, committed = '', current = '';
  recognition.lang = language; recognition.continuous = true; recognition.interimResults = true;
  recognition.onresult = event => {
    if (stopped) return;
    current = Array.from({length:event.results.length}, (_,i)=>event.results[i][0].transcript).join('');
    onText((committed + current).trim());
    const finalized = Array.from({length:event.results.length},(_,i)=>event.results[i]).filter(result=>result.isFinal).map(result=>result[0].transcript).join('');
    if(finalized.trim())onStable?.((committed+finalized).trim());
  };
  recognition.onerror = () => { if (!stopped) { stopped = true; onUnavailable(); } };
  recognition.onend = () => {
    if (stopped) return;
    committed += current; current = '';
    if(committed.trim())onStable?.(committed.trim());
    try { recognition.start(); } catch { stopped = true; onUnavailable(); }
  };
  try { recognition.start(); } catch { onUnavailable(); return null; }
  return { stop() { stopped = true; recognition.onend = null; recognition.onresult = null; recognition.abort(); } };
}
