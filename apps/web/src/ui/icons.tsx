import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

/* ---- strokes ---- */
export const ISearch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20.2 20.2-3.4-3.4" />
  </svg>
);
export const IPlus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IX = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const ICheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const IChevronDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 9.5 6 6 6-6" />
  </svg>
);
export const IChevronUp = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 14.5 6-6 6 6" />
  </svg>
);
export const IChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m9.5 6 6 6-6 6" />
  </svg>
);
export const IChevronLeft = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m14.5 6-6 6 6 6" />
  </svg>
);
export const IArrowRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12h16m-6-6 6 6-6 6" />
  </svg>
);
export const IArrowLeft = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 12H4m6-6-6 6 6 6" />
  </svg>
);
export const IArrowUpRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 17 17 7M9 7h8v8" />
  </svg>
);
export const IDots = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </svg>
);
export const IFilter = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </svg>
);
export const ISort = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 5v14M8 5 5 8m3-3 3 3M16 19V5m0 14 3-3m-3 3-3-3" />
  </svg>
);
export const IShare = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="6" cy="12" r="2.4" />
    <circle cx="17.5" cy="5.5" r="2.4" />
    <circle cx="17.5" cy="18.5" r="2.4" />
    <path d="m8.2 10.8 7-4M8.2 13.2l7 4" />
  </svg>
);
export const IEye = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);
export const IUpload = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 15V4m0 0L8 8m4-4 4 4" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
);
export const IStar = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4 7.2 18.9l.9-5.4L4.2 9.7l5.4-.8L12 4Z" />
  </svg>
);
export const IHome = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m4 11 8-7 8 7v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8Z" />
  </svg>
);
export const ISettings = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.76l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.97 1.46V21a2 2 0 1 1-4 0v-.09a1.6 1.6 0 0 0-1-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.97H3a2 2 0 1 1 0-4h.09a1.6 1.6 0 0 0 1.46-1 1.6 1.6 0 0 0-.32-1.76l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.76.32H9a1.6 1.6 0 0 0 .97-1.46V3a2 2 0 1 1 4 0v.09a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.76-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.76V9a1.6 1.6 0 0 0 1.46.97H21a2 2 0 1 1 0 4h-.09a1.6 1.6 0 0 0-1.46.97Z" />
  </svg>
);
export const IUsers = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5c.6-3.1 2.8-4.7 5.5-4.7s4.9 1.6 5.5 4.7" />
    <path d="M15.5 5.3a3.2 3.2 0 0 1 0 5.4M17.5 14.9c1.6.6 2.7 1.9 3 4.1" />
  </svg>
);
export const IUser = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 20c.7-3.6 3.4-5.4 7-5.4s6.3 1.8 7 5.4" />
  </svg>
);
export const IBell = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
    <path d="M10 19a2.2 2.2 0 0 0 4 0" />
  </svg>
);
export const IMail = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
    <path d="m4.5 7.5 7.5 5.5 7.5-5.5" />
  </svg>
);
export const IPhone = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z" />
  </svg>
);
export const IPaperclip = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m20 11.5-7.8 7.8a5 5 0 0 1-7-7L13 4.5a3.4 3.4 0 0 1 4.8 4.8L10 17.1a1.8 1.8 0 0 1-2.6-2.6l7.2-7.1" />
  </svg>
);
export const IPencil = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 20h4L20.5 7.5a2.1 2.1 0 0 0-3-3L5 17l-1 4Z" />
    <path d="m14.5 6 3 3" />
  </svg>
);
export const ICalendar = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="5.5" width="16" height="15" rx="2.5" />
    <path d="M8 3.5v4m8-4v4M4 10.5h16" />
  </svg>
);
export const IClock = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const IFlag = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 21V4.5S7 3 9.5 3s4 1.5 6.5 1.5c1.7 0 3-.7 3-.7v9.5s-1.3.7-3 .7c-2.5 0-4-1.5-6.5-1.5S5 14 5 14" />
  </svg>
);
export const IMapPin = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.6" />
  </svg>
);
export const IMap = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2ZM9 4v14m6-12v14" />
  </svg>
);
export const ILock = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 1 1 8 0v2.5" />
  </svg>
);
export const IBox = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m12 2.8 8 4v10.4l-8 4-8-4V6.8l8-4Z" />
    <path d="m4.2 7 7.8 3.9L19.8 7M12 21v-10" />
  </svg>
);
export const ITruck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2.5 6.5h12v10h-12zM14.5 10h4l3 3v3.5h-7" />
    <circle cx="6.5" cy="17.5" r="1.8" />
    <circle cx="17.5" cy="17.5" r="1.8" />
  </svg>
);
export const IZap = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8Z" />
  </svg>
);
export const IMessage = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L4 21l1.5-4.4A8.5 8.5 0 1 1 21 12Z" />
  </svg>
);
export const IFolder = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.5 7A2.5 2.5 0 0 1 6 4.5h3.5l2 2.5H18A2.5 2.5 0 0 1 20.5 9.5v7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5V7Z" />
  </svg>
);
export const IGrid = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="7" height="7" rx="1.8" />
    <rect x="13" y="4" width="7" height="7" rx="1.8" />
    <rect x="4" y="13" width="7" height="7" rx="1.8" />
    <rect x="13" y="13" width="7" height="7" rx="1.8" />
  </svg>
);
export const IRows = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17m-17 5h17" />
  </svg>
);
export const IGitBranch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="6.5" cy="6" r="2.3" />
    <circle cx="6.5" cy="18" r="2.3" />
    <circle cx="17.5" cy="6" r="2.3" />
    <path d="M6.5 8.3v7.4M17.5 8.3c0 5-11 3.2-11 7.4" />
  </svg>
);
export const ISpinner = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.5A8.5 8.5 0 1 1 3.5 12" />
  </svg>
);
export const IWarning = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9.5v4.5m0 3v.1" />
  </svg>
);
export const IInfo = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5m0-8.5v.1" />
  </svg>
);
export const ICompass = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </svg>
);
export const ICube = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m12 3 7.5 4.3v9.4L12 21l-7.5-4.3V7.3L12 3Z" />
    <path d="M12 12 4.7 7.8M12 12l7.3-4.2M12 12v8.6" />
  </svg>
);
export const ILayers = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m12 3.5 8.5 4.5L12 12.5 3.5 8 12 3.5Z" />
    <path d="m4.5 12.5 7.5 4 7.5-4M4.5 16.5l7.5 4 7.5-4" />
  </svg>
);
export const IDatabase = (p: IconProps) => (
  <svg {...base(p)}>
    <ellipse cx="12" cy="6" rx="7.5" ry="3" />
    <path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
    <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
  </svg>
);
export const ISend = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-7-2.5 17.5-8Z" />
  </svg>
);
export const IWallet = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.5 7A2.5 2.5 0 0 1 6 4.5h11.5v3" />
    <path d="M3.5 7v10A2.5 2.5 0 0 0 6 19.5h12a2.5 2.5 0 0 0 2.5-2.5v-7A2.5 2.5 0 0 0 18 7.5H6A2.5 2.5 0 0 1 3.5 7Z" />
    <circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);
