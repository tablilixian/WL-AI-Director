import { useCallback } from 'react';
import {
  splitAtPlayhead as _splitAtPlayhead,
  splitClipAt as _splitClipAt,
} from '../lib/timelineSplit';

export function useTimelineSplit() {
  const splitAtPlayhead = useCallback(() => _splitAtPlayhead(), []);
  const splitClipAt = useCallback((clipId: string, splitTime: number) => _splitClipAt(clipId, splitTime), []);

  return { splitAtPlayhead, splitClipAt };
}
