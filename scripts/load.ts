import { WebSocket } from 'ws';
import type { RawData } from 'ws';
import { writeFileSync, mkdirSync } from 'node:fs';
import { encodeInput } from '../shared/protocol.ts';
import { inputSeq } from '../shared/types.ts';
const base = process.env.SERVER_URL ?? 'http://127.0.0.1:3000';
const counts = (process.env.LOAD_COUNTS ?? '8,32,64,128').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 128);
const duration = Number(process.env.LOAD_SECONDS ?? 10);
const rows: { clients: number; p50: number; p95: number; p99: number; max: number; exceeded33: boolean }[] = [];

async function createBot(i: number): Promise<{ socket: WebSocket; stop: () => void }> {
  const socket = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`);
  await new Promise<void>((resolve,reject)=>{ socket.once('open',resolve); socket.once('error',reject); });
  socket.send(JSON.stringify({ type: 'join', name: `Bot${i}`, roomId: 'training' }));
  await new Promise<void>((resolve,reject)=>{
    const timeout = setTimeout(()=>reject(new Error('Bot join timed out')),4000);
    function onMessage(raw: RawData) {
      try { const v=JSON.parse(raw.toString()); if (v.type==='joined') { clearTimeout(timeout);socket.off('message',onMessage); resolve(); } } catch { /* binary snapshots */ }
    }
    socket.on('message',onMessage);
  });
  let seq=0;
  const interval = setInterval(()=>{
    if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 128*1024) return;
    const step = seq++;
    socket.send(encodeInput({ type:'input',seq:inputSeq(step+1),thrust:true,
      left:step%100<25,right:step%100>=75,fire:step%8===0,homing:false }));
  },1000/30);
  return { socket, stop() { clearInterval(interval);socket.close(); } };
}
for (const count of counts) {
  const bots: Awaited<ReturnType<typeof createBot>>[] = [];
  try {
    console.log(`Connecting ${count} bots ...`);
    for (let i=0;i<count;i++) bots.push(await createBot(i));
    await new Promise(r=>setTimeout(r, duration*1000));
    const response = await fetch(`${base}/health`);
    if (!response.ok) throw new Error(`Health ${response.status}`);
    const result = await response.json() as { tick: { p50:number;p95:number;p99:number;max:number } };
    const row={clients:count,...result.tick,exceeded33:result.tick.p99>33};
    rows.push(row); console.log(row);
  } finally {
    for (const bot of bots) bot.stop();
    await new Promise(r=>setTimeout(r,500));
  }
}
mkdirSync('docs',{recursive:true});
writeFileSync('docs/load.csv','clients,p50,p95,p99,max,exceeded33\n'+rows.map(r=>`${r.clients},${r.p50},${r.p95},${r.p99},${r.max},${r.exceeded33}`).join('\n')+'\n');
const max=Math.max(34,...rows.map(r=>r.p99));
const dots=rows.map((r,i)=>`${85+i*140},${250-r.p99/max*210}`).join(' ');
const graph=`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320"><rect width="640" height="320" fill="#101a2d"/><text x="35" y="25" fill="white" font-family="Arial" font-size="16">Server p99 tick by clients (ms)</text><path d="M60 40V250H610" stroke="#ddd" fill="none"/><path d="M60 ${250-33/max*210}H610" stroke="#ff7777" stroke-dasharray="5 5"/><text x="440" y="${245-33/max*210}" fill="#ffaaaa" font-size="11">33 ms threshold</text><polyline points="${dots}" fill="none" stroke="#59d8ff" stroke-width="3"/>${rows.map((r,i)=>`<circle cx="${85+i*140}" cy="${250-r.p99/max*210}" r="5" fill="#59d8ff"/><text x="${74+i*140}" y="275" fill="white" font-size="13">${r.clients}</text>`).join('')}</svg>`;
writeFileSync('docs/load.svg',graph);
console.log('Wrote docs/load.csv and docs/load.svg');
