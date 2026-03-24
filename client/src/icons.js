import {
	createElement,
	Copy,
	Link,
	ExternalLink,
	MessageCirclePlus,
	MessageCircle,
	LogOut,
	QrCode,
	Share2,
	Smile,
	Image,
	Send,
	X,
	Phone,
	PhoneCall,
	Mic,
	MicOff,
	Volume2,
	VolumeX,
	Settings,
	Monitor,
	MonitorOff,
	FolderUp,
	Upload,
	Download,
	Video,
	VideoOff,
	Pause,
	Play,
	ChevronDown,
	ChevronUp,
	Loader2,
	Menu,
	Users,
	MessageSquare,
	MoreHorizontal,
	PhoneOff,
	LayoutGrid,
	Grip,
	Github,
	Globe,
	RefreshCw,
	Lock,
	Minus,
	Maximize2,
	ArrowRight,
	Hand,
	BarChart2,
	Radio
} from "lucide";

const defaultAttrs = { "stroke-width": 1.75, class: "icon" };
const smAttrs = { ...defaultAttrs, width: "1.75rem", height: "1.75rem" };
const lockInlineAttrs = { ...defaultAttrs, width: "0.9rem", height: "0.9rem", class: "icon landing-active-room__lock-svg" };
const jumpInlineAttrs = { ...defaultAttrs, width: "0.95rem", height: "0.95rem", class: "icon landing-active-room__jump-svg" };
const lgAttrs = { ...defaultAttrs, width: "3rem", height: "3rem" };
/** Landing: leere aktive Räume – groß, passend zur Empty-State-Kachel */
const landingEmptyStateAttrs = { ...defaultAttrs, width: "2.75rem", height: "2.75rem", class: "icon landing__empty-state-svg", "stroke-width": 1.5 };

export const iconCopy = () => createElement(Copy, smAttrs).outerHTML;
export const iconLink = () => createElement(Link, smAttrs).outerHTML;
export const iconExternalLink = () => createElement(ExternalLink, smAttrs).outerHTML;
export const iconMessageCirclePlus = () => createElement(MessageCirclePlus, defaultAttrs).outerHTML;
export const iconMessageCircle = () => createElement(MessageCircle, defaultAttrs).outerHTML;
export const iconLogOut = () => createElement(LogOut, smAttrs).outerHTML;
export const iconQrCode = () => createElement(QrCode, smAttrs).outerHTML;
export const iconShare2 = () => createElement(Share2, smAttrs).outerHTML;
export const iconSmile = () => createElement(Smile, smAttrs).outerHTML;
export const iconImage = () => createElement(Image, smAttrs).outerHTML;
export const iconSend = () => createElement(Send, smAttrs).outerHTML;
export const iconX = () => createElement(X, smAttrs).outerHTML;
export const iconMinus = () => createElement(Minus, smAttrs).outerHTML;
export const iconMaximize2 = () => createElement(Maximize2, smAttrs).outerHTML;
export const iconPhone = () => createElement(Phone, defaultAttrs).outerHTML;
export const iconPhoneCall = () => createElement(PhoneCall, defaultAttrs).outerHTML;
export const iconMic = () => createElement(Mic, smAttrs).outerHTML;
export const iconMicOff = () => createElement(MicOff, smAttrs).outerHTML;
export const iconVolume2 = () => createElement(Volume2, smAttrs).outerHTML;
export const iconVolumeX = () => createElement(VolumeX, smAttrs).outerHTML;
export const iconSettings = () => createElement(Settings, smAttrs).outerHTML;
export const iconMonitor = () => createElement(Monitor, defaultAttrs).outerHTML;
export const iconMonitorOff = () => createElement(MonitorOff, smAttrs).outerHTML;
export const iconFolderUp = () => createElement(FolderUp, defaultAttrs).outerHTML;
export const iconUpload = () => createElement(Upload, lgAttrs).outerHTML;
export const iconDownload = () => createElement(Download, defaultAttrs).outerHTML;
export const iconDownloadLg = () => createElement(Download, { ...defaultAttrs, width: "4rem", height: "4rem" }).outerHTML;
export const iconVideo = () => createElement(Video, smAttrs).outerHTML;
export const iconVideoOff = () => createElement(VideoOff, smAttrs).outerHTML;
export const iconPause = () => createElement(Pause, smAttrs).outerHTML;
export const iconPlay = () => createElement(Play, smAttrs).outerHTML;
export const iconChevronDown = () => createElement(ChevronDown, smAttrs).outerHTML;
export const iconChevronUp = () => createElement(ChevronUp, smAttrs).outerHTML;
export const iconLoader2 = () => createElement(Loader2, { ...smAttrs, class: "icon icon--spin" }).outerHTML;
export const iconMenu = () => createElement(Menu, smAttrs).outerHTML;
export const iconUsers = () => createElement(Users, smAttrs).outerHTML;
export const iconMessageSquare = () => createElement(MessageSquare, smAttrs).outerHTML;
export const iconMoreHorizontal = () => createElement(MoreHorizontal, smAttrs).outerHTML;
export const iconPhoneOff = () => createElement(PhoneOff, smAttrs).outerHTML;
export const iconLayoutGrid = () => createElement(LayoutGrid, smAttrs).outerHTML;
export const iconGrip = () => createElement(Grip, smAttrs).outerHTML;
export const iconGithub = () => createElement(Github, smAttrs).outerHTML;
export const iconGlobe = () => createElement(Globe, smAttrs).outerHTML;
export const iconRefreshCw = () => createElement(RefreshCw, smAttrs).outerHTML;
export const iconLockInline = () => createElement(Lock, lockInlineAttrs).outerHTML;
/** Pinned rooms: tap-to-join hint (no live presence). */
export const iconPinnedRoomJump = () => createElement(ArrowRight, jumpInlineAttrs).outerHTML;
export const iconHand = () => createElement(Hand, smAttrs).outerHTML;
export const iconBarChart2 = () => createElement(BarChart2, smAttrs).outerHTML;
/** „Keine live-Räume“ – dezentes Lucide-Icon statt Illustration */
export const iconLandingActiveRoomsEmpty = () => createElement(Radio, landingEmptyStateAttrs).outerHTML;

