import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastMessage } from '../types/kanji';

export type ShowToastFn = (
  tone: ToastMessage['tone'],
  title: string,
  detail?: string
) => void;

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastCounterRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast: ShowToastFn = useCallback((tone, title, detail) => {
    toastCounterRef.current += 1;
    const id = toastCounterRef.current;
    setToast({ id, tone, title, detail });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast(prev => (prev?.id === id ? null : prev));
    }, 6500);
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  return { toast, showToast, dismissToast };
}
