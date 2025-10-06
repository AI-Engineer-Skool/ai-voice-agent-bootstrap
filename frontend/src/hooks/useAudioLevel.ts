import { useEffect, useRef, useState } from "react";

const MIN_DECIBELS = -80;
const MAX_DECIBELS = -10;

export function useAudioLevel(stream: MediaStream | null, enabled = true): number {
  const [level, setLevel] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    if (!enabled || !stream) {
      setLevel(0);
      return undefined;
    }

    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return undefined;
    }

    let audioContext: AudioContext;
    try {
      audioContext = new AudioContextClass();
    } catch {
      return undefined;
    }
    audioContextRef.current = audioContext;

    let source: MediaStreamAudioSourceNode;
    try {
      source = audioContext.createMediaStreamSource(stream);
    } catch {
      audioContext.close().catch(() => undefined);
      audioContextRef.current = null;
      return undefined;
    }
    sourceRef.current = source;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.minDecibels = MIN_DECIBELS;
    analyser.maxDecibels = MAX_DECIBELS;
    analyser.smoothingTimeConstant = 0.6;

    source.connect(analyser);
    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

    const update = () => {
      const analyserNode = analyserRef.current;
      const dataArray = dataArrayRef.current;
      if (!analyserNode || !dataArray) {
        return;
      }
      analyserNode.getByteTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i += 1) {
        const value = dataArray[i] - 128;
        sumSquares += value * value;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length) / 128;
      setLevel(rms);
      rafRef.current = window.requestAnimationFrame(update);
    };

    rafRef.current = window.requestAnimationFrame(update);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch {
          // ignore disconnect errors
        }
        sourceRef.current = null;
      }
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch {
          // ignore disconnect errors
        }
        analyserRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => undefined);
        audioContextRef.current = null;
      }
      setLevel(0);
    };
  }, [stream, enabled]);

  return level;
}