export const ITrendUp = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m3.5 16.5 5.5-5.5 3.5 3.5 7-7" />
    <path d="M14.5 7.5h5v5" />
  </svg>
);
export const ITimer = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="13" r="7.5" />
    <path d="M12 9.5V13M10 2.5h4" />
  </svg>
);
export const ICreditCard = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="M3 10h18M7 14.5h4" />
  </svg>
);
export const IFileText = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5.5-5.5Z" />
    <path d="M13.5 3.5V9H19M9 13h6m-6 3.5h6" />
  </svg>
);
export const ISliders = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 6.5h8m4 0h2M5 12h2m4 0h8M5 17.5h11m3 0h.5" />
    <circle cx="15" cy="6.5" r="1.8" />
    <circle cx="9" cy="12" r="1.8" />
    <circle cx="18" cy="17.5" r="1.8" />
  </svg>
);
export const IPulse = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
  </svg>
);
export const ICommand = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9Zm0 0v6m0-6h6m-6 6H6.5A2.5 2.5 0 1 0 9 17.5V15Zm6-6V6.5A2.5 2.5 0 1 1 17.5 9H15Zm0 0v6m0 0h2.5a2.5 2.5 0 1 1-2.5 2.5V15Z" />
  </svg>
);
export const IHash = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9.5 4 8 20M16 4l-1.5 16M5 9h15M4 15h15" />
  </svg>
);
export const IMoon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5Z" />
  </svg>
);
export const ISun = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5V5m0 14v2.5M4.5 12H2m20 0h-2.5M5.3 5.3l1.8 1.8m9.8 9.8 1.8 1.8m0-13.4-1.8 1.8M7.1 16.9l-1.8 1.8" />
  </svg>
);
export const IContrast = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5Z" fill="currentColor" stroke="none" />
  </svg>
);

