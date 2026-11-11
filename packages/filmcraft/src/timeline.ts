// SPDX-License-Identifier: Apache-2.0

export type TrackType = "video" | "audio" | "subtitle" | "overlay";

export interface ClipTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface FilmClip {
  id: string;
  name: string;
  trackId: string;
  sourceUrl: string;
  startFrame: number;
  durationFrames: number;
  sourceInFrame: number;
  sourceOutFrame: number;
  speed: number;
  volume: number;
  opacity: number;
  transform: ClipTransform;
}

export interface FilmTrack {
  id: string;
  name: string;
  type: TrackType;
  muted: boolean;
  locked: boolean;
  order: number;
  clips: FilmClip[];
}

export interface FilmProject {
  id: string;
  title: string;
  fps: number;
  width: number;
  height: number;
  durationFrames: number;
  playheadFrame: number;
  tracks: FilmTrack[];
  metadata: Record<string, unknown>;
}

export interface CreateProjectOptions {
  id?: string;
  title?: string;
  fps?: number;
  width?: number;
  height?: number;
  durationFrames?: number;
  metadata?: Record<string, unknown>;
}

export function createFilmProject(options: CreateProjectOptions = {}): FilmProject {
  return {
    id: options.id ?? `fc-${Date.now()}`,
    title: options.title ?? "Dragon Ball FilmCraft Sequence",
    fps: options.fps ?? 24,
    width: options.width ?? 1920,
    height: options.height ?? 1080,
    durationFrames: options.durationFrames ?? 24 * 60 * 20, // 20 minutes default
    playheadFrame: 0,
    tracks: [
      {
        id: "v1",
        name: "Video 1",
        type: "video",
        muted: false,
        locked: false,
        order: 0,
        clips: [],
      },
      {
        id: "v2",
        name: "Overlay / VFX",
        type: "overlay",
        muted: false,
        locked: false,
        order: 1,
        clips: [],
      },
      {
        id: "a1",
        name: "Audio Master",
        type: "audio",
        muted: false,
        locked: false,
        order: 2,
        clips: [],
      },
      {
        id: "sub1",
        name: "Subtitles",
        type: "subtitle",
        muted: false,
        locked: false,
        order: 3,
        clips: [],
      },
    ],
    metadata: options.metadata ?? {},
  };
}

export function addFilmTrack(project: FilmProject, track: Omit<FilmTrack, "clips">): FilmTrack {
  const newTrack: FilmTrack = {
    ...track,
    clips: [],
  };
  project.tracks.push(newTrack);
  project.tracks.sort((a, b) => a.order - b.order);
  return newTrack;
}

export function addFilmClip(
  project: FilmProject,
  clip: Omit<FilmClip, "id"> & { id?: string },
): FilmClip {
  const targetTrack = project.tracks.find((t) => t.id === clip.trackId);
  if (!targetTrack) {
    throw new Error(`Track with id ${clip.trackId} not found in project`);
  }
  const id = clip.id ?? `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const fullClip: FilmClip = {
    ...clip,
    id,
    transform: clip.transform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
  };
  targetTrack.clips.push(fullClip);
  targetTrack.clips.sort((a, b) => a.startFrame - b.startFrame);
  return fullClip;
}

export function razorFilmClip(
  project: FilmProject,
  clipId: string,
  cutFrame: number,
): [FilmClip, FilmClip] {
  for (const track of project.tracks) {
    const clipIndex = track.clips.findIndex((c) => c.id === clipId);
    if (clipIndex === -1) continue;

    const clip = track.clips[clipIndex];
    if (cutFrame <= clip.startFrame || cutFrame >= clip.startFrame + clip.durationFrames) {
      throw new Error(
        `Cut frame ${cutFrame} is outside clip bounds [${clip.startFrame}, ${clip.startFrame + clip.durationFrames}]`,
      );
    }

    const firstDuration = cutFrame - clip.startFrame;
    const secondDuration = clip.durationFrames - firstDuration;
    const firstSourceDuration = Math.round(firstDuration * clip.speed);

    const firstClip: FilmClip = {
      ...clip,
      durationFrames: firstDuration,
      sourceOutFrame: clip.sourceInFrame + firstSourceDuration,
    };

    const secondClip: FilmClip = {
      ...clip,
      id: `${clip.id}-cut-${cutFrame}`,
      startFrame: cutFrame,
      durationFrames: secondDuration,
      sourceInFrame: clip.sourceInFrame + firstSourceDuration,
    };

    track.clips.splice(clipIndex, 1, firstClip, secondClip);
    return [firstClip, secondClip];
  }

  throw new Error(`Clip ${clipId} not found in any track`);
}

export function cutFilmClip(project: FilmProject, clipId: string, ripple = false): FilmClip {
  for (const track of project.tracks) {
    const clipIndex = track.clips.findIndex((c) => c.id === clipId);
    if (clipIndex === -1) continue;

    const [removedClip] = track.clips.splice(clipIndex, 1);
    if (ripple) {
      for (let i = clipIndex; i < track.clips.length; i++) {
        track.clips[i].startFrame -= removedClip.durationFrames;
      }
    }
    return removedClip;
  }
  throw new Error(`Clip ${clipId} not found in project`);
}

export function spliceFilmClip(
  project: FilmProject,
  trackId: string,
  clip: FilmClip,
  atFrame: number,
): void {
  const track = project.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`Track ${trackId} not found`);

  // Ripple shift all existing clips starting at or after atFrame
  for (const existing of track.clips) {
    if (existing.startFrame >= atFrame) {
      existing.startFrame += clip.durationFrames;
    }
  }

  clip.trackId = trackId;
  clip.startFrame = atFrame;
  track.clips.push(clip);
  track.clips.sort((a, b) => a.startFrame - b.startFrame);
}

export function getClipsAtFrame(project: FilmProject, frame: number): FilmClip[] {
  const active: FilmClip[] = [];
  for (const track of project.tracks) {
    if (track.muted) continue;
    for (const clip of track.clips) {
      if (frame >= clip.startFrame && frame < clip.startFrame + clip.durationFrames) {
        active.push(clip);
      }
    }
  }
  return active;
}

export function serializeFilmProject(project: FilmProject): string {
  return JSON.stringify(project, null, 2);
}

export function deserializeFilmProject(json: string): FilmProject {
  return JSON.parse(json) as FilmProject;
}
