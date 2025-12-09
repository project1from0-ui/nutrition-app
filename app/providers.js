// app/providers.js
'use client';
import { useEffect, useState } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';

export function PHProvider({ children }) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Only initialize PostHog on the client side
    if (typeof window !== 'undefined' && !posthog.__loaded) {
      const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
      const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

      if (key && host) {
        posthog.init(key, {
          api_host: host,
          person_profiles: 'identified_only',
          capture_pageview: false,
          loaded: (posthog) => {
            setIsInitialized(true);
          }
        });
      } else {
        console.warn('PostHog environment variables not configured');
        setIsInitialized(true); // Still mark as initialized to render children
      }
    } else {
      setIsInitialized(true);
    }
  }, []);

  if (!isInitialized) {
    return <>{children}</>;
  }

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}