export const IBuilding = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 20.5V5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 14 5v15.5M14 10h4.5A1.5 1.5 0 0 1 20 11.5v9M2.5 20.5h19" />
    <path d="M7 7.5h4M7 11h4M7 14.5h4M17 14h1" />
  </svg>
);
export const IBriefcase = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="7.5" width="18" height="12.5" rx="2.5" />
    <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
  </svg>
);
export const IUserCircle = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="10" r="2.6" />
    <path d="M6.8 18.4a5.7 5.7 0 0 1 10.4 0" />
  </svg>
);
export const ICalendarSm = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
    <path d="M8 3.5v4m8-4v4M3.5 10h17" />
  </svg>
);
export const ICaretDown = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M12 16 5.5 8h13L12 16Z" />
  </svg>
);
export const ICaretRight = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M16 12 8 18.5v-13L16 12Z" />
  </svg>
);
export const ILink = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9.5 14.5 14.5 9.5M8 11 5.5 13.5a3.9 3.9 0 0 0 5.5 5.5L13.5 16.5M16 13l2.5-2.5a3.9 3.9 0 0 0-5.5-5.5L10.5 7.5" />
  </svg>
);
export const IMenu = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
export const IArrowUp = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 20V4m-6 6 6-6 6 6" />
  </svg>
);
export const ICopy = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="11.5" height="11.5" rx="2.5" />
    <path d="M5 14.5V6a2 2 0 0 1 2-2h8.5" />
  </svg>
);
export const IGlobe = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.6 2.3 3.9 5.1 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.1-3.9-8.5s1.3-6.2 3.9-8.5Z" />
  </svg>
);
export const IHeart = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 20S3.5 15 3.5 9.1C3.5 6 5.9 4 8.2 4c1.6 0 2.9.8 3.8 2 .9-1.2 2.2-2 3.8-2 2.3 0 4.7 2 4.7 5.1C20.5 15 12 20 12 20Z" />
  </svg>
);
export const IGrip = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <circle cx="9" cy="6" r="1.7" />
    <circle cx="15" cy="6" r="1.7" />
    <circle cx="9" cy="12" r="1.7" />
    <circle cx="15" cy="12" r="1.7" />
    <circle cx="9" cy="18" r="1.7" />
    <circle cx="15" cy="18" r="1.7" />
  </svg>
);
export const IBed = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 18v-8m0 4h18v4m0-4v-2a3 3 0 0 0-3-3h-8v5" />
    <circle cx="6.5" cy="11" r="1.6" />
  </svg>
);
export const IPersonX = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="10" cy="8" r="3.2" />
    <path d="M4.5 20c.6-3.4 2.9-5.2 5.5-5.2 1.5 0 2.9.6 4 1.7" />
    <path d="m16.5 15.5 4.5 4.5m0-4.5L16.5 20" />
  </svg>
);

/* ---- fills ---- */
export const IStarFill = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="m12 3.6 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.6-5 2.6.9-5.6-4-4 5.6-.8L12 3.6Z" />
  </svg>
);
export const ISparkleFill = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M12 2.5c.9 4.8 3.2 7.1 8 8-4.8.9-7.1 3.2-8 8-.9-4.8-3.2-7.1-8-8 4.8-.9 7.1-3.2 8-8Z" />
  </svg>
);
export const IVerified = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="m12 2 2.1 1.6 2.6-.3 1 2.4 2.4 1-.3 2.6L21.5 12l-1.6 2.1.3 2.6-2.4 1-1 2.4-2.6-.3L12 21.5l-2.1-1.6-2.6.3-1-2.4-2.4-1 .3-2.6L2.5 12l1.6-2.1-.3-2.6 2.4-1 1-2.4 2.6.3L12 2Z" />
    <path
      d="m8.6 12.2 2.3 2.3 4.5-4.7"
      stroke="#fff"
      strokeWidth="2"
      fill="none"
    />
  </svg>
);
export const ICheckCircleFill = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <circle cx="12" cy="12" r="10" />
    <path
      d="m7.8 12.4 2.8 2.8 5.6-5.9"
      stroke="#fff"
      strokeWidth="2.1"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
export const IXSocial = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L2 3h6.4l4.4 5.9L17.8 3Zm-1.1 16.1h1.7L7.5 4.7H5.7l11 14.4Z" />
  </svg>
);
export const ILinkedIn = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M4.5 3.5A2.5 2.5 0 0 1 7 6a2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1 2.5-2.5ZM2.4 9h4.2v12H2.4V9Zm7 0h4v1.8c.6-1.1 2-2.1 4.1-2.1 4.4 0 5.2 2.9 5.2 6.6V21h-4.2v-5c0-1.6 0-3.7-2.2-3.7s-2.6 1.7-2.6 3.5V21H9.4V9Z" />
  </svg>
);
export const IHeartFill = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M12 20.5S3 15 3 8.9C3 5.6 5.5 3.5 8 3.5c1.8 0 3.2.9 4 2.2.8-1.3 2.2-2.2 4-2.2 2.5 0 5 2.1 5 5.4 0 6.1-9 11.6-9 11.6Z" />
  </svg>
);
