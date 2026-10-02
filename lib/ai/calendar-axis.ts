/** Ground a calendar rectangle edge against nearby labeled clock ticks. */
export function timeAtCalendarEdge(y:number|null,axis:Array<{time:string;y:number}>):string|null{
 if(y===null||!Number.isFinite(y))return null;
 const ticks=axis.filter(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t.time)&&Number.isFinite(t.y)).sort((a,b)=>a.y-b.y);
 const minutes=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3));
 for(let i=0;i<ticks.length-1;i++){
  const a=ticks[i],b=ticks[i+1];if(y<a.y-2||y>b.y+2||b.y<=a.y)continue;
  const delta=minutes(b.time)-minutes(a.time);if(delta<=0||delta>120)return null;
  const value=minutes(a.time)+(y-a.y)/(b.y-a.y)*delta;
  const rounded=Math.round(value/5)*5;
  if(Math.abs(value-rounded)>2||rounded<0||rounded>=1440)return null;
  return `${String(Math.floor(rounded/60)).padStart(2,'0')}:${String(rounded%60).padStart(2,'0')}`;
 }return null;
}
