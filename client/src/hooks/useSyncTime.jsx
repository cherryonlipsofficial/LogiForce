import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useSyncTime() {
  const [lastSynced, setLastSynced] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.type === 'updated' && event?.query?.state?.status === 'success') {
        setLastSynced(new Date());
      }
    });
    return () => unsubscribe();
  }, [queryClient]);

  // Re-render periodically so "Xm ago" updates
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(interval);
  }, []);

  return lastSynced;
}
