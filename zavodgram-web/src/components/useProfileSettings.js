import { useCallback } from 'react';

export function useProfileSettings({
  user,
  usersApi,
  mediaApi,
  updateUser,
  nameEdit,
  bioEdit,
  tagEdit,
  setProfileData,
  setSettingsMode,
  setSettingsSubpage,
  setProfilePanel,
  setSettingsSaveState,
}) {
  const openProfile = useCallback(async (userId) => {
    if (userId === user.id) { setProfileData({ ...user, online: true }); }
    else { try { const data = await usersApi.getById(userId); setProfileData(data); } catch {} }
    setSettingsMode(false);
    setSettingsSubpage(null);
    setProfilePanel(userId);
  }, [user, usersApi, setProfileData, setSettingsMode, setSettingsSubpage, setProfilePanel]);

  const saveProfileCard = useCallback(async () => {
    const cleanName = nameEdit?.trim();
    const cleanBio = bioEdit?.trim();
    const cleanTag = (tagEdit?.trim() || user.tag || '').replace(/^@?/, '@');
    if (!cleanName) {
      setSettingsSaveState({ loading: false, error: 'Имя не может быть пустым', ok: '' });
      return;
    }
    setSettingsSaveState({ loading: true, error: '', ok: '' });
    try {
      await usersApi.update({ name: cleanName, bio: cleanBio });
      if (cleanTag && cleanTag !== user.tag) await usersApi.updateTag(cleanTag);
      updateUser({ name: cleanName, bio: cleanBio, tag: cleanTag });
      setProfileData((prev) => (prev ? { ...prev, name: cleanName, bio: cleanBio, tag: cleanTag } : prev));
      setSettingsSaveState({ loading: false, error: '', ok: 'Сохранено' });
    } catch (err) {
      setSettingsSaveState({ loading: false, error: err.message || 'Не удалось сохранить', ok: '' });
    }
  }, [nameEdit, bioEdit, tagEdit, user.tag, setSettingsSaveState, usersApi, updateUser, setProfileData]);

  const handleAvatarUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const media = await mediaApi.upload(file);
      const avatarRef = `media:${media.id}`;
      await usersApi.update({ avatar: avatarRef });
      updateUser({ avatar: avatarRef });
      setProfileData(p => ({ ...p, avatar: avatarRef }));
    } catch (err) { console.error(err); }
  }, [mediaApi, usersApi, updateUser, setProfileData]);

  return {
    openProfile,
    saveProfileCard,
    handleAvatarUpload,
  };
}
