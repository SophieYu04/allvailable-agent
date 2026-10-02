import type {CalendarGeometry} from '@/lib/calendar/image-geometry';
import {prepareScreenshotCards} from '@/lib/calendar/screenshot-cards';
import type { Extraction } from "@/lib/calendar/schemas";
import { extractCalendarImages, extractCalendarText, parseCalendarCorrection, parseClarificationText, transcribeAudio } from "./openai";
import { normalizeModelExtraction } from './import-normalization';

export async function analyzeImport(input: { images?: Array<{ id: string; dataUrl: string;geometry?:CalendarGeometry|null }>; audio?: Blob; transcript?: string; imageContext?: {timezone:string;dateStart?:string;dateEnd?:string}; sourceId?: string }): Promise<Extraction> {
  if (input.images?.length) return prepareScreenshotCards(await extractCalendarImages(input.images,input.imageContext),input.imageContext?.timezone);
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
