self.onmessage = (event: MessageEvent<number[]>) => {
  const ordered = event.data.sort((a,b)=>a-b);
  const p99 = ordered[Math.floor((ordered.length-1)*.99)] ?? 0;
  self.postMessage({ p99 });
};
