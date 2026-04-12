# Декомпозиция `ChatApp.jsx`

## Почему сейчас уже пора делить

- Компонент `ChatApp.jsx` содержит **2292 строки** и одновременно держит в себе UI, сетевые сценарии, модальные окна, работу с медиа, голосом, топиками и комментариями.
- В компоненте объявлено **67 локальных `useState`**, что делает сопровождение, регрессионное тестирование и локализацию багов заметно сложнее.

## Цели декомпозиции

1. Сократить размер корневого контейнера до 250–400 строк.
2. Выделить независимые функциональные зоны в подпакеты с понятными границами.
3. Упростить покрытие unit/integration тестами за счёт более мелких компонентов и хуков.
4. Сохранить текущее поведение без функциональных изменений на первом этапе (refactor-only).

## Предлагаемая модульная структура

```text
src/components/chat-app/
  ChatAppShell.jsx                 // оркестратор, компоновка панелей
  hooks/
    useChatComposer.js             // ввод, rich-text, reply/edit/forward
    useChatSearch.js               // поиск по чатам/сообщениям
    useChatVoiceRecorder.js        // запись voice + таймер + ошибки
    useChatTopics.js               // загрузка и выбор топиков
    useChatMediaPicker.js          // pending media / attach menu / preview
  panels/
    ChatMainPanel.jsx              // список сообщений + инпут
    ChatRightPanel.jsx             // профиль, уведомления, настройки
    ChatLeftPanel.jsx              // список чатов и навигация
  modals/
    NewChatModal.jsx
    GroupSettingsModal.jsx
    ChannelManageModal.jsx
    AttachmentsModal.jsx
    PostCommentsModal.jsx
  message/
    MessageList.jsx
    MessageItem.jsx
    MessageContextMenu.jsx
    MessageReactions.jsx
  composer/
    Composer.jsx
    ComposerToolbar.jsx
    ComposerAttachments.jsx
```

## Декомпозиция по доменам состояния

### 1) Composer domain
Сюда уходит всё, что связано с:
- `input`, `editingMsg`, `replyTo`, `forwardMsg`;
- форматированием (`sanitizeRichHtml`, toolbar);
- отправкой и редактированием сообщений;
- attach/voice entry-point (как минимум интерфейсно).

**Артефакт:** `useChatComposer` + `Composer`.

### 2) Chat navigation domain
- `search`, `filteredChats`, выбор активного чата;
- mobile/desktop режимы отображения панелей;
- базовые действия в списке чатов.

**Артефакт:** `useChatNavigation` (или часть `useChatSearch`) + `ChatLeftPanel`.

### 3) Message timeline domain
- виртуализация (`Virtuoso`) и скролл-пагинация;
- `searchResults`, переходы по найденным сообщениям;
- контекстное меню и реакция на элементы сообщения.

**Артефакт:** `MessageList` + `useMessageTimeline`.

### 4) Media & voice domain
- загрузка файлов, preview, media modal;
- voice recording lifecycle (`MediaRecorder`, stream cleanup);
- транскрипции и состояния загрузки.

**Артефакт:** `useChatMediaPicker`, `useChatVoiceRecorder`, `AttachmentsModal`.

### 5) Group/Channel management domain
- управление группой/каналом, участниками, банами;
- slug/errors/comments-enabled;
- модалки администрирования.

**Артефакт:** `useGroupAdmin`, `useChannelAdmin`, соответствующие modal-компоненты.

## Поэтапный план рефакторинга (безболезненный)

### Этап 1 — безопасный каркас
- Вынести только JSX-каркас в `ChatAppShell` + `ChatMainPanel`/`ChatLeftPanel`/`ChatRightPanel`.
- Пробросить текущие пропсы без изменения бизнес-логики.

### Этап 2 — Composer
- Вынести composer-state и обработчики в `useChatComposer`.
- Сделать `Composer` «контролируемым» компонентом.

### Этап 3 — Timeline
- Вынести `MessageList` и scroll/virtualization логику в `useMessageTimeline`.
- Отдельно зафиксировать контракт на `loadMoreMessages` и topic-aware загрузку.

### Этап 4 — Modals и admin flows
- Каждую большую модалку вынести в отдельный компонент и локальный хук.
- Свести root к оркестрации и открытию/закрытию.

### Этап 5 — Медиа/голос
- Инкапсулировать `MediaRecorder` и очистку треков в `useChatVoiceRecorder`.
- Инкапсулировать pending media и upload/send в `useChatMediaPicker`.

## Прогресс (обновлено: 2026-04-12)

- Вынесена доменная логика комментариев к постам канала в отдельный хук `usePostCommentsFlow`:
  - построение дерева комментариев (`getPostComments`);
  - открытие модалки комментариев и сброс черновиков;
  - отправка комментария и модерация (delete/mute/unmute).
- Вынесена агрегация медиа/ссылок для канала в `useChannelAttachments`, чтобы убрать вычислительный код из корневого компонента.
- `ChatApp.jsx` после шага остаётся оркестратором, а не местом хранения доменной логики комментариев/вложений.
- Вынесена реакция на сообщения в `useMessageReactions`:
  - набор доступных эмодзи;
  - отправка реакции через websocket;
  - группировка реакций и управление координатами reaction picker.
- Вынесен рендер текста сообщения в `useMessageTextRenderer`:
  - sanitize rich text;
  - fallback в plain text + распознавание URL;
  - подсветка совпадений при поиске по сообщениям.

## Критерии готовности

- `ChatApp.jsx` <= 400 строк.
- Ни один дочерний компонент > 300–350 строк.
- Минимум smoke-тесты на:
  - отправку/редактирование сообщения;
  - пагинацию при прокрутке;
  - запись и отправку voice;
  - создание/редактирование группы или канала.

## Риски

- Нарушение связей между `activeChat`, `activeTopicId` и ключом `messages`.
- Потеря фокуса/каретки в rich-text composer после выноса.
- Неявные зависимости модалок от глобального состояния.

## Как снизить риски

- Сначала вынести pure-UI с сохранением текущих callback-ов.
- На каждый этап иметь чек-лист ручной регрессии.
- Подключить временные логгеры на critical user actions (send/edit/delete/loadMore).