export const iconLogo = () => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="4rem" height="4rem" class="icon logo-icon logo-icon--hero">
  <defs>
    <linearGradient id="logoPrimary" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f0c0" />
      <stop offset="100%" stop-color="#00d4aa" />
    </linearGradient>
    <linearGradient id="logoSecondary" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#ec4899" />
    </linearGradient>
    <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <path d="M 144 96 h 128 c 35.3 0 64 28.7 64 64 v 96 c 0 35.3 -28.7 64 -64 64 h -32 l -48 48 v -48 h -48 c -35.3 0 -64 -28.7 -64 -64 v -96 c 0 -35.3 28.7 -64 64 -64 z" fill="url(#logoSecondary)" opacity="0.85" filter="url(#logoGlow)"/>
  <path d="M 240 144 h 128 c 35.3 0 64 28.7 64 64 v 96 c 0 35.3 -28.7 64 -64 64 h -32 l -48 48 v -48 h -48 c -35.3 0 -64 -28.7 -64 -64 v -96 c 0 -35.3 28.7 -64 64 -64 z" fill="url(#logoPrimary)" filter="url(#logoGlow)"/>
  <g fill="#0a0a0f">
    <circle cx="264" cy="256" r="14" />
    <circle cx="304" cy="256" r="14" />
    <circle cx="344" cy="256" r="14" />
  </g>
</svg>
`;

export const iconLogoWordmark = ({ width = "100%", height = "100%", extraClass = "" } = {}) => {
	const cls = `icon logo-wordmark${extraClass ? ` ${extraClass}` : ""}`;
	/* SVG height="auto" ist ungültig (Browser-Warnung); Höhe per CSS (z. B. .landing__wordmark .logo-wordmark). */
	const heightAttr =
		height === null || height === "" || height === "auto" ? "" : ` height="${height}"`;
	return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 150" width="${width}"${heightAttr} class="${cls}">
  <defs>
    <linearGradient id="logoPrimaryM" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f0c0" />
      <stop offset="100%" stop-color="#00d4aa" />
    </linearGradient>
    <linearGradient id="logoSecondaryM" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#ec4899" />
    </linearGradient>
    <linearGradient id="textGradientM" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#b4b4c0" />
    </linearGradient>
    <filter id="logoGlowM" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  
  <g transform="scale(0.24) translate(0, 50)">
    <path d="M 144 96 h 128 c 35.3 0 64 28.7 64 64 v 96 c 0 35.3 -28.7 64 -64 64 h -32 l -48 48 v -48 h -48 c -35.3 0 -64 -28.7 -64 -64 v -96 c 0 -35.3 28.7 -64 64 -64 z" fill="url(#logoSecondaryM)" opacity="0.85" filter="url(#logoGlowM)"/>
    <path d="M 240 144 h 128 c 35.3 0 64 28.7 64 64 v 96 c 0 35.3 -28.7 64 -64 64 h -32 l -48 48 v -48 h -48 c -35.3 0 -64 -28.7 -64 -64 v -96 c 0 -35.3 28.7 -64 64 -64 z" fill="url(#logoPrimaryM)" filter="url(#logoGlowM)"/>
    <g fill="#0a0a0f">
      <circle cx="264" cy="256" r="14" />
      <circle cx="304" cy="256" r="14" />
      <circle cx="344" cy="256" r="14" />
    </g>
  </g>
  
  <text x="135" y="105" font-family="'Outfit', system-ui, sans-serif" font-weight="700" font-size="82" fill="url(#textGradientM)" letter-spacing="-1.5">
    EasyMeet
  </text>
  <circle cx="505" cy="100" r="8" fill="#00d4aa" filter="url(#logoGlowM)" />
</svg>
`;
};
