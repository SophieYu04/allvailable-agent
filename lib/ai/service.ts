import type { Extraction } from "@/lib/calendar/schemas";
import { extractCalendarImages, extractCalendarText, parseCalendarCorrection, parseClarificationText, transcribeAudio } from "./openai";
import { normalizeModelExtraction } from './import-normalization';

export async function analyzeImport(input: { images?: Array<{ id: string; dataUrl: string }>; audio?: Blob; transcript?: string; sourceId?: string }): Promise<Extraction> {
  if (input.images?.length) return normalizeModelExtraction(await extractCalendarImages(input.images));
  if (input.transcript) return {...normalizeModelExtraction(await extractCalendarText(input.transcript)),transcript:input.transcript};
  if (!input.audio) throw new Error("IMPORT_INPUT_REQUIRED");
  const transcript = await transcribeAudio(input.audio);
  return { ...normalizeModelExtraction(await extractCalendarText(transcript)), transcript };
}

export async function analyzeClarificationVoice(input: Blob, question: { prompt: string; options?: string[] }) {
  return parseClarificationText(await transcribeAudio(input), question);
}

export async function analyzeCalendarCorrectionVoice(input: Blob, event: {
  title: string; date: string | null; startTime: string | null; endTime: string | null;
}) {
  const transcript = await transcribeAudio(input);
  return { transcript, correction: await parseCalendarCorrection(transcript, event) };
}
