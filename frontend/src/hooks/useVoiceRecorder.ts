import { useState, useRef, useCallback, useEffect } from 'react';
import fixWebmDuration from 'fix-webm-duration';
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
  const startTimeRef = useRef<number>(0);

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
        let blob = new Blob(chunksRef.current, { type: baseMime });
        // Fix WebM duration metadata so audio players show the correct length
        const recordingDurationMs = Date.now() - startTimeRef.current;
        if (baseMime.includes('webm')) {
          try {
            blob = await new Promise<Blob>((resolve) => {
              fixWebmDuration(blob, recordingDurationMs, (fixed: Blob) => resolve(fixed));
            });
          } catch { /* use original blob if fix fails */ }
        }
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
      startTimeRef.current = Date.now();
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

  // Cleanup on unmount: stop mic stream and timer to prevent resource leaks
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current?.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { isRecording, duration, startRecording, stopRecording, cancelRecording };
}
