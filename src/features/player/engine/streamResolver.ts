import { resolveDirectAudioStream, toVideoId } from "@/shared/media/innertube";
import { getCapabilities } from "@/shared/platform";
import { resolveSoundCloudStream, toSoundCloudTrackId } from "@/shared/media/soundcloud";
import { isAbortError } from "@/shared/utils/abort";
import { log } from "@/shared/utils/logger";
import {
  fromInnertubeStream,
  fromSoundCloudStream,
  type PlayableTrack,
  type PlaybackStream,
} from "./playbackStream";
import { findYoutubeStandIn } from "./youtubeStandIn";

export type { BufferedPlaybackStream, PlayableTrack, PlaybackStream, UrlPlaybackStream } from "./playbackStream";

// iOS can't decode Opus/WebM in <audio>, so it asks for AAC (itag 140)
async function resolveYoutube(videoId: string, signal?: AbortSignal): Promise<PlaybackStream> {
  const { preferredCodec } = getCapabilities();
  return fromInnertubeStream(await resolveDirectAudioStream(videoId, { signal, preferredCodec }));
}

async function resolveYoutubeStandIn(track: PlayableTrack, signal?: AbortSignal): Promise<PlaybackStream> {
  const videoId = await findYoutubeStandIn(track, signal);
  if (!videoId) throw new Error("No matching YouTube track found");
  log("cyan", "playback", `playing youtube stand-in ${videoId} for "${track.title}"`);
  return resolveYoutube(videoId, signal);
}

async function resolveSoundCloud(track: PlayableTrack, signal?: AbortSignal): Promise<PlaybackStream> {
  try {
    return fromSoundCloudStream(await resolveSoundCloudStream(track.id, { signal }));
  } catch (soundCloudError) {
    if (isAbortError(soundCloudError, signal)) throw soundCloudError;
    log("yellow", "playback", `soundcloud resolution failed, searching youtube: ${String(soundCloudError)}`);
    try {
      return await resolveYoutubeStandIn(track, signal);
    } catch (standInError) {
      if (isAbortError(standInError, signal)) throw standInError;
      throw soundCloudError;
    }
  }
}

export async function resolvePlaybackStream(track: PlayableTrack, signal?: AbortSignal): Promise<PlaybackStream> {
  if (toSoundCloudTrackId(track.id)) return resolveSoundCloud(track, signal);
  if (toVideoId(track.id)) return resolveYoutube(track.id, signal);
  return resolveYoutubeStandIn(track, signal);
}
