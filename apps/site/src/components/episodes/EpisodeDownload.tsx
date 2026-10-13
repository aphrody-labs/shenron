// SPDX-License-Identifier: Apache-2.0
interface EpisodeDownloadProps {
  href: string;
  signinCallback: string;
  title: string;
  className?: string;
}

/** Download controls stay hidden until an explicit publication grant is modeled. */
export function EpisodeDownload(_props: EpisodeDownloadProps) {
  return null;
}
