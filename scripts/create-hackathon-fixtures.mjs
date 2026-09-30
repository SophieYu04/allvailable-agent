import {mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
const dir='outputs/hackathon-fixtures';
mkdirSync(dir,{recursive:true});
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"><rect width="1000" height="800" fill="#faf9f6"/><g font-family="Arial, sans-serif" fill="#202f29"><text x="50" y="65" font-size="30">Synthetic calendar · 測試行事曆</text><text x="50" y="110" font-size="26">2026-10-03 · Asia/Taipei</text><text x="50" y="180" font-size="22">18:00</text><text x="50" y="310" font-size="22">19:00</text><text x="50" y="440" font-size="22">20:00</text><text x="50" y="570" font-size="22">21:00</text><text x="50" y="700" font-size="22">22:00</text></g><g stroke="#ccd1ca"><path d="M150 160H950M150 290H950M150 420H950M150 550H950M150 680H950"/></g><rect x="160" y="165" width="780" height="120" rx="12" fill="#d8e7df"/><rect x="160" y="555" width="780" height="120" rx="12" fill="#e8dfd3"/><g font-family="Arial, sans-serif" font-size="26" fill="#202f29"><text x="190" y="218">讀書 · Study</text><text x="190" y="254">18:00–19:00</text><text x="190" y="608">運動 · Exercise</text><text x="190" y="644">21:00–22:00</text></g></svg>`;
await sharp(Buffer.from(svg)).png().toFile(dir+'/calendar.png');
const taskList=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"><rect width="1000" height="800" fill="#fbfaf7"/><g font-family="Arial, sans-serif" fill="#172b24"><text x="64" y="76" font-size="32">我的一天 · My day</text><text x="64" y="132" font-size="28">2026 年 10 月 3 日（星期六）</text></g><g stroke="#e1e4df" stroke-width="2"><path d="M64 190H936M64 370H936M64 550H936M64 730H936"/></g><g fill="none" stroke="#648278" stroke-width="3"><rect x="72" y="224" width="28" height="28" rx="6"/><rect x="72" y="404" width="28" height="28" rx="6"/><rect x="72" y="584" width="28" height="28" rx="6"/></g><g font-family="Arial, sans-serif" fill="#172b24"><text x="126" y="245" font-size="30">交研究報告 · 期限今天 23:59</text><text x="126" y="425" font-size="30">和 Maya 吃晚餐</text><text x="126" y="605" font-size="30">買火車票</text><text x="126" y="290" font-size="20" fill="#687871">截止時間 · Deadline</text><text x="126" y="470" font-size="20" fill="#687871">待辦 · To do</text><text x="126" y="650" font-size="20" fill="#687871">待辦 · To do</text></g></svg>`;
await sharp(Buffer.from(taskList)).png().toFile(dir+'/dated-tasks.png');
writeFileSync(dir+'/dated-tasks.truth.json',JSON.stringify({date:'2026-10-03',timeZone:'Asia/Taipei',items:[{title:'交研究報告',expectedAction:'skip_deadline',expectedGridCells:[]},{title:'和 Maya 吃晚餐',expectedAction:'voice_confirm_exact_time',expectedGridCells:['2026-10-03-19:00','2026-10-03-19:30','2026-10-03-20:00']},{title:'買火車票',expectedAction:'skip_task',expectedGridCells:[]}],invariants:['every visible row has its own review card','unconfirmed items do not change cells','skipped rows create no availability cells','the assistant never invents an exact time']},null,2)+'\n');
writeFileSync(dir+'/voice.txt','我在二零二六年十月三日，台灣時間晚上七點到九點有空。\n');
writeFileSync(dir+'/clarification-voice.txt','晚餐從晚上七點到八點半，台灣時間。\n');
if(process.platform==='darwin'){
 const result=spawnSync('say',['-v','Meijia','-f',dir+'/voice.txt','-o',dir+'/voice.aiff'],{stdio:'inherit'});
 if(result.status!==0)throw Error('Chinese speech synthesis failed');
 const convert=spawnSync('afconvert',['-f','WAVE','-d','LEI16',dir+'/voice.aiff',dir+'/voice.wav'],{stdio:'inherit'});
 if(convert.status!==0)throw Error('WAV conversion failed');
 const clarify=spawnSync('say',['-v','Meijia','-f',dir+'/clarification-voice.txt','-o',dir+'/clarification-voice.aiff'],{stdio:'inherit'});
 if(clarify.status!==0)throw Error('Chinese clarification speech synthesis failed');
 const clarifyConvert=spawnSync('afconvert',['-f','WAVE','-d','LEI16',dir+'/clarification-voice.aiff',dir+'/clarification-voice.wav'],{stdio:'inherit'});
 if(clarifyConvert.status!==0)throw Error('Chinese clarification WAV conversion failed');
}
console.log('Synthetic fixtures generated in '+dir);
