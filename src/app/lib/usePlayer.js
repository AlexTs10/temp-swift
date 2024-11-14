// usePlayer.js
import { useState, useRef } from "react";

export function usePlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef(null);
  const sourceRef = useRef(null);

  async function play(arrayBuffer, callback) {
    if (isPlaying) stop();

    audioContextRef.current = new AudioContext();
    try {
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      sourceRef.current = audioContextRef.current.createBufferSource();
      sourceRef.current.buffer = audioBuffer;
      sourceRef.current.connect(audioContextRef.current.destination);
      sourceRef.current.start();

      setIsPlaying(true);
      sourceRef.current.onended = () => {
        setIsPlaying(false);
        if (callback) callback();
      };
    } catch (error) {
      console.error("Error decoding audio data:", error);
      setIsPlaying(false);
    }
  }

  function stop() {
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsPlaying(false);
  }

  return {
    isPlaying,
    play,
    stop,
  };
}
