import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...');

  const password = await bcrypt.hash('123456', 12);

  // Создаём пользователей
  const users = await Promise.all([
    prisma.user.upsert({
      where: { tag: '@ivan_z' },
      update: {},
      create: { phone: '+79001234567', tag: '@ivan_z', name: 'Иван Заводов', bio: 'Full-stack разработчик. Строю ZavodGram.', password },
    }),
    prisma.user.upsert({
      where: { tag: '@alexey_p' },
      update: {},
      create: { phone: '+79002345678', tag: '@alexey_p', name: 'Алексей Петров', bio: 'Backend-разработчик. Go и Rust.', password },
    }),
    prisma.user.upsert({
      where: { tag: '@mashka_k' },
      update: {},
      create: { phone: '+79003456789', tag: '@mashka_k', name: 'Мария Козлова', bio: 'UI/UX дизайнер.', password },
    }),
    prisma.user.upsert({
      where: { tag: '@igor_dev' },
      update: {},
      create: { phone: '+79004567890', tag: '@igor_dev', name: 'Игорь Васильев', bio: 'DevOps инженер.', password },
    }),
    prisma.user.upsert({
      where: { tag: '@annabel' },
      update: {},
      create: { phone: '+79005678901', tag: '@annabel', name: 'Анна Белова', bio: 'QA Lead.', password },
    }),
  ]);

  // Бронируем теги
  for (const user of users) {
    await prisma.tagHistory.upsert({
      where: { tag: user.tag },
      update: {},
      create: { tag: user.tag, userId: user.id },
    });
  }

  // Создаём приватный чат
  const privateChat = await prisma.chat.create({
    data: {
      type: 'PRIVATE',
      createdBy: users[0].id,
      members: {
        createMany: {
          data: [
            { userId: users[0].id, role: 'OWNER' },
            { userId: users[1].id, role: 'MEMBER' },
          ],
        },
      },
    },
  });

  // Создаём группу
  const groupChat = await prisma.chat.create({
    data: {
      type: 'GROUP',
      name: 'Команда разработки',
      description: 'Основной чат команды',
      createdBy: users[0].id,
      members: {
        createMany: {
          data: users.map((u, i) => ({ userId: u.id, role: i === 0 ? 'OWNER' as const : 'MEMBER' as const })),
        },
      },
    },
  });

  // Добавляем сообщения
  await prisma.message.createMany({
    data: [
      { chatId: privateChat.id, fromId: users[1].id, text: 'Привет! Как дела с проектом?' },
      { chatId: privateChat.id, fromId: users[0].id, text: 'Привет! Всё по плану, заканчиваю модуль авторизации' },
      { chatId: privateChat.id, fromId: users[1].id, text: 'Давай обсудим проект завтра' },
      { chatId: groupChat.id, fromId: users[3].id, text: 'Ребят, я запушил фикс для бага #342' },
      { chatId: groupChat.id, fromId: users[4].id, text: 'Проверила — работает, одобряю ✅' },
      { chatId: groupChat.id, fromId: users[0].id, text: 'Супер, мержим в main?' },
      { chatId: groupChat.id, fromId: users[3].id, text: 'Мерж прошёл успешно 🚀' },
    ],
  });

  console.log(`✅ Seeded: ${users.length} users, 2 chats, 7 messages`);
  console.log(`\n📱 Логин для тестов:`);
  console.log(`   Телефон: +79001234567`);
  console.log(`   Пароль:  123456\n`);
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
