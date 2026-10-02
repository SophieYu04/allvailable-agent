import{expect,it}from'vitest';import{microphoneLevel}from'./audio-level';
it('shows silence as zero and increases with actual signal energy',()=>{expect(microphoneLevel(new Float32Array(32))).toBe(0);expect(microphoneLevel(new Float32Array(32).fill(.1))).toBeGreaterThan(microphoneLevel(new Float32Array(32).fill(.01)));expect(microphoneLevel(new Float32Array(32).fill(1))).toBe(1);});
