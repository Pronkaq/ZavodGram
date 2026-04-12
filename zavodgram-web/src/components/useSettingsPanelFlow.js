import { useCallback } from 'react';

export function useSettingsPanelFlow({
  user,
  setSidebarOpen,
  setNotifPanel,
  setSettingsMode,
  setSettingsSubpage,
  setTagEdit,
  setNameEdit,
  setBioEdit,
  setSettingsSaveState,
  setProfileData,
  setProfilePanel,
}) {
  const openSettingsPanel = useCallback(() => {
    setSidebarOpen(false);
    setNotifPanel(false);
    setSettingsMode(true);
    setSettingsSubpage(null);
    setTagEdit(user.tag || '');
    setNameEdit(user.name || '');
    setBioEdit(user.bio || '');
    setSettingsSaveState({ loading: false, error: '', ok: '' });
    setProfileData({ ...user, online: true });
    setProfilePanel(user.id);
  }, [
    user,
    setSidebarOpen,
    setNotifPanel,
    setSettingsMode,
    setSettingsSubpage,
    setTagEdit,
    setNameEdit,
    setBioEdit,
    setSettingsSaveState,
    setProfileData,
    setProfilePanel,
  ]);

  const openSettingsSubpage = useCallback((subpage) => {
    setSettingsSaveState({ loading: false, error: '', ok: '' });
    setSettingsSubpage(subpage);
  }, [setSettingsSaveState, setSettingsSubpage]);

  return {
    openSettingsPanel,
    openSettingsSubpage,
  };
}
