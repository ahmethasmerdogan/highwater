/**
 * İkonlar.
 *
 * Tek ızgara: 24 birimlik kutu, 1.6 kalınlık, yuvarlak uç ve birleşim,
 * `currentColor`. Karışık kalınlıkta bir set, yan yana dizildiğinde
 * bazıları soluk bazıları kalın görünür — menüde bu gözle fark edilir.
 *
 * Set bilinçli olarak küçük: kullanılmayan ikon taşınmaz.
 */

import type { SVGProps } from "react";

function Svg({ size = 16, children, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/* ---- Gezinme ------------------------------------------------------- */

export const IPanel = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="4.5" rx="1.5" />
    <rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </Svg>
);

export const IPool = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
    <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
  </Svg>
);

export const IScore = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 17.5 9 11l4 4 8-8.5" />
    <path d="M21 11V6.5h-4.5" />
  </Svg>
);

export const IPulse = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12h4l2.5-6.5 4 13L15.5 12h6" />
  </Svg>
);

export const ILog = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3.5h9l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 20V5a1.5 1.5 0 0 1 1-1.5Z" />
    <path d="M14 3.5V9h5" />
    <path d="M8.5 13.5h7M8.5 17h4.5" />
  </Svg>
);

export const ITerminal = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="19" height="16" rx="2" />
    <path d="m6.5 9.5 3 2.5-3 2.5M13 15h4.5" />
  </Svg>
);

export const IBot = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="7.5" width="16" height="12" rx="3" />
    <path d="M12 7.5V4M8.5 13v1.5M15.5 13v1.5" />
    <circle cx="12" cy="3" r="1.2" />
  </Svg>
);

export const IPosition = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <path d="M3 8.5 6.5 4h11L21 8.5" />
    <path d="M16.5 13.5h1.5" />
  </Svg>
);

export const IStrategy = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z" />
    <path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" />
  </Svg>
);

export const IBacktest = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15 9-4.2 1.8L9 15l4.2-1.8L15 9Z" />
  </Svg>
);

export const IIndicator = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 21V9M12 21V4M19 21v-7" />
  </Svg>
);

export const IChat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.5 12.5c0 4-3.8 7-8.5 7-1.1 0-2.2-.17-3.2-.48L3.5 21l1.6-4A7.2 7.2 0 0 1 3.5 12.5c0-4 3.8-7 8.5-7s8.5 3 8.5 7Z" />
  </Svg>
);

export const IBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9Z" />
    <path d="M13.7 19a2 2 0 0 1-3.4 0" />
  </Svg>
);

export const IUsers = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9.5" cy="8" r="3.5" />
    <path d="M3 20c0-3.3 2.9-5.5 6.5-5.5S16 16.7 16 20" />
    <path d="M16.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c2 .8 3.5 2.6 3.5 5.2" />
  </Svg>
);

export const IPlug = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 3 5.5 13H11l-1 8 8-10.5H12.5L13 3Z" />
  </Svg>
);

export const ISettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
  </Svg>
);

export const ITarget = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" />
  </Svg>
);

/* ---- Kabuk --------------------------------------------------------- */

export const ISearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
  </Svg>
);

export const IChevron = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);

export const ICaret = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 9 7 7 7-7" />
  </Svg>
);

export const IClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const ISun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
  </Svg>
);

export const IMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z" />
  </Svg>
);

export const IScreen = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8.5 21h7M12 17v4" />
  </Svg>
);

export const IInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.8v.4" />
  </Svg>
);

export const IWarn = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.8 21 19H3l9-15.2Z" />
    <path d="M12 10v4M12 16.8v.3" />
  </Svg>
);

export const ILogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14" />
    <path d="M17 8.5 20.5 12 17 15.5M20.5 12H10" />
  </Svg>
);
