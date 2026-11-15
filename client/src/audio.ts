import { gameEvents } from './events.ts';
export function createSoundSystem(buffers: Record<string, AudioBuffer>) {
  let context: AudioContext | null = null;
  const listeners: [string, EventListener][] = [];
  function play(type: string) {
    if (!context || context.state !== 'running' || !buffers[type]) return;
    const source = context.createBufferSource();
    const volume = context.createGain();
    source.buffer = buffers[type] ?? null;
    volume.gain.value = type === 'fired' ? 0.16 : 0.25;
    source.connect(volume).connect(context.destination);
    source.start();
  }
  return {
    async unlock() {
      if (!context) context = new AudioContext(); // Викликається лише з натискання Join.
      await context.resume();
      for (const type of ['fired', 'hit', 'exploded']) {
        const handler = () => play(type);
        gameEvents.addEventListener(type, handler);
        listeners.push([type, handler]);
      }
    },
    async dispose() {
      for (const [name, handler] of listeners) gameEvents.removeEventListener(name, handler);
      listeners.length = 0;
      if (context) await context.close();
      context = null;
    },
  };
}
