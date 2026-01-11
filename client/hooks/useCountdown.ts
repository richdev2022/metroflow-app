import { useState, useEffect, useCallback } from "react";

export function useCountdown(initialSeconds: number = 60) {
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds((prev) => prev - 1);
      }, 1000);
    } else if (seconds === 0) {
      setIsActive(false);
    }

    return () => clearInterval(interval);
  }, [isActive, seconds]);

  const startCountdown = useCallback(() => {
    setSeconds(initialSeconds);
    setIsActive(true);
  }, [initialSeconds]);

  const resetCountdown = useCallback(() => {
    setIsActive(false);
    setSeconds(0);
  }, []);

  return {
    seconds,
    isActive,
    startCountdown,
    resetCountdown,
    formattedTime: `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`,
  };
}
