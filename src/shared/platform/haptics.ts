import { isNative } from "./platform";

// Light tap feedback on native shells; a no-op elsewhere. Loaded lazily so desktop never pulls in the plugin.
export function tapHaptic(): void {
  if (!isNative()) return;
  void import("@capacitor/haptics")
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
    .catch(() => {
      // haptics unavailable
    });
}
