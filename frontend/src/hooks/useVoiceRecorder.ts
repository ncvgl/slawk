import { useState, useRef, useCallback } from 'react';
import { uploadFile, type ApiFile } from '@/lib/api';

interface UseVoiceRecorderOptions {
  onRecorded: (file: ApiFile) => void;
  onError?: (msg: string) => void;
}

export function useVoiceRecorder({ onRecorded, onError }: UseVoiceRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4;codecs=opus',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (chunksRef.current.length === 0) return;
        const actualMime = recorder.mimeType || mimeType || 'audio/webm';
        const baseMime = actualMime.split(';')[0];
        const ext = baseMime === 'audio/mp4' ? 'mp4' : baseMime === 'audio/ogg' ? 'ogg' : 'webm';
        const blob = new Blob(chunksRef.current, { type: baseMime });
        const filename = `voice-message-${Date.now()}.${ext}`;
        const file = new File([blob], filename, { type: baseMime });

        try {
          const uploaded = await uploadFile(file);
          onRecorded(uploaded);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to upload voice message.';
          onError?.(msg);
        }
      };

      recorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch {
      onError?.('Microphone access denied. Please allow microphone access.');
    }
  }, [onRecorded, onError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setDuration(0);
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Remove the onstop handler to prevent upload
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    chunksRef.current = [];
    setIsRecording(false);
    setDuration(0);
  }, []);

  return { isRecording, duration, startRecording, stopRecording, cancelRecording };
}
