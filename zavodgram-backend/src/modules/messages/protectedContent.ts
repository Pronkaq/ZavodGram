export const PROTECTED_MESSAGE_PLACEHOLDER = 'Сообщение недоступно: отправлено во время safe mode.';

type ChatType = 'PRIVATE' | 'SECRET' | 'GROUP' | 'CHANNEL' | string;

function isDirectChat(chatType?: ChatType) {
  return chatType === 'PRIVATE' || chatType === 'SECRET';
}

export function isSafeModeActiveForChat(chatType?: ChatType, contentProtectionEnabled?: boolean) {
  return !!contentProtectionEnabled && isDirectChat(chatType);
}

export function isSnapshotProtectedLocked(
  protectedBySafeMode?: boolean,
  chatType?: ChatType,
  contentProtectionEnabled?: boolean
) {
  if (!protectedBySafeMode) return false;
  return !isSafeModeActiveForChat(chatType, contentProtectionEnabled);
}

export function sanitizeMessageForClient<T extends Record<string, any>>(
  message: T,
  options: { chatType?: ChatType; contentProtectionEnabled?: boolean }
): T {
  const locked = isSnapshotProtectedLocked(message?.protectedBySafeMode, options.chatType, options.contentProtectionEnabled);
  const sanitizeReply = (reply: any) => {
    if (!reply) return reply;
    const replyLocked = isSnapshotProtectedLocked(reply?.protectedBySafeMode, options.chatType, options.contentProtectionEnabled);
    return replyLocked
      ? {
          ...reply,
          text: PROTECTED_MESSAGE_PLACEHOLDER,
        }
      : reply;
  };

  if (!locked) {
    if (!message?.replyTo) return message;
    return {
      ...message,
      replyTo: sanitizeReply(message.replyTo),
    };
  }

  const mediaValue = Array.isArray(message.media) ? [] : message.media;
  const nextCount = message?._count?.media !== undefined
    ? { ...message._count, media: 0 }
    : message?._count;

  return {
    ...message,
    text: PROTECTED_MESSAGE_PLACEHOLDER,
    media: mediaValue,
    forwardedFromId: null,
    forwardedFromName: null,
    _count: nextCount,
    replyTo: sanitizeReply(message.replyTo),
  };
}

export function buildMessagePreview(
  message: { text?: string | null; hasMedia?: boolean; media?: unknown[]; protectedBySafeMode?: boolean },
  options: { chatType?: ChatType; contentProtectionEnabled?: boolean }
) {
  if (!message) return '';
  if (isSnapshotProtectedLocked(message.protectedBySafeMode, options.chatType, options.contentProtectionEnabled)) {
    return PROTECTED_MESSAGE_PLACEHOLDER;
  }
  if (message.text) return message.text;
  const mediaCount = Array.isArray(message.media) ? message.media.length : (message.hasMedia ? 1 : 0);
  return mediaCount > 0 ? '[медиа]' : '';
}
