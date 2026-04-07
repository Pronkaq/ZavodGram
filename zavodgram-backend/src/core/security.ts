import { MemberRole, PrismaClient } from '@prisma/client';
import { ForbiddenError, NotFoundError, ValidationError } from './errors';

export async function requireChatMembership(prisma: PrismaClient, chatId: string, userId: string) {
  const membership = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });

  if (!membership) {
    throw new ForbiddenError('Нет доступа к чату');
  }

  return membership;
}

export async function requireChatRole(
  prisma: PrismaClient,
  chatId: string,
  userId: string,
  allowedRoles: MemberRole[]
) {
  const membership = await requireChatMembership(prisma, chatId, userId);
  if (!allowedRoles.includes(membership.role)) {
    throw new ForbiddenError('Недостаточно прав для действия');
  }
  return membership;
}

export async function requireMessageInChat(
  prisma: PrismaClient,
  messageId: string,
  chatId: string,
  includeDeleted = false
) {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || (!includeDeleted && message.deleted)) {
    throw new NotFoundError('Сообщение');
  }
  if (message.chatId !== chatId) {
    throw new ForbiddenError('Сообщение принадлежит другому чату');
  }
  return message;
}

export function ensureUuidArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);

  const deduplicated = Array.from(new Set(normalized));
  if (deduplicated.length !== normalized.length) {
    throw new ValidationError(`${fieldName}: обнаружены дубли`);
  }

  return deduplicated;
}
