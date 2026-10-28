import { useEffect, useRef } from 'react';

/** Sends one browser notification when a generation batch finishes. */
export const useJobNotifications = (activeRequests: number) => {
  const previous = useRef(activeRequests);

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (activeRequests > previous.current && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
    if (previous.current > 0 && activeRequests === 0 && Notification.permission === 'granted') {
      new Notification('Banana Studio', { body: 'Your generation is ready.' });
    }
    previous.current = activeRequests;
  }, [activeRequests]);
};
