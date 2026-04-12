import { useMemo } from 'react';
import { richTextToPlain } from './chatRichText';

export function useComposerSendState({ input, pendingMedia }) {
  return useMemo(() => {
    const hasText = Boolean(richTextToPlain(input));
    const hasMedia = pendingMedia.length > 0;
    const canSend = hasText || hasMedia;
    return {
      canSend,
      sendButtonOpacity: canSend ? 1 : 0.3,
    };
  }, [input, pendingMedia]);
}
