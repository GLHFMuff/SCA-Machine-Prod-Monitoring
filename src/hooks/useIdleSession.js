import { useCallback, useEffect, useRef, useState } from 'react';
import { SESSION_ACTIVITY_EVENT, sendHeartbeatApi } from '../services/api.js';

const USER_ACTIVITY_EVENTS = [
  'pointerdown',
  'keydown',
  'touchstart',
  'input',
  'change',
  'wheel',
  SESSION_ACTIVITY_EVENT,
];

/**
 * Monitors real operator/user activity, synchronizes last_used_at via throttled heartbeat,
 * validates session state against server, and auto-logs out after `idleTimeoutMinutes`.
 */
export function useIdleSession({
  enabled,
  sessionKey,
  storageKey = 'mpm_last_activity_at',
  idleTimeoutMinutes = 120,
  idleWarningSeconds = 60,
  initialServerIdleMs = null,
  checkSessionFn,
  onSettingsSync,
  onAutoLogout,
}) {
  const [warningRemainingSec, setWarningRemainingSec] = useState(null);

  const lastActivityRef = useRef(Date.now());
  const lastHeartbeatSentRef = useRef(0);
  const lastServerCheckRef = useRef(0);
  const warningActiveRef = useRef(false);
  const loggedOutRef = useRef(false);

  const checkSessionFnRef = useRef(checkSessionFn);
  const onSettingsSyncRef = useRef(onSettingsSync);
  const onAutoLogoutRef = useRef(onAutoLogout);

  useEffect(() => {
    checkSessionFnRef.current = checkSessionFn;
  }, [checkSessionFn]);

  useEffect(() => {
    onSettingsSyncRef.current = onSettingsSync;
  }, [onSettingsSync]);

  useEffect(() => {
    onAutoLogoutRef.current = onAutoLogout;
  }, [onAutoLogout]);

  const triggerAutoLogout = useCallback((reason) => {
    if (loggedOutRef.current) return;
    loggedOutRef.current = true;
    warningActiveRef.current = false;
    setWarningRemainingSec(null);
    onAutoLogoutRef.current?.(reason);
  }, []);

  const sendThrottledHeartbeat = useCallback(async (force = false) => {
    if (!enabled || !sessionKey || loggedOutRef.current) return;
    const now = Date.now();
    if (!force && now - lastHeartbeatSentRef.current < 60_000) return;
    lastHeartbeatSentRef.current = now;

    const res = await sendHeartbeatApi(sessionKey);
    if (res?.status === 'unauthorized') {
      triggerAutoLogout(res.reason || 'Sesi berakhir otomatis karena tidak aktif.');
    }
  }, [enabled, sessionKey, triggerAutoLogout]);

  const extendSession = useCallback(async () => {
    if (!enabled || !sessionKey || loggedOutRef.current) return;
    const now = Date.now();
    warningActiveRef.current = false;
    setWarningRemainingSec(null);
    lastActivityRef.current = now;
    try {
      localStorage.setItem(storageKey, String(now));
    } catch {
      // ignore storage quota errors
    }
    await sendThrottledHeartbeat(true);
  }, [enabled, sessionKey, storageKey, sendThrottledHeartbeat]);

  // Initialize activity timestamp when session mounts / changes
  useEffect(() => {
    if (!enabled || !sessionKey) {
      warningActiveRef.current = false;
      setWarningRemainingSec(null);
      loggedOutRef.current = false;
      return;
    }

    loggedOutRef.current = false;
    warningActiveRef.current = false;
    setWarningRemainingSec(null);

    const now = Date.now();
    let storedTs = 0;
    try {
      storedTs = Number(localStorage.getItem(storageKey) || 0);
    } catch {
      storedTs = 0;
    }

    let initialActivity = now;
    if (typeof initialServerIdleMs === 'number' && Number.isFinite(initialServerIdleMs) && initialServerIdleMs >= 0) {
      const serverBasedActivity = now - initialServerIdleMs;
      if (storedTs > serverBasedActivity && now - storedTs < 65_000) {
        initialActivity = storedTs;
      } else {
        initialActivity = serverBasedActivity;
      }
    } else if (storedTs > 0 && storedTs <= now) {
      initialActivity = storedTs;
    }

    lastActivityRef.current = initialActivity;
    lastHeartbeatSentRef.current = now;
    lastServerCheckRef.current = now;

    try {
      localStorage.setItem(storageKey, String(initialActivity));
    } catch {
      // ignore
    }
  }, [enabled, sessionKey, storageKey, initialServerIdleMs]);

  // Listen for real operator interaction & cross-tab activity
  useEffect(() => {
    if (!enabled || !sessionKey) return undefined;

    const handleUserActivity = () => {
      if (loggedOutRef.current || warningActiveRef.current) return;
      const now = Date.now();
      lastActivityRef.current = now;
      try {
        localStorage.setItem(storageKey, String(now));
      } catch {
        // ignore
      }
      sendThrottledHeartbeat(false);
    };

    const handleStorageChange = (event) => {
      if (event.key !== storageKey || !event.newValue) return;
      const nextTs = Number(event.newValue);
      if (Number.isFinite(nextTs) && nextTs > lastActivityRef.current) {
        lastActivityRef.current = nextTs;
        if (warningActiveRef.current) {
          warningActiveRef.current = false;
          setWarningRemainingSec(null);
        }
      }
    };

    for (const evt of USER_ACTIVITY_EVENTS) {
      window.addEventListener(evt, handleUserActivity, { passive: true });
    }
    window.addEventListener('storage', handleStorageChange);

    return () => {
      for (const evt of USER_ACTIVITY_EVENTS) {
        window.removeEventListener(evt, handleUserActivity);
      }
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [enabled, sessionKey, storageKey, sendThrottledHeartbeat]);

  // Periodic idle countdown + server session & settings sync
  useEffect(() => {
    if (!enabled || !sessionKey) return undefined;

    const runServerSync = async () => {
      if (loggedOutRef.current) return;
      lastServerCheckRef.current = Date.now();
      try {
        if (onSettingsSyncRef.current) {
          await onSettingsSyncRef.current();
        }
      } catch {
        // ignore transient settings fetch failure
      }
      if (checkSessionFnRef.current) {
        const res = await checkSessionFnRef.current(sessionKey);
        if (res?.status === 'unauthorized') {
          triggerAutoLogout(res.reason || 'Sesi Anda telah berakhir atau dilepas.');
        }
      }
    };

    const tick = () => {
      if (loggedOutRef.current) return;
      const now = Date.now();

      try {
        const storedTs = Number(localStorage.getItem(storageKey) || 0);
        if (storedTs > lastActivityRef.current && storedTs <= now) {
          lastActivityRef.current = storedTs;
        }
      } catch {
        // ignore
      }

      const timeoutMinutes = Number(idleTimeoutMinutes || 0);
      if (timeoutMinutes > 0) {
        const timeoutMs = timeoutMinutes * 60 * 1000;
        const elapsedMs = Math.max(0, now - lastActivityRef.current);
        const warningSecCfg = Math.max(0, Number(idleWarningSeconds || 0));
        const warningMs = warningSecCfg > 0
          ? Math.min(warningSecCfg * 1000, Math.floor(timeoutMs / 2))
          : 0;

        if (elapsedMs >= timeoutMs) {
          triggerAutoLogout(
            `Sesi berakhir otomatis karena tidak ada aktivitas selama ${timeoutMinutes} menit.`
          );
          return;
        }

        if (warningMs > 0 && elapsedMs >= timeoutMs - warningMs) {
          const remainingSec = Math.max(1, Math.ceil((timeoutMs - elapsedMs) / 1000));
          warningActiveRef.current = true;
          setWarningRemainingSec(remainingSec);
        } else if (warningActiveRef.current) {
          warningActiveRef.current = false;
          setWarningRemainingSec(null);
        }
      } else if (warningActiveRef.current) {
        warningActiveRef.current = false;
        setWarningRemainingSec(null);
      }

      if (now - lastServerCheckRef.current >= 60_000) {
        runServerSync();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tick();
        if (Date.now() - lastServerCheckRef.current >= 15_000) {
          runServerSync();
        }
      }
    };

    const intervalId = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    tick();

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, sessionKey, storageKey, idleTimeoutMinutes, idleWarningSeconds, triggerAutoLogout]);

  return {
    warningRemainingSec,
    extendSession,
  };
}

