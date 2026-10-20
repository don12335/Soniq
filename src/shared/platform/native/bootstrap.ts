import { installNativeFetch } from "./nativeFetch";
import { initNativeChrome } from "./chrome";

// Runs before anything else touches the network on iOS/Android builds.
export async function bootstrapNative(): Promise<void> {
  installNativeFetch();
  await initNativeChrome();
}
