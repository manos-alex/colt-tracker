export {};

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          height?: string;
          videoId: string;
          width?: string;
          playerVars?: Record<string, number>;
          events?: {
            onReady?: () => void;
          };
        },
      ) => YouTubePlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }

  type YouTubePlayer = {
    getCurrentTime: () => number;
    seekTo: (seconds: number, allowSeekAhead: boolean) => void;
    pauseVideo: () => void;
    destroy: () => void;
  };
}
