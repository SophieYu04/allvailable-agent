import { z } from 'zod';
import { timeSchema } from './schemas';
export const correctionSchema = z.object({
  intent: z.enum(['update_title', 'update_date', 'update_start_time', 'update_end_time', 'delete_event', 'add_event', 'confirm_event', 'unsupported']),
  title: z.string().trim().min(1).max(200).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  startTime: timeSchema.nullable(), endTime: timeSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  const fields = { update_title: 'title', update_date: 'date', update_start_time: 'startTime', update_end_time: 'endTime' } as const;
  const field = fields[value.intent as keyof typeof fields];
  if (field && !value[field]) ctx.addIssue({ code: 'custom', message: '修正值不完整' });
  if (value.intent === 'add_event' && (!value.title || !value.date || !value.startTime || !value.endTime)) ctx.addIssue({ code: 'custom', message: '新增事件資料不完整' });
});
export type Correction = z.infer<typeof correctionSchema>;
export type VoiceContext = { title: string; date: string | null; startTime: string | null; endTime: string | null };
const empty = { title: null, date: null, startTime: null, endTime: null };
function number(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text);
  const digits: Record<string, number> = { '零': 0, '一': 1, '二': 2, '兩': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  if (!/^(?:[零一二兩三四五六七八九]|十[一二三四五六七八九]?|[一二三四五]十[一二三四五六七八九]?)$/.test(text)) return null;
  if (text === '十') return 10;
  if (text.includes('十')) { const [t, o] = text.split('十'); return (t ? digits[t] : 1) * 10 + (o ? digits[o] : 0); }
  return digits[text] ?? null;
}
export function deterministicCorrection(raw: string, context: VoiceContext): Correction | null {
  const text = raw.replace(/[，。！？、\s]/g, '');
  if (/^(確認|確認事件|確認這個行程)$/.test(text)) return { ...empty, intent: 'confirm_event' };
  if (/^(刪除|刪掉|移除)(這個|目前)?(事件|行程)$/.test(text)) return { ...empty, intent: 'delete_event' };
  const title = text.match(/^(?:名稱|名字)(?:改成|改為)(.+)$/) ?? text.match(/^這個不是.+(?:課|會議|活動)[是而]+(.+)$/);
  if (title) return { ...empty, intent: 'update_title', title: title[1] };
  const weekday = text.match(/^(?:不是星期[一二三四五六日天]是|改成|日期改成)星期([一二三四五六日天])$/);
  if (weekday && context.date) {
    const origin = new Date(`${context.date}T00:00:00Z`);
    if (!Number.isFinite(origin.getTime()) || origin.toISOString().slice(0, 10) !== context.date) return null;
    const target = '日一二三四五六'.indexOf(weekday[1].replace('天', '日'));
    origin.setUTCDate(origin.getUTCDate() + target - origin.getUTCDay());
    return { ...empty, intent: 'update_date', date: origin.toISOString().slice(0, 10) };
  }
  const time = text.match(/^(?:(結束|開始)(?:時間)?(?:改成|改為)|改成|不是.+(?:是))(?:(上午|早上|下午|晚上))?([零一二兩三四五六七八九十\d]+)(?:點|:)(半|[零一二兩三四五六七八九十\d]+分?)?$/);
  if (!time) return null;
  let hour = number(time[3]);
  const minute = time[4] === '半' ? 30 : time[4] ? number(time[4].replace('分', '')) : 0;
  if (hour === null || minute === null || hour > 23 || minute > 59) return null;
  const end = time[1] === '結束';
  const original = end ? context.endTime : context.startTime;
  if (hour <= 12 && !time[2] && !original) return null;
  if (hour < 12 && (time[2] === '下午' || time[2] === '晚上' || !time[2] && original && Number(original.slice(0, 2)) >= 12)) hour += 12;
  if (hour === 12 && (time[2] === '上午' || time[2] === '早上')) hour = 0;
  const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { ...empty, intent: end ? 'update_end_time' : 'update_start_time', [end ? 'endTime' : 'startTime']: value };
}
