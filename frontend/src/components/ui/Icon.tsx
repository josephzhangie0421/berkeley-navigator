import type { SVGProps } from "react";

const PATHS = {
  send: "M4 12l16-8-6 16-2.5-6.5L4 12z",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5",
  thumbUp: "M7 11v9H4v-9h3zm0 0l4-7a2 2 0 012 2v4h5a2 2 0 012 2.3l-1.2 6A2 2 0 0116.8 20H7",
  thumbDown: "M7 13V4H4v9h3zm0 0l4 7a2 2 0 002-2v-4h5a2 2 0 002-2.3l-1.2-6A2 2 0 0016.8 4H7",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
  info: "M12 8h.01M11 12h1v5h1M12 3a9 9 0 110 18 9 9 0 010-18z",
  close: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-4", ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
