function haptic() {
  return window.Telegram?.WebApp?.HapticFeedback ?? null;
}

export const haptics = {
  light:    () => haptic()?.impactOccurred('light'),
  medium:   () => haptic()?.impactOccurred('medium'),
  heavy:    () => haptic()?.impactOccurred('heavy'),
  success:  () => haptic()?.notificationOccurred('success'),
  error:    () => haptic()?.notificationOccurred('error'),
  select:   () => haptic()?.selectionChanged(),
};
