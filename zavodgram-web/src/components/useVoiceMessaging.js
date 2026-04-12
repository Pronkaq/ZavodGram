import { useCallback, useEffect } from 'react';

export function useVoiceMessaging({
  activeChat,
  acd,
  userId,
  voiceRecording,
  transcriptionLoading,
  transcriptionAvailable,
  mediaRecorderRef,
  mediaStreamRef,
  voiceChunksRef,
  setVoiceRecorderState,
  setRecordingNowTs,
  setVoiceRecording,
  setTranscriptionLoading,
  setTranscriptions,
  setTranscriptionAvailable,
  mediaApi,
  messagesApi,
  loadMessages,
  loadChats,
}) {
  useEffect(() => {
    if (!voiceRecording) return undefined;
    const timer = setInterval(() => setRecordingNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [voiceRecording, setRecordingNowTs]);

  const handleVoiceRecordToggle = useCallback(async () => {
    if (!activeChat) return;
    const roleInChat = acd?.myRole || acd?.members?.find(m => m.userId === userId)?.role || 'MEMBER';
    if (acd?.type === 'CHANNEL' && !['OWNER', 'ADMIN'].includes(roleInChat)) return;

    if (voiceRecording) {
      mediaRecorderRef.current?.stop?.();
      return;
    }

    try {
      if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setVoiceRecorderState({ startedAt: 0, error: 'Запись голоса не поддерживается в этом браузере' });
        return;
      }
      setVoiceRecorderState({ startedAt: 0, error: '' });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const isAppleDevice = /iPad|iPhone|iPod|Macintosh/i.test(navigator.userAgent || '');
      const mimeTypes = [
        ...(isAppleDevice ? ['audio/mp4'] : []),
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/webm',
      ];
      const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      voiceChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        setVoiceRecording(false);
        mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
        mediaStreamRef.current = null;

        const chunks = voiceChunksRef.current;
        voiceChunksRef.current = [];
        if (!chunks.length || !activeChat) {
          if (!chunks.length) {
            setVoiceRecorderState({ startedAt: 0, error: 'Не удалось записать аудио. Попробуйте ещё раз' });
          }
          return;
        }

        try {
          const audioType = chunks[0]?.type || 'audio/webm';
          const ext = audioType.includes('ogg')
            ? 'ogg'
            : audioType.includes('mpeg')
              ? 'mp3'
              : audioType.includes('mp4')
                ? 'm4a'
                : 'webm';
          const voiceFile = new File(chunks, `voice-${Date.now()}.${ext}`, { type: audioType });
          const media = await mediaApi.upload(voiceFile);
          await messagesApi.send(activeChat, { mediaIds: [media.id] });
          await loadMessages(activeChat);
          await loadChats();
        } catch (err) {
          console.error('Voice upload failed', err);
          setVoiceRecorderState({ startedAt: 0, error: 'Не удалось отправить голосовое сообщение' });
        }
      };

      recorder.start(1000);
      setVoiceRecorderState({ startedAt: Date.now(), error: '' });
      setRecordingNowTs(Date.now());
      setVoiceRecording(true);
    } catch (err) {
      console.error('Voice recording failed', err);
      const errorText = err?.name === 'NotFoundError'
        ? 'Микрофон не найден. Подключите устройство ввода и попробуйте снова'
        : err?.name === 'NotAllowedError'
          ? 'Нет доступа к микрофону. Разрешите доступ в браузере'
          : 'Не удалось получить доступ к микрофону';
      setVoiceRecorderState({ startedAt: 0, error: errorText });
      setVoiceRecording(false);
    }
  }, [activeChat, acd, userId, voiceRecording, mediaRecorderRef, setVoiceRecorderState, mediaStreamRef, voiceChunksRef, setVoiceRecording, mediaApi, messagesApi, loadMessages, loadChats, setRecordingNowTs]);

  const handleTranscribe = useCallback(async (mediaId) => {
    if (!mediaId || transcriptionLoading[mediaId] || !transcriptionAvailable) return;
    setTranscriptionLoading((prev) => ({ ...prev, [mediaId]: true }));
    try {
      const result = await mediaApi.transcribe(mediaId);
      setTranscriptions((prev) => ({ ...prev, [mediaId]: result.text || '' }));
    } catch (err) {
      const message = err?.message || 'Не удалось получить расшифровку';
      if (message.toLowerCase().includes('не настроен провайдер')) {
        setTranscriptionAvailable(false);
      }
      setTranscriptions((prev) => ({ ...prev, [mediaId]: message }));
    } finally {
      setTranscriptionLoading((prev) => ({ ...prev, [mediaId]: false }));
    }
  }, [transcriptionLoading, transcriptionAvailable, setTranscriptionLoading, mediaApi, setTranscriptions, setTranscriptionAvailable]);

  return {
    handleVoiceRecordToggle,
    handleTranscribe,
  };
}
