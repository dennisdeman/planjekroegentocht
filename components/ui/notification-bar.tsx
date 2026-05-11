"use client";

import { useEffect, useState, useRef } from "react";

export type NotificationType = "success" | "error" | "info";

const AUTO_CLOSE_MS = 5000;

interface NotificationBarProps {
  message: string;
  type?: NotificationType;
  onClose?: () => void;
}

export function NotificationBar({ message, type = "info", onClose }: NotificationBarProps) {
  const [remaining, setRemaining] = useState(AUTO_CLOSE_MS);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setRemaining(AUTO_CLOSE_MS);
  }, [message]);

  useEffect(() => {
    if (!onClose) return;

    const timer = setTimeout(() => onClose(), remaining);
    const tick = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setRemaining(Math.max(0, AUTO_CLOSE_MS - elapsed));
    }, 100);

    return () => { clearTimeout(timer); clearInterval(tick); };
  }, [message, onClose, remaining <= 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const seconds = Math.ceil(remaining / 1000);

  return (
    <section className={`notification-bar notification-${type}`} role="status" aria-live="polite">
      <p>{message}</p>
      {onClose ? (
        <button type="button" className={`notification-close notification-close-${type}`} onClick={onClose}>
          Sluiten ({seconds})
        </button>
      ) : null}
    </section>
  );
}
