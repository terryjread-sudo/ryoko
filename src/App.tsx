import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent } from "react";
import "./App.css";
import "./interaction.css";
import {
  createTrip,
  deleteDay,
  deleteItem,
  getStoredSession,
  issueMember,
  joinTrip,
  listDays,
  listInstagramItems,
  listTripMemberCount,
  listJourneyInstagramItems,
  listInstagramVotes,
  listAuditEvents,
  moveItem,
  moveJourneyInstagramToDay,
  deleteJourneyInstagramItem,
  saveJourneyInstagramItem,
  setInstagramVote,
  recordAuditEvent,
  saveDay,
  saveItem,
  subscribeToTripPresence,
  type AuditEvent,
  type RyokoSession,
  type InstagramVote,
  type InstagramVoteSummary,
} from "./lib/ryoko";
import { resolveInstagramUrl, type InstagramPreview } from "./lib/instagram";
import { supabase } from "./lib/supabase";
import {
  deleteAdminPlan,
  exportAccountData,
  archiveAdminPlan,
  archiveOwnPlan,
  getAccountProfile,
  isAdmin,
  linkCurrentTrip,
  listAccountPlans,
  listAdminPlans,
  listAdminPlanMembers,
  revokeAdminPlanMember,
  restoreAdminPlanMember,
  requestAccountLink,
  revealAccountTripCode,
  restoreAdminPlan,
  saveAccountProfile,
  requestAccountDeletion,
  unlinkPlan,
  signInWithGithub,
  type AccountPlan,
  type AdminPlanMember,
} from "./lib/account";
import { japanPlaces, placeSearchTerms, type JapanPlace } from "./data/japanPlaces";

type Day = {
  id?: string;
  date: string;
  city: string;
  emoji: string;
  title: string;
  items: string[];
  instagramUrl?: string;
  subLocation?: string;
  instagramItems: InstagramItem[];
};
type InstagramItem = {
  id?: string;
  url: string;
  title: string;
  description?: string;
  author: string;
  thumbnailUrl?: string;
  places?: string[];
  tags?: string[];
};

const sortDaysByDate = (items: Day[]) =>
  items
    .map((day, originalIndex) => ({ day, originalIndex }))
    .sort((a, b) => a.day.date.localeCompare(b.day.date) || a.originalIndex - b.originalIndex)
    .map(({ day }) => day);

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const instagramStandardTags = ["food", "tips", "activity", "travel"];

const canonicalInstagramUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value.trim().toLowerCase();
  }
};

const instagramEmbedUrl = (value: string) => {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const match = url.pathname.match(/^\/(p|reel|tv)\/([^/]+)/i);
    if (hostname !== "instagram.com" || !match) return null;
    return `https://www.instagram.com/${match[1].toLowerCase()}/${match[2]}/embed/`;
  } catch {
    return null;
  }
};

const parseInstagramItem = (item: { id: string; content: string }) => {
  try {
    return { id: item.id, ...JSON.parse(item.content) } as InstagramItem;
  } catch {
    return { id: item.id, url: item.content, title: "Instagram inspiration", author: "Instagram" } as InstagramItem;
  }
};

function InstagramGlyph() {
  return (
    <svg className="instagram-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle className="instagram-glyph-dot" cx="17.5" cy="6.5" r="1.1" />
    </svg>
  );
}

function InstagramMetadata({
  text,
  selectedPlaces,
  onTogglePlace,
}: {
  text: string;
  selectedPlaces: string[];
  onTogglePlace: (place: JapanPlace) => void;
}) {
  const matches = japanPlaces.flatMap((place) =>
    placeSearchTerms(place).map((term) => ({ place, term })),
  );
  const pattern = matches
    .sort((a, b) => b.term.length - a.term.length)
    .map(({ term }) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  if (!pattern) return <>{text}</>;
  const matcher = new RegExp(`(${pattern})`, "giu");
  return text.split(matcher).map((part, index) => {
    const match = matches.find(({ term }) => term.toLowerCase() === part.toLowerCase());
    if (!match) return <span key={`${part}-${index}`}>{part}</span>;
    const selected = selectedPlaces.includes(match.place.english);
    return (
      <button
        className={`place-highlight ${selected ? "selected" : ""}`}
        key={`${match.place.english}-${index}`}
        title={`${match.place.english} · ${match.place.japanese}`}
        type="button"
        onClick={() => onTogglePlace(match.place)}
      >
        {part}
      </button>
    );
  });
}

function InstagramVoteControls({
  summary,
  onVote,
}: {
  summary?: InstagramVoteSummary;
  onVote: (vote: InstagramVote) => void;
}) {
  const options: Array<{ value: InstagramVote; label: string; icon: string; count: number }> = [
    { value: 1, label: "Upvote", icon: "↑", count: summary?.upvotes ?? 0 },
    { value: 0, label: "Middle", icon: "•", count: summary?.middle_votes ?? 0 },
    { value: -1, label: "Downvote", icon: "↓", count: summary?.downvotes ?? 0 },
  ];
  return (
    <div className="instagram-votes" aria-label="Vote on this Instagram video">
      {options.map((option) => (
        <button
          key={option.value}
          className={summary?.my_vote === option.value ? "selected" : ""}
          type="button"
          aria-label={`${option.label}: ${option.count}`}
          aria-pressed={summary?.my_vote === option.value}
          onClick={(event) => {
            event.stopPropagation();
            onVote(option.value);
          }}
        >
          <span>{option.icon}</span>{option.count}
        </button>
      ))}
    </div>
  );
}
const destinations = [
  "Tokyo",
  "Kyoto",
  "Osaka",
  "Nara",
  "Hiroshima",
  "Hakone",
  "Sapporo",
  "Fukuoka",
];
const emojis: Record<string, string> = {
  Tokyo: "🗼",
  Kyoto: "⛩️",
  Osaka: "🐙",
  Nara: "🦌",
  Hiroshima: "🕊️",
  Hakone: "♨️",
  Sapporo: "❄️",
  Fukuoka: "🍜",
};
const destinationCoords: Record<string, [number, number]> = {
  Tokyo: [35.6762, 139.6503],
  Kyoto: [35.0116, 135.7681],
  Osaka: [34.6937, 135.5023],
  Nara: [34.6851, 135.8048],
  Hiroshima: [34.3853, 132.4553],
  Hakone: [35.2324, 139.1069],
  Sapporo: [43.0618, 141.3545],
  Fukuoka: [33.5902, 130.4017],
};
const destinationJapanese: Record<string, string> = {
  Tokyo: "東京",
  Kyoto: "京都",
  Osaka: "大阪",
  Nara: "奈良",
  Hiroshima: "広島",
  Hakone: "箱根",
  Sapporo: "札幌",
  Fukuoka: "福岡",
};
const mapPlaceLabels = [
  ["Tokyo", "東京", 35.6762, 139.6503],
  ["Yokohama", "横浜", 35.4437, 139.638],
  ["Kamakura", "鎌倉", 35.3192, 139.5467],
  ["Hakone", "箱根", 35.2324, 139.1069],
  ["Mount Fuji", "富士山", 35.3606, 138.7274],
  ["Nikko", "日光", 36.7199, 139.6982],
  ["Nagoya", "名古屋", 35.1815, 136.9066],
  ["Kanazawa", "金沢", 36.5613, 136.6562],
  ["Takayama", "高山", 36.1408, 137.2522],
  ["Matsumoto", "松本", 36.238, 137.972],
  ["Kyoto", "京都", 35.0116, 135.7681],
  ["Osaka", "大阪", 34.6937, 135.5023],
  ["Nara", "奈良", 34.6851, 135.8048],
  ["Kobe", "神戸", 34.6901, 135.1956],
  ["Himeji", "姫路", 34.8151, 134.6853],
  ["Hiroshima", "広島", 34.3853, 132.4553],
  ["Miyajima", "宮島", 34.2956, 132.3197],
  ["Okayama", "岡山", 34.6551, 133.9195],
  ["Takamatsu", "高松", 34.3428, 134.0466],
  ["Matsuyama", "松山", 33.8392, 132.7657],
  ["Fukuoka", "福岡", 33.5902, 130.4017],
  ["Nagasaki", "長崎", 32.7503, 129.8777],
  ["Kumamoto", "熊本", 32.8031, 130.7079],
  ["Kagoshima", "鹿児島", 31.5966, 130.5571],
  ["Naha", "那覇", 26.2124, 127.6809],
  ["Sapporo", "札幌", 43.0618, 141.3545],
  ["Otaru", "小樽", 43.1907, 140.9947],
  ["Furano", "富良野", 43.342, 142.383],
  ["Aomori", "青森", 40.8222, 140.7474],
  ["Sendai", "仙台", 38.2682, 140.8694],
  ["Shibuya", "渋谷", 35.6595, 139.7005],
  ["Shinjuku", "新宿", 35.6938, 139.7034],
  ["Asakusa", "浅草", 35.7148, 139.7967],
  ["Akihabara", "秋葉原", 35.6984, 139.7731],
  ["Arashiyama", "嵐山", 35.0094, 135.6668],
  ["Gion", "祇園", 35.0037, 135.7788],
  ["Fushimi Inari", "伏見稲荷", 34.9671, 135.7727],
  ["Kiyomizu-dera", "清水寺", 34.9949, 135.785],
  ["Kinkaku-ji", "金閣寺", 35.0394, 135.7292],
  ["Dotonbori", "道頓堀", 34.6687, 135.5013],
  ["Osaka Castle", "大阪城", 34.6873, 135.5262],
  ["Universal Studios Japan", "ユニバーサル・スタジオ・ジャパン", 34.6654, 135.4323],
  ["Nara Park", "奈良公園", 34.6851, 135.843],
  ["Todaiji", "東大寺", 34.6889, 135.8398],
  ["Himeji Castle", "姫路城", 34.8394, 134.6939],
  ["Kenrokuen", "兼六園", 36.5626, 136.6625],
  ["Nikko Toshogu", "日光東照宮", 36.758, 139.5989],
  ["Atomic Bomb Dome", "原爆ドーム", 34.3955, 132.4536],
  ["Itsukushima Shrine", "厳島神社", 34.2959, 132.3198],
] as const;
const destinationMatches = (value: string) => {
  const query = value.trim().toLowerCase();
  if (!query) return destinations.slice(0, 5);
  return destinations.filter(
    (city) =>
      city.toLowerCase().includes(query) ||
      query.includes(city.toLowerCase().slice(0, 3)),
  );
};

function JapanMap({
  days,
  onSelect,
  labelLanguage,
  provider,
  selectedIndex,
}: {
  days: Day[];
  onSelect: (index: number) => void;
  labelLanguage: "english" | "japanese";
  provider: "openstreetmap" | "google";
  selectedIndex: number;
}) {
  const [zoom, setZoom] = useState(5);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const mapDrag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const width = 800;
  const height = 430;
  const points = days.map((day, index) => ({
    day,
    index,
    coord:
      destinationCoords[day.city] ?? ([35.6762, 139.6503] as [number, number]),
  }));
  const labelPoints = mapPlaceLabels.map(([english, japanese, lat, lon]) => ({
    english,
    japanese,
    coord: [lat, lon] as [number, number],
  }));
  const taggedPoints = days.flatMap((day, dayIndex) =>
    (day.instagramItems ?? []).flatMap((item) =>
      (item.places ?? []).flatMap((place) => {
        const found = labelPoints.find((label) => label.english === place);
        return found ? [{ ...found, dayIndex, title: item.title }] : [];
      }),
    ),
  );
  const center = points.length
    ? (points
        .reduce(
          (sum, point) => [sum[0] + point.coord[0], sum[1] + point.coord[1]],
          [0, 0],
        )
        .map((value) => value / points.length) as [number, number])
    : ([36, 137] as [number, number]);
  const project = (lat: number, lon: number, level: number) => {
    const scale = 256 * 2 ** level;
    const x = ((lon + 180) / 360) * scale;
    const sin = Math.sin((lat * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
    return [x, y] as [number, number];
  };
  const centerPoint = project(center[0], center[1], zoom);
  const screenPoint = (coord: [number, number]) => [
    width / 2 + project(coord[0], coord[1], zoom)[0] - centerPoint[0] + pan.x,
    height / 2 + project(coord[0], coord[1], zoom)[1] - centerPoint[1] + pan.y,
  ] as [number, number];
  const beginMapDrag = (event: PointerEvent<SVGSVGElement>) => {
    mapDrag.current = { x: pan.x, y: pan.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveMap = (event: PointerEvent<SVGSVGElement>) => {
    if (!mapDrag.current) return;
    setPan({
      x: mapDrag.current.x + event.clientX - mapDrag.current.startX,
      y: mapDrag.current.y + event.clientY - mapDrag.current.startY,
    });
  };
  const endMapDrag = (event: PointerEvent<SVGSVGElement>) => {
    mapDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const googleLanguage = labelLanguage === "japanese" ? "ja" : "en";
  const selectedCenter = points[selectedIndex]?.coord ?? center;
  const selectedTagged = taggedPoints.filter((point) => point.dayIndex === selectedIndex);
  const routePoints = [selectedCenter, ...selectedTagged.map((point) => point.coord)];
  const routeOrigin = routePoints[0];
  const routeDestination = routePoints[routePoints.length - 1];
  const routeWaypoints = routePoints.slice(1, -1).map(([lat, lon]) => `${lat},${lon}`).join("|");
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${routeOrigin[0]},${routeOrigin[1]}&destination=${routeDestination[0]},${routeDestination[1]}${routeWaypoints ? `&waypoints=${encodeURIComponent(routeWaypoints)}` : ""}&travelmode=transit&hl=${googleLanguage}`;
  const googleMapUrl = `https://www.google.com/maps?q=${selectedCenter[0]},${selectedCenter[1]}&z=${zoom + 1}&hl=${googleLanguage}&output=embed`;
  if (provider === "google") {
    return (
      <div className="real-map google-map">
        <iframe
          title={`Google Maps of Japan in ${labelLanguage} labels`}
          src={googleMapUrl}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <a
          className="google-map-link"
          href={`https://www.google.com/maps/search/?api=1&query=${selectedCenter[0]},${selectedCenter[1]}&hl=${googleLanguage}`}
          target="_blank"
          rel="noreferrer"
        >
          Open in Google Maps ↗
        </a>
        {routePoints.length > 1 && (
          <a className="google-route-link" href={directionsUrl} target="_blank" rel="noreferrer">
            Show day route ({routePoints.length} locations) ↗
          </a>
        )}
        <span className="google-map-selected">
          {points[selectedIndex]?.day.city || "Selected day"}
        </span>
      </div>
    );
  }
  const tiles = Array.from({ length: 25 }, (_, index) => {
    const col = (index % 5) - 2;
    const row = Math.floor(index / 5) - 2;
    const tileX = Math.floor(centerPoint[0] / 256) + col;
    const tileY = Math.floor(centerPoint[1] / 256) + row;
    return {
      tileX,
      tileY,
      x: width / 2 + tileX * 256 - centerPoint[0] + pan.x,
      y: height / 2 + tileY * 256 - centerPoint[1] + pan.y,
    };
  });
  return (
    <div className="real-map">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Interactive map of Japan"
        onPointerDown={beginMapDrag}
        onPointerMove={moveMap}
        onPointerUp={endMapDrag}
        onPointerCancel={endMapDrag}
        onWheel={(event) => {
          event.preventDefault();
          setZoom((value) => Math.max(3, Math.min(8, value + (event.deltaY < 0 ? 1 : -1))));
        }}
      >
        <rect width={width} height={height} fill="#dce9df" />
        {tiles.map((tile) => (
          <image
            key={`${tile.tileX}-${tile.tileY}`}
            href={`https://tile.openstreetmap.org/${zoom}/${tile.tileX}/${tile.tileY}.png`}
            x={tile.x}
            y={tile.y}
            width="256"
            height="256"
          />
        ))}
        {labelPoints.map(({ english, japanese, coord }) => {
          const point = screenPoint(coord);
          return (
            <text
              className="map-place-label"
              key={english}
              x={point[0]}
              y={point[1]}
              textAnchor="middle"
            >
              {labelLanguage === "japanese" ? japanese : english}
            </text>
          );
        })}
        {taggedPoints.map(({ english, japanese, coord, dayIndex, title }) => {
          const point = screenPoint(coord);
          return (
            <g key={`${english}-${dayIndex}-${title}`} transform={`translate(${point[0]},${point[1]})`}>
              <circle className="instagram-map-pin" r="7" />
              <text className="instagram-map-label" y="-10" textAnchor="middle">
                {labelLanguage === "japanese" ? japanese : english}
              </text>
            </g>
          );
        })}
        {points.map(({ day, index, coord }) => {
          const point = screenPoint(coord);
          return (
            <g
              key={day.id ?? index}
              className="real-pin"
              transform={`translate(${point[0]},${point[1]})`}
              onClick={() => onSelect(index)}
            >
              <circle r="13" />
              <text y="4" textAnchor="middle">
                ✦
              </text>
              <text className="real-pin-label" y="29" textAnchor="middle">
                {day.city
                  ? labelLanguage === "japanese"
                    ? destinationJapanese[day.city] ?? day.city
                    : day.city
                  : labelLanguage === "japanese"
                    ? "行き先を選択"
                    : "Choose a destination"}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="map-controls">
        <button
          onClick={() => setZoom((value) => Math.min(8, value + 1))}
          aria-label="Zoom in"
          title="Zoom in"
        >
          ＋
        </button>
        <button
          onClick={() => setZoom((value) => Math.max(3, value - 1))}
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <button onClick={() => { setZoom(5); setPan({ x: 0, y: 0 }); }} aria-label="Reset map view" title="Reset map view">
          ⌂
        </button>
      </div>
      <small className="map-credit">© OpenStreetMap contributors</small>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<RyokoSession | null>(() =>
    getStoredSession(),
  );
  const [days, setDays] = useState<Day[]>([]);
  const [journeyName, setJourneyName] = useState(
    () => getStoredSession()?.journeyName ?? "Your Japan journey",
  );
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(0);
  const [totalMembers, setTotalMembers] = useState(0);
  const [pwaCompatible, setPwaCompatible] = useState(false);
  const [pwaInstalled, setPwaInstalled] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [pwaHelpOpen, setPwaHelpOpen] = useState(false);
  const [collaborators, setCollaborators] = useState<
    Array<{ name?: string; color?: string; activeDay?: number | null }>
  >([]);
  const presenceRef = useRef<{
    (): void;
    updateActiveDay: (day: number) => void;
  } | null>(null);
  const [history, setHistory] = useState<AuditEvent[]>([]);
  const [modal, setModal] = useState<
    | "start"
    | "join"
    | "create"
    | "invite"
    | "code"
    | "account"
    | "journeys"
    | "history"
    | null
  >(() => (getStoredSession() ? null : "start"));
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [tripName, setTripName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviteError, setInviteError] = useState("");
  const [issuedMember, setIssuedMember] = useState<{
    name: string;
    role: "editor" | "viewer";
    code: string;
  } | null>(null);
  const [active, setActive] = useState(0);
  const [dragged, setDragged] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    undo?: () => void;
  } | null>(null);
  const [instagramDay, setInstagramDay] = useState<number | null>(null);
  const [instagramLibraryMode, setInstagramLibraryMode] = useState(false);
  const [instagramLibrary, setInstagramLibrary] = useState<InstagramItem[]>([]);
  const [instagramVotes, setInstagramVotes] = useState<Record<string, InstagramVoteSummary>>({});
  const [moveLibraryItem, setMoveLibraryItem] = useState<InstagramItem | null>(null);
  const [playingInstagram, setPlayingInstagram] = useState<InstagramItem | null>(null);
  const [expandedInstagramCaptions, setExpandedInstagramCaptions] = useState<Set<string>>(new Set());
  const [revealedInstagramCards, setRevealedInstagramCards] = useState<Set<string>>(new Set());
  const [editingInstagram, setEditingInstagram] = useState<{
    itemId: string;
    dayIndex: number | null;
  } | null>(null);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [instagramPreview, setInstagramPreview] =
    useState<InstagramPreview | null>(null);
  const [instagramLoading, setInstagramLoading] = useState(false);
  const [instagramError, setInstagramError] = useState("");
  const [instagramPlaces, setInstagramPlaces] = useState<string[]>([]);
  const [instagramTags, setInstagramTags] = useState<string[]>([]);
  const [draggedInstagram, setDraggedInstagram] = useState<{
    dayIndex: number;
    itemId: string;
  } | null>(null);
  const [instagramDragOver, setInstagramDragOver] = useState<number | null>(null);
  const [useInstagramLocation, setUseInstagramLocation] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(userAgent);
    const isAndroidChrome = /android/i.test(userAgent) && /chrome/i.test(userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setPwaCompatible(isIos || isAndroidChrome);
    setPwaInstalled(standalone);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setPwaInstalled(true);
      setInstallPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const installRyoko = async () => {
    if (!installPromptEvent) {
      setPwaHelpOpen(true);
      return;
    }
    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    if (choice.outcome === "accepted") setPwaInstalled(true);
    setInstallPromptEvent(null);
  };
  const [accountUser, setAccountUser] = useState<{
    email?: string;
    created_at?: string;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  } | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [accountPlans, setAccountPlans] = useState<AccountPlan[]>([]);
  const [adminPlans, setAdminPlans] = useState<AccountPlan[]>([]);
  const [adminModal, setAdminModal] = useState(false);
  const [adminMembersPlan, setAdminMembersPlan] = useState<AccountPlan | null>(null);
  const [adminMembers, setAdminMembers] = useState<AdminPlanMember[]>([]);
  const [destinationFocus, setDestinationFocus] = useState<number | null>(null);
  const [accountProfile, setAccountProfile] = useState({
    displayName: "",
    avatarColor: "#735fa6",
  });
  const avatarColorInputRef = useRef<HTMLInputElement>(null);
  const [accountIsAdmin, setAccountIsAdmin] = useState(false);
  const [accountCodes, setAccountCodes] = useState<Record<string, string>>({});
  const [mapLabelLanguage, setMapLabelLanguage] = useState<
    "english" | "japanese"
  >("english");
  const [mapProvider, setMapProvider] = useState<
    "openstreetmap" | "google"
  >("openstreetmap");

  const toggleInstagramCaption = (item: InstagramItem) => {
    const key = item.id ?? item.url;
    setExpandedInstagramCaptions((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleInstagramCardDetails = (item: InstagramItem, event: ReactMouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const key = item.id ?? item.url;
    setRevealedInstagramCards((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const voteOnInstagram = async (item: InstagramItem, vote: InstagramVote) => {
    if (!session) return;
    const canonicalUrl = canonicalInstagramUrl(item.url);
    const previous = instagramVotes[canonicalUrl];
    const optimistic: InstagramVoteSummary = {
      canonical_url: canonicalUrl,
      upvotes: (previous?.upvotes ?? 0) - (previous?.my_vote === 1 ? 1 : 0) + (vote === 1 ? 1 : 0),
      middle_votes: (previous?.middle_votes ?? 0) - (previous?.my_vote === 0 ? 1 : 0) + (vote === 0 ? 1 : 0),
      downvotes: (previous?.downvotes ?? 0) - (previous?.my_vote === -1 ? 1 : 0) + (vote === -1 ? 1 : 0),
      my_vote: vote,
    };
    setInstagramVotes((current) => ({ ...current, [canonicalUrl]: optimistic }));
    try {
      const summary = await setInstagramVote(session, canonicalUrl, vote);
      if (summary) setInstagramVotes((current) => ({ ...current, [canonicalUrl]: summary }));
    } catch (error) {
      setInstagramVotes((current) => {
        const next = { ...current };
        if (previous) next[canonicalUrl] = previous;
        else delete next[canonicalUrl];
        return next;
      });
      setError((error as Error).message);
    }
  };

  const showToast = (message: string, undo?: () => void) => {
    setToast({ message, undo });
    window.setTimeout(() => setToast(null), undo ? 7000 : 3500);
  };

  const journeyStart = session?.startDate || from || undefined;
  const journeyEnd = session?.endDate || to || undefined;
  const isJourneyDate = (value: string) =>
    (!journeyStart || value >= journeyStart) &&
    (!journeyEnd || value <= journeyEnd);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get("url") || params.get("text");
    if (!sharedUrl) return;
    setInstagramLibraryMode(true);
    setInstagramUrl(sharedUrl);
    window.history.replaceState({}, "", window.location.pathname + window.location.hash);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let disposed = false;
    const enterAccount = async (user: NonNullable<typeof accountUser>) => {
      setAccountUser(user);
      try {
        const plans = await listAccountPlans();
        if (disposed) return;
        setAccountPlans(plans);
        // Keep an existing journey open when auth finishes restoring, but make
        // the linked journeys available to the top-bar switcher immediately.
        if (!getStoredSession()) setModal(plans.length ? "account" : "start");
      } catch {
        if (!disposed && !getStoredSession()) setModal("start");
      }
    };
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) void enterAccount(data.session.user);
      else setAccountUser(null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, authSession) => {
      if (authSession?.user) void enterAccount(authSession.user);
      else {
        setAccountUser(null);
        if (!getStoredSession()) setModal("start");
      }
    });
    return () => {
      disposed = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const openAccount = async () => {
    setModal("account");
    setAccountMessage("");
    if (!accountUser) return;
    try {
      const profile = await getAccountProfile();
      setAccountProfile({
        displayName: profile?.display_name ?? "",
        avatarColor: profile?.avatar_color ?? "#735fa6",
      });
      const admin = await isAdmin();
      setAccountIsAdmin(admin);
      setAccountPlans(await listAccountPlans());
      if (admin) setAdminPlans(await listAdminPlans());
    } catch (e) {
      const message = (e as Error).message;
      setAccountMessage(
        message.includes("Invalid journey code") || message.includes("crypt")
          ? "The account-link database migration still needs to be applied in Supabase."
          : message,
      );
    }
  };
  const accountDisplayName =
    accountProfile.displayName ||
    String(
      accountUser?.user_metadata?.full_name ??
        accountUser?.user_metadata?.name ??
        accountUser?.email ??
        "",
    );
  const accountInitial =
    accountDisplayName.trim().charAt(0).toUpperCase() || "?";
  const visibleAccountPlans = accountPlans.slice(0, 10);
  const saveProfile = async () => {
    try {
      await saveAccountProfile(
        accountProfile.displayName,
        accountProfile.avatarColor,
      );
      setAccountMessage("Profile saved.");
    } catch (e) {
      setAccountMessage((e as Error).message);
    }
  };
  const openLinkedPlan = (plan: AccountPlan) => {
    const accountSession: RyokoSession = {
      tripId: plan.trip_id,
      code: "",
      journeyName: plan.name,
      role: "owner",
      displayName: accountDisplayName,
      color: accountProfile.avatarColor,
      startDate: plan.start_date,
      endDate: plan.end_date,
    };
    localStorage.setItem("ryoko_session", JSON.stringify(accountSession));
    setSession(accountSession);
    setJourneyName(plan.name);
    setModal(null);
  };
  const revealCode = async (tripId: string) => {
    if (!window.confirm("Reveal this journey access code?")) return;
    try {
      const value = await revealAccountTripCode(tripId);
      if (value)
        setAccountCodes((current) => ({ ...current, [tripId]: value }));
    } catch (e) {
      setAccountMessage((e as Error).message);
    }
  };
  const unlinkCurrentPlan = async (plan: AccountPlan) => {
    if (!window.confirm(`Unlink ${plan.name} from this account?`)) return;
    await unlinkPlan(plan.trip_id);
    setAccountPlans((items) =>
      items.filter((item) => item.trip_id !== plan.trip_id),
    );
  };
  const downloadAccountExport = async () => {
    const data = await exportAccountData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "ryoko-account-export.json";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const sendAccountLink = async () => {
    try {
      await requestAccountLink(accountEmail);
      setAccountMessage("Check your email for a secure sign-in link.");
    } catch (e) {
      setAccountMessage((e as Error).message);
    }
  };
  const connectCurrentJourney = async () => {
    if (!session || !accountUser) return;
    try {
      await linkCurrentTrip(session.tripId, session.code);
      setAccountMessage("This journey is now linked to your account.");
      setAccountPlans(await listAccountPlans());
    } catch (e) {
      const message = (e as Error).message;
      setAccountMessage(
        message.includes("Invalid journey code") || message.includes("crypt")
          ? "The account-link database migration still needs to be applied in Supabase."
          : message,
      );
    }
  };

  useEffect(() => {
    if (!session) {
      setLoading(false);
      setTotalMembers(0);
      return;
    }
    setTotalMembers(1);
    void listTripMemberCount(session).then(setTotalMembers).catch(() => undefined);
    setLoading(true);
    void listInstagramVotes(session)
      .then((rows) => setInstagramVotes(Object.fromEntries(rows.map((row) => [row.canonical_url, row]))))
      .catch(() => undefined);
    void listDays(session)
      .then(async (rows) => {
        const libraryRows = await listJourneyInstagramItems(session);
        const loaded = await Promise.all(
          rows.map(
            async (row: {
              id: string;
              day_date: string;
              city: string | null;
              title: string | null;
            }) => {
              const instagramItems = await listInstagramItems(session, row.id);
              return {
                id: row.id,
                date: row.day_date,
                city: row.city ?? "",
                emoji: emojis[row.city ?? ""] ?? "✦",
                title: row.title ?? "",
                items: [],
                instagramItems: instagramItems.map(parseInstagramItem),
              } as Day;
            },
          ),
        );
        setDays(sortDaysByDate(loaded));
        setInstagramLibrary(libraryRows.map(parseInstagramItem));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const presence = subscribeToTripPresence(session, (members) => {
      const visibleMembers = members as Array<{
        name?: string;
        color?: string;
        activeDay?: number | null;
      }>;
      setCollaborators(visibleMembers);
      setOnline(visibleMembers.length);
    });
    presenceRef.current = presence;
    return () => {
      presenceRef.current = null;
      presence();
    };
  }, [session]);

  const selectDay = (index: number) => {
    setActive(index);
    presenceRef.current?.updateActiveDay(index);
  };
  const openHistory = async () => {
    if (!session) return;
    try {
      setHistory(await listAuditEvents(session));
      setModal("history");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const cities = useMemo(
    () => new Set(days.map((day) => day.city).filter(Boolean)).size,
    [days],
  );
  const completed = 0;
  const updateDay = (
    index: number,
    field: "city" | "title" | "date",
    value: string,
  ) => {
    if (field === "date" && !isJourneyDate(value)) {
      setError("Choose a date within your journey range.");
      return;
    }
    const updatedDay = {
      ...days[index],
      [field]: value,
      emoji: field === "city" ? (emojis[value] ?? "✦") : days[index].emoji,
    };
    const updatedDays = days.map((day, i) => (i === index ? updatedDay : day));
    if (field === "date") {
      const sorted = sortDaysByDate(updatedDays);
      const activeDayId = days[active]?.id;
      if (activeDayId) {
        const nextActive = sorted.findIndex((day) => day.id === activeDayId);
        if (nextActive >= 0) setActive(nextActive);
      }
      setDays(sorted);
    } else {
      setDays(updatedDays);
    }
    const next = { ...days[index], [field]: value };
    if (session && next.id)
      void saveDay(session, {
        id: next.id,
        date: field === "date" ? value : next.date,
        city: field === "city" ? value : next.city,
        title: field === "title" ? value : next.title,
      })
        .then(() => {
          showToast("Day saved");
          return recordAuditEvent(session, "updated_day", {
            day: next.date,
            city: next.city,
            title: next.title,
          });
        })
        .catch((e) => setError(e.message));
  };
  const resetInstagramComposer = () => {
    setEditingInstagram(null);
    setInstagramUrl("");
    setInstagramPreview(null);
    setInstagramError("");
    setInstagramPlaces([]);
    setInstagramTags([]);
    setUseInstagramLocation(false);
  };
  const openInstagram = (index: number) => {
    setInstagramDay(index);
    setInstagramLibraryMode(false);
    resetInstagramComposer();
  };
  const openInstagramLibrary = () => {
    setInstagramDay(null);
    setInstagramLibraryMode(true);
    resetInstagramComposer();
  };
  const editInstagram = async (item: InstagramItem, dayIndex?: number) => {
    setInstagramDay(dayIndex ?? null);
    setInstagramLibraryMode(dayIndex === undefined);
    setEditingInstagram(item.id ? { itemId: item.id, dayIndex: dayIndex ?? null } : null);
    setInstagramUrl(item.url);
    setInstagramPreview(null);
    setInstagramError("");
    setInstagramPlaces(item.places ?? []);
    setInstagramTags(item.tags ?? []);
    setUseInstagramLocation(false);
    setInstagramLoading(true);
    try {
      setInstagramPreview(await resolveInstagramUrl(item.url));
    } catch (e) {
      setInstagramError((e as Error).message || "We couldn't preview that link.");
    } finally {
      setInstagramLoading(false);
    }
  };
  const previewInstagram = async () => {
    const value = instagramUrl.trim();
    if (!/^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\//i.test(value)) {
      setInstagramError("Paste an Instagram post, Reel, or video URL.");
      return;
    }
    setInstagramLoading(true);
    setInstagramError("");
    try {
      setInstagramPreview(await resolveInstagramUrl(value));
    } catch (e) {
      setInstagramError(
        (e as Error).message || "We couldn't preview that link.",
      );
    } finally {
      setInstagramLoading(false);
    }
  };
  const toggleInstagramPlace = (place: JapanPlace) => {
    setInstagramPlaces((current) =>
      current.includes(place.english)
        ? current.filter((name) => name !== place.english)
        : [...current, place.english],
    );
  };
  const toggleInstagramTag = (tag: string) => {
    setInstagramTags((current) =>
      current.includes(tag)
        ? current.filter((value) => value !== tag)
        : [...current, tag],
    );
  };
  const instagramDetectedPlaces = useMemo(() => {
    if (!instagramPreview) return [];
    const metadata = [
      instagramPreview.title,
      instagramPreview.author,
      instagramPreview.description,
      instagramPreview.location,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    return japanPlaces.filter((place) =>
      placeSearchTerms(place).some((term) => metadata.includes(term.toLocaleLowerCase())),
    );
  }, [instagramPreview]);
  const saveInstagram = async () => {
    const index = instagramDay;
    const day = index === null ? undefined : days[index];
    if (!session || !instagramPreview || (!instagramLibraryMode && (index === null || !day?.id))) return;
    try {
      const canonicalUrl = canonicalInstagramUrl(instagramPreview.url);
      const duplicate = [...instagramLibrary, ...days.flatMap((entry) => entry.instagramItems)].find(
        (item) => canonicalInstagramUrl(item.url) === canonicalUrl && item.id !== editingInstagram?.itemId,
      );
      if (duplicate && !editingInstagram) {
        setInstagramError("This Instagram video is already saved in this journey.");
        return;
      }
      const metadata = JSON.stringify({
        url: instagramPreview.url,
        title: instagramPreview.title,
        description: instagramPreview.description,
        author: instagramPreview.author,
        thumbnailUrl: instagramPreview.thumbnailUrl,
        location: instagramPreview.location,
        places: instagramPlaces,
        tags: instagramTags,
      });
      const saved = instagramLibraryMode
        ? await saveJourneyInstagramItem(session, metadata, canonicalUrl)
        : await saveItem(session, {
            id: editingInstagram?.itemId,
            dayId: day!.id!,
            kind: "instagram",
            content: metadata,
            completed: false,
          });
      const savedId = typeof saved === "string" ? saved : saved?.id;
      const nextItem: InstagramItem = {
        id: savedId ?? editingInstagram?.itemId,
        url: instagramPreview.url,
        title: instagramPreview.title,
        description: instagramPreview.description,
        author: instagramPreview.author,
        thumbnailUrl: instagramPreview.thumbnailUrl,
        places: instagramPlaces,
        tags: instagramTags,
      };
      if (instagramLibraryMode) {
        setInstagramLibrary((current) => editingInstagram
          ? current.map((item) => item.id === editingInstagram.itemId ? nextItem : item)
          : [
              ...current.filter((item) => canonicalInstagramUrl(item.url) !== canonicalUrl),
              nextItem,
            ]);
      }
      void recordAuditEvent(session, "added_instagram", {
        title: instagramPreview.title,
        url: instagramPreview.url,
      });
      showToast(editingInstagram ? "Instagram inspiration updated" : "Instagram inspiration saved");
      setDays((current) =>
        current.map((item, i) =>
          !instagramLibraryMode && i === index
            ? {
                ...item,
                instagramItems: editingInstagram
                  ? item.instagramItems.map((entry) => entry.id === editingInstagram.itemId ? nextItem : entry)
                  : [...item.instagramItems, nextItem],
                subLocation: useInstagramLocation
                  ? instagramPreview.location
                  : item.subLocation,
              }
            : item,
        ),
      );
      setInstagramDay(null);
      setInstagramLibraryMode(false);
      setEditingInstagram(null);
    } catch (e) {
      setInstagramError((e as Error).message);
    }
  };
  const sendLibraryItemToDay = async (dayIndex: number) => {
    if (!session || !moveLibraryItem?.id || !days[dayIndex]?.id) return;
    if (days[dayIndex].instagramItems.some((item) => canonicalInstagramUrl(item.url) === canonicalInstagramUrl(moveLibraryItem.url))) {
      setError("This Instagram video is already saved on that day.");
      return;
    }
    try {
      const newId = await moveJourneyInstagramToDay(session, moveLibraryItem.id, days[dayIndex].id!);
      setDays((current) => current.map((day, index) => index === dayIndex
        ? { ...day, instagramItems: [...day.instagramItems, { ...moveLibraryItem, id: newId ?? undefined }] }
        : day));
      setInstagramLibrary((current) => current.filter((item) => item.id !== moveLibraryItem.id));
      setMoveLibraryItem(null);
      showToast("Instagram inspiration sent to the selected day");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const moveDayItemToLibrary = async (dayIndex: number, item: InstagramItem) => {
    if (!session || !item.id) return;
    try {
      const content = JSON.stringify(item);
      const saved = await saveJourneyInstagramItem(session, content, canonicalInstagramUrl(item.url));
      await deleteItem(session, item.id, days[dayIndex].id!);
      setDays((current) => current.map((day, index) => index === dayIndex
        ? { ...day, instagramItems: day.instagramItems.filter((entry) => entry.id !== item.id) }
        : day));
      setInstagramLibrary((current) => [...current.filter((entry) => canonicalInstagramUrl(entry.url) !== canonicalInstagramUrl(item.url)), { ...item, id: saved ?? item.id }]);
      showToast("Instagram inspiration moved to the journey library");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const moveInstagram = async (targetDayIndex: number) => {
    if (!draggedInstagram || draggedInstagram.dayIndex === targetDayIndex) {
      setDraggedInstagram(null);
      setInstagramDragOver(null);
      return;
    }
    const sourceDay = days[draggedInstagram.dayIndex];
    const targetDay = days[targetDayIndex];
    const item = sourceDay?.instagramItems.find(
      (entry) => entry.id === draggedInstagram.itemId,
    );
    if (!sourceDay?.id || !targetDay?.id || !item?.id || !session) return;
    try {
      await moveItem(session, item.id, sourceDay.id, targetDay.id);
      void recordAuditEvent(session, "moved_instagram", {
        title: item.title,
        from: sourceDay.date,
        to: targetDay.date,
      });
      showToast("Instagram inspiration moved");
      setDays((current) =>
        current.map((day, index) => {
          if (index === draggedInstagram.dayIndex)
            return {
              ...day,
              instagramItems: day.instagramItems.filter(
                (entry) => entry.id !== item.id,
              ),
            };
          if (index === targetDayIndex)
            return { ...day, instagramItems: [...day.instagramItems, item] };
          return day;
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDraggedInstagram(null);
      setInstagramDragOver(null);
    }
  };
  const addDay = async () => {
    if (!session) {
      setModal("join");
      return;
    }
    const date = from || journeyStart || new Date().toISOString().slice(0, 10);
    if (!isJourneyDate(date)) {
      setError("Choose a date within your journey range.");
      return;
    }
    try {
      const saved = await saveDay(session, { date, city: "", title: "" });
      setDays((current) => [
        ...current,
        {
          id: saved?.id,
          date,
          city: "",
          emoji: "✦",
          title: "",
          items: [],
          instagramItems: [],
        },
      ]);
      selectDay(days.length);
      showToast("Day added");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const removeDay = async (index: number) => {
    const day = days[index];
    if (!day || !session) return;
    if (
      !window.confirm(
        `Delete day ${day.date}? This removes its saved items too.`,
      )
    )
      return;
    try {
      if (day.id) await deleteDay(session, day.id);
      void recordAuditEvent(session, "deleted_day", { date: day.date });
      setDays((current) => current.filter((_, i) => i !== index));
      setActive((current) => Math.max(0, Math.min(current, days.length - 2)));
      showToast("Day deleted", async () => {
        try {
          const restored = await saveDay(session, {
            date: day.date,
            city: day.city,
            title: day.title,
          });
          const restoredItems = await Promise.all(
            day.instagramItems.map(async (item) => {
              const saved = await saveItem(session, {
                dayId: restored.id,
                kind: "instagram",
                content: JSON.stringify(item),
                completed: false,
              });
              return { ...item, id: saved?.id };
            }),
          );
          setDays((current) => {
            const next = [...current];
            next.splice(index, 0, { ...day, id: restored.id, instagramItems: restoredItems });
            return next;
          });
          showToast("Day restored");
        } catch (e) {
          setError((e as Error).message);
        }
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const moveDay = (target: number) => {
    if (dragged === null || dragged === target) return;
    setDays((current) => {
      const next = [...current];
      const [item] = next.splice(dragged, 1);
      next.splice(target, 0, item);
      return next;
    });
    setDragged(null);
    setDragOver(null);
  };
  const nudgeDay = (index: number, amount: number) => {
    const target = index + amount;
    if (target < 0 || target >= days.length) return;
    setDays((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
    selectDay(target);
  };
  const create = async () => {
    setError("");
    if (!tripName || (!accountUser && !name) || !from || !to || !chosen.length)
      return setError("Add a name, dates, and at least one destination.");
    try {
      const ownerName = accountUser ? accountDisplayName : name;
      const created = await createTrip(tripName, from, to, ownerName);
      const createdDays = await Promise.all(
        chosen.map(async (city) => {
          const saved = await saveDay(created, { date: from, city, title: "" });
          return {
            id: saved?.id,
            date: from,
            city,
            emoji: emojis[city],
            title: "",
            items: [],
            instagramItems: [],
          } as Day;
        }),
      );
      const activeSession = {
        ...created,
        journeyName: tripName,
        startDate: from,
        endDate: to,
      };
      setSession(activeSession);
      localStorage.setItem(
        "ryoko_session",
        JSON.stringify(activeSession),
      );
      if (accountUser) {
        try {
          await linkCurrentTrip(created.tripId, created.code);
        } catch {
          setAccountMessage(
            "Journey created, but it could not be linked to your account. Open Account and link it with the journey code.",
          );
        }
      }
      setJourneyName(tripName);
      setDays(createdDays);
      selectDay(0);
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const join = async () => {
    setError("");
    if (!name || !code) return;
    try {
      const joined = await joinTrip(code, name);
      const activeSession = {
        ...joined,
        journeyName: joined.journeyName || "Your Japan journey",
      };
      setSession(activeSession);
      setJourneyName(activeSession.journeyName);
      localStorage.setItem("ryoko_session", JSON.stringify(activeSession));
      if (accountUser) {
        try {
          await linkCurrentTrip(joined.tripId, joined.code);
        } catch {
          setAccountMessage(
            "Journey joined, but it could not be linked to your account. You can link it from Account.",
          );
        }
      }
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const startOver = () => {
    localStorage.removeItem("ryoko_session");
    setSession(null);
    setDays([]);
    setModal("start");
  };

  return (
    <main className="shell">
      <header className="topbar">
        <button
          className="brand ghost"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <span>✿</span> ryōkō <small>旅行</small>
        </button>
        <button
          className="trip-switcher"
          onClick={() => setModal(accountUser ? "journeys" : "join")}
        >
          <i /> <b>{journeyName}</b>⌄
        </button>
        <div className="top-actions">
          <span className="save">
            <span>{accountUser ? "● Connected" : "○ Not connected"}</span>
            <small>Release {__RELEASE_STAMP__}</small>
            {pwaCompatible && (
              <button
                className="pwa-action"
                type="button"
                onClick={() => pwaInstalled ? setPwaHelpOpen(true) : void installRyoko()}
              >
                {pwaInstalled ? "How to share Instagram videos" : "Install Ryōkō"}
              </button>
            )}
          </span>
          <button
            className="avatar owner"
            onClick={() => void openAccount()}
            aria-label="Open account"
          >
            {accountUser ? accountInitial : (session?.displayName?.[0] ?? "?")}
          </button>
        </div>
      </header>
      <section className="hero">
        <div>
          <p className="eyebrow">
            {session ? "YOUR SHARED JAPAN ITINERARY" : "A SHARED JAPAN PLANNER"}
          </p>
          {session && <p className="journey-label">{journeyName}</p>}
          <h1>
            {session ? (
              <>
                Your Ja<em>plan</em> <span>✦</span>
              </>
            ) : (
              <>
                Plan a <em>Japan</em> story <span>✦</span>
              </>
            )}
          </h1>
          <p className="subtitle">
            {loading
              ? "Loading your journey…"
              : session
                ? "A live place for all the places you’ll go."
                : "Start a new journey or rejoin one you already share."}
          </p>
        </div>
        <div className="actions">
          <button className="secondary" onClick={() => setModal("join")}>
            Rejoin
          </button>
          <button
            className="primary"
            onClick={() => {
              setInviteError("");
              setModal("invite");
            }}
            disabled={!session}
          >
            ＋ Add people
          </button>
        </div>
      </section>
      {session && days.length > 0 && (
        <section className="stats">
          <div>
            <b>{days.length}</b>
            <small>days planned</small>
          </div>
          <div>
            <b>{cities}</b>
            <small>destinations</small>
          </div>
          <div>
            <b>{completed}%</b>
            <small>complete</small>
          </div>
          <div className="collabs">
            <small>
              {online} / {totalMembers || 1} collaborators online <i />
            </small>
          </div>
        </section>
      )}
      <div className="workspace">
        <section className="timeline-panel">
          <div className="heading">
            <div>
              <p className="eyebrow">YOUR ITINERARY</p>
              <h2>
                Let’s make it <em>happen</em>.
              </h2>
            </div>
            <button className="round" onClick={addDay} aria-label="Add a day">
              ＋
            </button>
          </div>
          {!!days.length && (
            <p className="drag-hint">
              Drag the handle to reorder your days, or use the arrows.
            </p>
          )}
          <div className="timeline">
            {days.map((day, index) => (
              <article
                draggable
                className={`day ${active === index ? "selected" : ""} ${dragged === index ? "dragging" : ""} ${dragOver === index && dragged !== index ? "drop-target" : ""}`}
                key={day.id ?? `${day.date}-${index}`}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(index));
                  setDragged(index);
                }}
                onDragEnter={() => {
                  if (draggedInstagram) setInstagramDragOver(index);
                  else setDragOver(index);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggedInstagram) setInstagramDragOver(index);
                  else setDragOver(index);
                }}
                onDragEnd={() => {
                  setDragged(null);
                  setDragOver(null);
                  setInstagramDragOver(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedInstagram) void moveInstagram(index);
                  else moveDay(index);
                }}
                onClick={() => selectDay(index)}
              >
                {dragOver === index && dragged !== index && (
                  <div className="drop-indicator">
                    Drop here to move this day
                  </div>
                )}
                <div className="date">
                  <button
                    className="date-label"
                    type="button"
                    title="Change this day’s date"
                    onClick={(e) => {
                      e.stopPropagation();
                      (
                        e.currentTarget
                          .nextElementSibling as HTMLInputElement | null
                      )?.showPicker?.();
                    }}
                  >
                    {day.date.slice(8, 10)}/{day.date.slice(5, 7)}
                  </button>
                  <input
                    className="date-picker-input"
                    type="date"
                    min={journeyStart}
                    max={journeyEnd}
                    value={day.date}
                    aria-label={`Change date for day ${index + 1}`}
                    onChange={(e) => updateDay(index, "date", e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="card">
                  <div className="card-top">
                    <span className={`pill p${index}`}>
                      {day.emoji}
                      <input
                        className="inline-input pill-input"
                        placeholder="Destination"
                        value={day.city}
                        onChange={(e) =>
                          updateDay(index, "city", e.target.value)
                        }
                        onFocus={() => {
                          setDestinationFocus(index);
                          if (!day.city && index > 0 && days[index - 1]?.city)
                            updateDay(index, "city", days[index - 1].city);
                        }}
                        onBlur={() =>
                          window.setTimeout(
                            () => setDestinationFocus(null),
                            150,
                          )
                        }
                        onClick={(e) => e.stopPropagation()}
                      />
                      {destinationFocus === index &&
                        destinationMatches(day.city).length > 0 && (
                          <div className="destination-suggestions">
                            {destinationMatches(day.city).map((city) => (
                              <button
                                key={city}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateDay(index, "city", city);
                                  setDestinationFocus(null);
                                }}
                              >
                                {emojis[city]} {city}
                              </button>
                            ))}
                          </div>
                        )}
                    </span>
                    <span className="day-actions">
                      <button
                        className="move-button drag-handle"
                        title="Drag to reorder"
                        aria-label={`Drag day ${index + 1} to reorder`}
                      >
                        ⠿
                      </button>
                      <button
                        className="move-button"
                        title="Move day up"
                        aria-label="Move day up"
                        onClick={(e) => {
                          e.stopPropagation();
                          nudgeDay(index, -1);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        className="move-button"
                        title="Move day down"
                        aria-label="Move day down"
                        onClick={(e) => {
                          e.stopPropagation();
                          nudgeDay(index, 1);
                        }}
                      >
                        ↓
                      </button>
                      <button
                        className="move-button delete-day-button"
                        title="Delete day"
                        aria-label="Delete day"
                        onClick={(e) => {
                          e.stopPropagation();
                          void removeDay(index);
                        }}
                      >
                        ×
                      </button>
                    </span>
                  </div>
                  {!!collaborators.filter((member) => member.activeDay === index).length && (
                    <div className="day-collaborators" aria-label="Collaborators viewing this day">
                      {collaborators
                        .filter((member) => member.activeDay === index)
                        .map((member, memberIndex) => (
                          <span
                            className="collaborator-cursor"
                            key={`${member.name ?? "traveller"}-${memberIndex}`}
                            style={{ background: member.color ?? "#735fa6" }}
                            title={`${member.name ?? "Traveller"} is viewing this day`}
                          >
                            {(member.name ?? "?").charAt(0).toUpperCase()}
                          </span>
                        ))}
                      <small>Viewing this day</small>
                    </div>
                  )}
                    <input
                      className="inline-input title-input"
                      placeholder="Give this day a title"
                      value={day.title}
                      onChange={(e) => updateDay(index, "title", e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      className="instagram-inline-action"
                      type="button"
                      title="Add Instagram inspiration to this day"
                      aria-label="Add Instagram inspiration to this day"
                      onClick={(e) => {
                        e.stopPropagation();
                        openInstagram(index);
                      }}
                    >
                      <InstagramGlyph />
                      <span className="instagram-add-plus">＋</span>
                    </button>
                  {day.subLocation && (
                    <p className="sub-location">⌖ {day.subLocation}</p>
                  )}
                  {!day.instagramItems.length && (
                    <small className="empty-hint">
                      Save a post or Reel here to keep ideas attached to this day.
                    </small>
                  )}
                  {!!day.instagramItems.length && (
                    <div className="instagram-items">
                      {[...day.instagramItems]
                        .map((item, originalIndex) => ({
                          item,
                          originalIndex,
                          score: (instagramVotes[canonicalInstagramUrl(item.url)]?.upvotes ?? 0)
                            - (instagramVotes[canonicalInstagramUrl(item.url)]?.downvotes ?? 0),
                          upvotes: instagramVotes[canonicalInstagramUrl(item.url)]?.upvotes ?? 0,
                        }))
                        .sort((a, b) => b.score - a.score || b.upvotes - a.upvotes || a.originalIndex - b.originalIndex)
                        .map(({ item }) => (
                        <article
                          className={`instagram-item ${instagramDragOver === index ? "instagram-drop-target" : ""}`}
                          key={item.id ?? item.url}
                          draggable={!!item.id}
                          onDragStart={(event) => {
                            event.stopPropagation();
                            if (!item.id) return;
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/instagram", item.id);
                            setDraggedInstagram({ dayIndex: index, itemId: item.id });
                          }}
                          onDragEnd={() => {
                            setDraggedInstagram(null);
                            setInstagramDragOver(null);
                          }}
                        >
                          <div
                            className={`instagram-card-content ${revealedInstagramCards.has(item.id ?? item.url) ? "details-revealed" : "details-hidden"}`}
                            onClick={(event) => toggleInstagramCardDetails(item, event)}
                          >
                            <>
                              {item.thumbnailUrl ? (
                                <img src={item.thumbnailUrl} alt="" />
                              ) : (
                                <span className="instagram-item-placeholder">
                                  ◎
                                </span>
                              )}
                              <span>
                                <b className={expandedInstagramCaptions.has(item.id ?? item.url) ? "instagram-card-title expanded" : "instagram-card-title"}>{item.title}</b>
                                <small>by {item.author}</small>
                                {item.description && (
                                  <>
                                    <p className={(expandedInstagramCaptions.has(item.id ?? item.url) ? "instagram-caption expanded" : "instagram-caption")}>{item.description}</p>
                                    <button
                                      className="caption-toggle"
                                      type="button"
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        toggleInstagramCaption(item);
                                      }}
                                    >
                                      {expandedInstagramCaptions.has(item.id ?? item.url) ? "Show Less" : "Show More"}
                                    </button>
                                  </>
                                )}
                              </span>
                            </>
                          </div>
                          {!!(item.places?.length || item.tags?.length) && (
                            <div className="instagram-card-tags" aria-label="Instagram tags">
                              {item.places?.map((place) => <em key={`place-${place}`}>#{place}</em>)}
                              {item.tags?.map((tag) => <em key={`tag-${tag}`}>#{tag}</em>)}
                            </div>
                          )}
                          <InstagramVoteControls
                            summary={instagramVotes[canonicalInstagramUrl(item.url)]}
                            onVote={(vote) => void voteOnInstagram(item, vote)}
                          />
                          <div className="instagram-actions">
                          {instagramEmbedUrl(item.url) && (
                            <button
                              className="instagram-action-button instagram-play"
                              title="Play preview in Ryōkō"
                              aria-label="Play preview in Ryōkō"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPlayingInstagram(item);
                              }}
                            >
                              ▶
                            </button>
                          )}
                          <button
                            className="instagram-action-button library-send"
                            title="Move to journey library"
                            aria-label="Move to journey library"
                            onClick={(e) => {
                              e.stopPropagation();
                              void moveDayItemToLibrary(index, item);
                            }}
                          >
                            ↓
                          </button>
                          <button
                            className="instagram-action-button instagram-remove"
                            title="Remove Instagram inspiration"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (
                                !window.confirm(
                                  "Remove this Instagram inspiration?",
                                )
                              )
                                return;
                              try {
                                if (item.id && session && day.id)
                                  await deleteItem(session, item.id, day.id);
                                setDays((current) =>
                                  current.map((entry, i) =>
                                    i === index
                                      ? {
                                          ...entry,
                                          instagramItems:
                                            entry.instagramItems.filter(
                                              (savedItem) =>
                                                savedItem.id !== item.id,
                                            ),
                                        }
                                      : entry,
                                  ),
                                );
                                showToast("Instagram inspiration removed", async () => {
                                  if (!session || !day.id) return;
                                  try {
                                    const restored = await saveItem(session, {
                                      dayId: day.id,
                                      kind: "instagram",
                                      content: JSON.stringify(item),
                                      completed: false,
                                    });
                                    setDays((current) =>
                                      current.map((entry, dayIndex) =>
                                        dayIndex === index
                                          ? { ...entry, instagramItems: [...entry.instagramItems, { ...item, id: restored?.id }] }
                                          : entry,
                                      ),
                                    );
                                    showToast("Instagram inspiration restored");
                                  } catch (error) {
                                    setError((error as Error).message);
                                  }
                                });
                              } catch (error) {
                                setError((error as Error).message);
                              }
                            }}
                          >
                            ×
                          </button>
                          <button
                            className="instagram-action-button instagram-edit"
                            title="Preview again and edit tags"
                            aria-label="Preview again and edit tags"
                            onClick={(e) => {
                              e.stopPropagation();
                              void editInstagram(item, index);
                            }}
                          >
                            ✎
                          </button>
                          </div>
                        </article>
                        ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!loading && !days.length && (
            <p className="empty-state">
              No days yet. Add a day to begin your live itinerary.
            </p>
          )}
          <button className="add-day" onClick={addDay}>
            ＋ Add another day
          </button>
        </section>
        <aside className="map-panel">
          <div className="heading">
            <div>
              <p className="eyebrow">THE BIG PICTURE</p>
              <h2>
                {days.length ? (
                  <>
                    Wander <em>here</em> ↗
                  </>
                ) : (
                  <>
                    Your map <em>awaits</em>.
                  </>
                )}
              </h2>
            </div>
            <button
              className="round"
              onClick={() => selectDay(0)}
              aria-label="Center map"
            >
              ⌖
            </button>
          </div>
          <div className="map-language-toggle" role="group" aria-label="Map place names">
            <span>Map</span>
            <button
              className={mapProvider === "openstreetmap" ? "selected" : ""}
              onClick={() => setMapProvider("openstreetmap")}
              aria-pressed={mapProvider === "openstreetmap"}
            >
              OpenStreetMap
            </button>
            <button
              className={mapProvider === "google" ? "selected" : ""}
              onClick={() => setMapProvider("google")}
              aria-pressed={mapProvider === "google"}
            >
              Google Maps
            </button>
            <span>Names</span>
            <button
              className={mapLabelLanguage === "english" ? "selected" : ""}
              onClick={() => setMapLabelLanguage("english")}
              aria-pressed={mapLabelLanguage === "english"}
            >
              English
            </button>
            <button
              className={mapLabelLanguage === "japanese" ? "selected" : ""}
              onClick={() => setMapLabelLanguage("japanese")}
              aria-pressed={mapLabelLanguage === "japanese"}
            >
              日本語
            </button>
          </div>
          <JapanMap
            days={days}
            onSelect={selectDay}
            labelLanguage={mapLabelLanguage}
            provider={mapProvider}
            selectedIndex={active}
          />
          <div className="legend">
            {days.length
              ? `${cities} destinations in your journey`
              : "Destinations will appear here"}
          </div>
          <section className="instagram-library" aria-labelledby="instagram-library-title">
            <div className="library-heading">
              <div>
                <p className="eyebrow">JOURNEY INSPIRATION</p>
                <h3 id="instagram-library-title">Instagram <em>library</em></h3>
              </div>
              <button className="secondary" onClick={openInstagramLibrary} disabled={!session}>
                <InstagramGlyph />
                <span>Add video</span>
              </button>
            </div>
            {!instagramLibrary.length ? (
              <p className="empty-hint">Save videos here first, then send them to a dated day when you are ready.</p>
            ) : (
              <div className="instagram-items">
                {instagramLibrary.map((item) => (
                  <article className="instagram-item" key={item.id ?? item.url}>
                    <div
                      className={`instagram-card-content ${revealedInstagramCards.has(item.id ?? item.url) ? "details-revealed" : "details-hidden"}`}
                      onClick={(event) => toggleInstagramCardDetails(item, event)}
                    >
                      {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" /> : <span className="instagram-item-placeholder">◎</span>}
                      <span><b className={expandedInstagramCaptions.has(item.id ?? item.url) ? "instagram-card-title expanded" : "instagram-card-title"}>{item.title}</b><small>by {item.author}</small>{item.description && <><p className={expandedInstagramCaptions.has(item.id ?? item.url) ? "instagram-caption expanded" : "instagram-caption"}>{item.description}</p><button className="caption-toggle" type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleInstagramCaption(item); }}>{expandedInstagramCaptions.has(item.id ?? item.url) ? "Show Less" : "Show More"}</button></>}</span>
                    </div>
                    {!!(item.places?.length || item.tags?.length) && (
                      <div className="instagram-card-tags" aria-label="Instagram tags">
                        {item.places?.map((place) => <em key={`place-${place}`}>#{place}</em>)}
                        {item.tags?.map((tag) => <em key={`tag-${tag}`}>#{tag}</em>)}
                      </div>
                    )}
                    <InstagramVoteControls
                      summary={instagramVotes[canonicalInstagramUrl(item.url)]}
                      onVote={(vote) => void voteOnInstagram(item, vote)}
                    />
                    <div className="instagram-actions">
                    {instagramEmbedUrl(item.url) && (
                      <button
                        className="instagram-action-button instagram-play"
                        title="Play preview in Ryōkō"
                        aria-label="Play preview in Ryōkō"
                        onClick={() => setPlayingInstagram(item)}
                      >
                        ▶
                      </button>
                    )}
                    <button className="instagram-action-button library-send" title="Send to a day" aria-label="Send to a day" onClick={() => setMoveLibraryItem(item)}>→</button>
                    <button className="instagram-action-button instagram-remove" title="Remove from journey library" aria-label="Remove from journey library" onClick={async () => {
                      if (!item.id || !session || !window.confirm("Remove this Instagram inspiration?")) return;
                      try {
                        await deleteJourneyInstagramItem(session, item.id);
                        setInstagramLibrary((current) => current.filter((entry) => entry.id !== item.id));
                        showToast("Instagram inspiration removed");
                      } catch (e) { setError((e as Error).message); }
                    }}>×</button>
                    <button className="instagram-action-button instagram-edit" title="Preview again and edit tags" aria-label="Preview again and edit tags" onClick={() => void editInstagram(item)}>✎</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
      <footer>
        <button className="footer-link" onClick={startOver}>
          Start a different journey
        </button>
        <a
          className="kaishi-footer-link"
          href="https://www.kaishi.uk"
          target="_blank"
          rel="noreferrer"
        >
          <span>✿</span> Learn Japanese with Kaishi
        </a>
        <span>{error || "Your journey data is stored securely."}</span>
        {session && (
          <button className="footer-link" onClick={() => void openHistory()}>
            Activity history
          </button>
        )}
      </footer>
      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              onClick={() => {
                const undo = toast.undo;
                setToast(null);
                undo?.();
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
      {modal === "start" && (
        <div className="backdrop">
          <div className="modal choice-modal">
            <span className="flower">✿</span>
            <p className="eyebrow">WELCOME TO RYŌKŌ</p>
            <h2>
              Where are we <em>going?</em>
            </h2>
            <p className="modal-copy">
              Choose how you want to begin. Your journey will be live and
              shared.
            </p>
            <button className="primary full" onClick={() => setModal("join")}>
              Rejoin a journey
            </button>
            <button
              className="secondary full"
              onClick={() => setModal("create")}
            >
              Start a new journey
            </button>
          </div>
        </div>
      )}
      {modal === "history" && (
        <div className="backdrop">
          <div className="modal history-modal">
            <button className="close" onClick={() => setModal(null)}>
              ×
            </button>
            <span className="flower">✿</span>
            <p className="eyebrow">COLLABORATION HISTORY</p>
            <h2>
              What changed <em>recently.</em>
            </h2>
            {history.length ? (
              <div className="history-list">
                {history.map((event) => (
                  <article key={event.id}>
                    <b>{event.event_type.replaceAll("_", " ")}</b>
                    <small>{new Date(event.created_at).toLocaleString()}</small>
                    <span>
                      {String(event.payload.actor ?? "A traveller")} · {String(event.payload.city ?? event.payload.title ?? event.payload.url ?? "Journey updated")}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="account-empty">No recorded changes yet.</p>
            )}
          </div>
        </div>
      )}
      {modal === "journeys" && (
        <div className="backdrop">
          <div className="modal journey-picker-modal">
            <button className="close" onClick={() => setModal(null)}>
              ×
            </button>
            <span className="flower">✿</span>
            <p className="eyebrow">YOUR JOURNEYS</p>
            <h2>
              Choose a <em>story.</em>
            </h2>
            {accountPlans.length ? (
              <div className="journey-options">
                {visibleAccountPlans.map((plan) => (
                  <button
                    className={
                      plan.trip_id === session?.tripId
                        ? "journey-option selected"
                        : "journey-option"
                    }
                    key={plan.trip_id}
                    onClick={() => openLinkedPlan(plan)}
                  >
                    <b>{plan.name}</b>
                    <small>
                      {plan.start_date} → {plan.end_date}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="account-empty">No linked journeys yet.</p>
            )}
            <button className="secondary full" onClick={() => setModal("create")}>
              Start a new journey
            </button>
          </div>
        </div>
      )}
      {modal === "account" && (
        <div className="backdrop">
          <div className="modal account-modal">
            <button className="close" onClick={() => setModal(null)}>
              ×
            </button>
            <span className="flower">✿</span>
            <p className="eyebrow">YOUR RYŌKŌ ACCOUNT</p>
            <h2>
              Keep every journey <em>close.</em>
            </h2>
            {!accountUser ? (
              <>
                <p className="modal-copy">
                  Sign in to keep your plans and secret journey codes together.
                  You can continue using codes without an account.
                </p>
                <label>
                  Email address
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={accountEmail}
                    onChange={(e) => setAccountEmail(e.target.value)}
                  />
                </label>
                <button
                  className="primary full"
                  onClick={() => void sendAccountLink()}
                  disabled={!accountEmail}
                >
                  Email me a sign-in link
                </button>
                <button
                  className="secondary full"
                  onClick={() => void signInWithGithub()}
                >
                  Continue with GitHub
                </button>
              </>
            ) : (
              <>
                <div className="profile-summary">
                  <button
                    type="button"
                    className="profile-avatar"
                    style={{ background: accountProfile.avatarColor }}
                    title="Change avatar colour"
                    aria-label="Change avatar colour"
                    onClick={() => avatarColorInputRef.current?.click()}
                  >
                    {accountInitial}
                  </button>
                  <input
                    ref={avatarColorInputRef}
                    className="avatar-color-picker"
                    type="color"
                    value={accountProfile.avatarColor}
                    aria-label="Choose avatar colour"
                    onChange={(e) =>
                      setAccountProfile((current) => ({
                        ...current,
                        avatarColor: e.target.value,
                      }))
                    }
                  />
                  <div>
                    <b>{accountDisplayName}</b>
                    <small>{accountUser.email}</small>
                    <small>
                      {accountUser.app_metadata?.provider === "github"
                        ? "Signed in with GitHub"
                        : "Signed in with email magic link"}
                    </small>
                  </div>
                </div>
                <label>
                  Display name
                  <input
                    value={accountProfile.displayName}
                    placeholder={accountDisplayName}
                    onChange={(e) =>
                      setAccountProfile((current) => ({
                        ...current,
                        displayName: e.target.value,
                      }))
                    }
                  />
                </label>
                <button
                  className="secondary full"
                  onClick={() => void saveProfile()}
                >
                  Save profile
                </button>
                {session && (
                  <button
                    className="secondary full"
                    onClick={() => void connectCurrentJourney()}
                  >
                    Link this journey to my account
                  </button>
                )}
                <h3 className="account-heading">My plans</h3>
                {accountPlans.length ? (
                  visibleAccountPlans.map((plan) => (
                    <div className="plan-row" key={plan.trip_id}>
                      <b>{plan.name}</b>
                      <span>
                        <small>
                          {plan.start_date} → {plan.end_date}
                        </small>
                        <button
                          className="plan-open"
                          onClick={() => openLinkedPlan(plan)}
                        >
                          Open
                        </button>
                        <button
                          className="plan-open"
                          onClick={() => void revealCode(plan.trip_id)}
                        >
                          {accountCodes[plan.trip_id] ?? "Reveal code"}
                        </button>
                        <button
                          className="plan-open"
                          title="Archive this journey if you created it"
                          onClick={async () => {
                            if (!window.confirm(`Archive ${plan.name}?`)) return;
                            try {
                              await archiveOwnPlan(plan.trip_id);
                              setAccountPlans((items) =>
                                items.filter((item) => item.trip_id !== plan.trip_id),
                              );
                              setAccountMessage("Journey archived.");
                            } catch (e) {
                              setAccountMessage((e as Error).message);
                            }
                          }}
                        >
                          Archive
                        </button>
                        <button
                          className="plan-open"
                          onClick={() => void unlinkCurrentPlan(plan)}
                        >
                          Unlink
                        </button>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="account-empty">No linked plans yet.</p>
                )}
                {accountPlans.length > 10 && (
                  <p className="account-empty">Showing your 10 most recent plans.</p>
                )}
                {accountIsAdmin && (
                  <button
                    className="primary full"
                    onClick={() => setAdminModal(true)}
                  >
                    Open admin: all plans
                  </button>
                )}
                <div className="inline-admin-legacy">
                  {accountIsAdmin && (
                    <>
                      <h3 className="account-heading">Admin: all plans</h3>
                      {!adminPlans.length && (
                        <p className="account-empty">No plans found.</p>
                      )}
                      {adminPlans.map((plan) => (
                        <div className="plan-row" key={plan.trip_id}>
                          <div>
                            <b>{plan.name}</b>
                            <small>
                              {plan.start_date} → {plan.end_date}
                            </small>
                            <small>
                              Created by {plan.created_by ?? "Unknown"} · {plan.created_at ? new Date(plan.created_at).toLocaleString() : "Unknown time"}
                            </small>
                          </div>
                          <div className="plan-actions">
                            <button
                              className="delete-plan"
                              onClick={async () => {
                                if (!window.confirm(`Archive ${plan.name}?`))
                                  return;
                                await archiveAdminPlan(plan.trip_id);
                                setAdminPlans((items) =>
                                  items.map((item) =>
                                    item.trip_id === plan.trip_id
                                      ? {
                                          ...item,
                                          archived_at: new Date().toISOString(),
                                        }
                                      : item,
                                  ),
                                );
                              }}
                            >
                              {plan.archived_at ? "Archived" : "Archive"}
                            </button>
                            {plan.archived_at && (
                              <button
                                className="plan-open"
                                onClick={async () => {
                                  await restoreAdminPlan(plan.trip_id);
                                  setAdminPlans((items) =>
                                    items.map((item) =>
                                      item.trip_id === plan.trip_id
                                        ? { ...item, archived_at: null }
                                        : item,
                                    ),
                                  );
                                }}
                              >
                                Restore
                              </button>
                            )}
                            <button
                              className="delete-plan"
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    `Permanently delete ${plan.name}?`,
                                  )
                                )
                                  return;
                                await deleteAdminPlan(plan.trip_id);
                                setAdminPlans((items) =>
                                  items.filter(
                                    (item) => item.trip_id !== plan.trip_id,
                                  ),
                                );
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
                {accountMessage && (
                  <p className="form-error">{accountMessage}</p>
                )}
                <button
                  className="secondary full"
                  onClick={() => void downloadAccountExport()}
                >
                  Export my account data
                </button>
                {!accountIsAdmin && (
                  <button
                    className="delete-plan full"
                    onClick={async () => {
                      if (!window.confirm("Request deletion of this account?"))
                        return;
                      await requestAccountDeletion();
                      setAccountMessage("Account deletion request recorded.");
                    }}
                  >
                    Request account deletion
                  </button>
                )}
                <button
                  className="secondary full"
                  onClick={() => void supabase?.auth.signOut()}
                >
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {adminModal && accountIsAdmin && (
        <div className="backdrop" onClick={() => setAdminModal(false)}>
          <div
            className="modal admin-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close" onClick={() => setAdminModal(false)}>
              ×
            </button>
            <span className="flower">✿</span>
            <p className="eyebrow">ADMINISTRATION</p>
            <h2>
              All <em>plans.</em>
            </h2>
            <p className="modal-copy">
              Review, archive, restore, or permanently remove journeys.
            </p>
            {!adminPlans.length && (
              <p className="account-empty">No plans found.</p>
            )}
            {adminPlans.map((plan) => (
              <div className="plan-row" key={plan.trip_id}>
                <div>
                  <b>{plan.name}</b>
                  <small>
                    {plan.start_date} → {plan.end_date}
                    {plan.archived_at ? " · Archived" : ""}
                  </small>
                </div>
                <div className="plan-actions">
                  <button
                    className="plan-open"
                    onClick={async () => {
                      try {
                        setAdminMembers(await listAdminPlanMembers(plan.trip_id));
                        setAdminMembersPlan(plan);
                      } catch (e) {
                        setAccountMessage((e as Error).message);
                      }
                    }}
                  >
                    Members
                  </button>
                  <button
                    className="plan-open"
                    onClick={async () => {
                      if (plan.archived_at) {
                        await restoreAdminPlan(plan.trip_id);
                        setAdminPlans((items) =>
                          items.map((item) =>
                            item.trip_id === plan.trip_id
                              ? { ...item, archived_at: null }
                              : item,
                          ),
                        );
                      } else {
                        await archiveAdminPlan(plan.trip_id);
                        setAdminPlans((items) =>
                          items.map((item) =>
                            item.trip_id === plan.trip_id
                              ? {
                                  ...item,
                                  archived_at: new Date().toISOString(),
                                }
                              : item,
                          ),
                        );
                      }
                    }}
                  >
                    {plan.archived_at ? "Restore" : "Archive"}
                  </button>
                  <button
                    className="delete-plan"
                    onClick={async () => {
                      if (!window.confirm(`Permanently delete ${plan.name}?`))
                        return;
                      await deleteAdminPlan(plan.trip_id);
                      setAdminPlans((items) =>
                        items.filter((item) => item.trip_id !== plan.trip_id),
                      );
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {adminMembersPlan && (
              <section className="admin-members" aria-label={`Users on ${adminMembersPlan.name}`}>
                <div className="admin-members-heading">
                  <h3>{adminMembersPlan.name} users</h3>
                  <button className="plan-open" onClick={() => setAdminMembersPlan(null)}>Close</button>
                </div>
                {!adminMembers.length ? (
                  <p className="account-empty">No users found.</p>
                ) : (
                  adminMembers.map((member) => (
                    <div className="admin-member-row" key={member.member_id}>
                      <div>
                        <b>{member.display_name}</b>
                        <small>{member.role} · {member.revoked_at ? "Revoked" : "Active"}</small>
                      </div>
                      {member.role !== "owner" && (
                        <button
                          className={member.revoked_at ? "plan-open" : "delete-plan"}
                          onClick={async () => {
                            try {
                              if (member.revoked_at) {
                                await restoreAdminPlanMember(adminMembersPlan.trip_id, member.member_id);
                              } else {
                                if (!window.confirm(`Revoke ${member.display_name}'s access?`)) return;
                                await revokeAdminPlanMember(adminMembersPlan.trip_id, member.member_id);
                              }
                              setAdminMembers(await listAdminPlanMembers(adminMembersPlan.trip_id));
                            } catch (e) {
                              setAccountMessage((e as Error).message);
                            }
                          }}
                        >
                          {member.revoked_at ? "Restore" : "Revoke"}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </section>
            )}
          </div>
        </div>
      )}
      {(instagramDay !== null || instagramLibraryMode) && (
        <div className="backdrop" onClick={() => { setInstagramDay(null); setInstagramLibraryMode(false); }}>
          <div
            className="modal instagram-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close" onClick={() => { setInstagramDay(null); setInstagramLibraryMode(false); }}>
              ×
            </button>
            <span className="flower">✿</span>
            <p className="eyebrow">ADD INSTAGRAM INSPIRATION</p>
            <h2>
              Preview before <em>saving.</em>
            </h2>
            <p className="modal-copy">
              Paste a public Instagram post or Reel. We’ll check the link and
              show you how it will appear {instagramLibraryMode ? "in your journey library" : "on this day"}.
            </p>
            <label>
              Instagram URL
              <input
                autoFocus
                type="url"
                placeholder="https://www.instagram.com/reel/..."
                value={instagramUrl}
                onChange={(e) => {
                  setInstagramUrl(e.target.value);
                  setInstagramPreview(null);
                  setInstagramError("");
                }}
              />
            </label>
            {instagramError && <p className="form-error">{instagramError}</p>}
            {instagramPreview ? (
              <div className="instagram-tag-picker" aria-label="Potential place tags">
                <small>Potential place tags</small>
                {instagramDetectedPlaces.length ? (
                  <div className="tag-suggestion-grid">
                    {instagramDetectedPlaces.map((place) => {
                      const selected = instagramPlaces.includes(place.english);
                      return (
                        <button
                          type="button"
                          className={selected ? "tag-suggestion selected" : "tag-suggestion"}
                          key={place.english}
                          onClick={() => toggleInstagramPlace(place)}
                          title={`${place.english} · ${place.japanese}`}
                        >
                          <span>{place.english}</span>
                          {selected && <strong aria-label="Selected">✓</strong>}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <span className="tag-suggestion-empty">No known Japanese place names found in this preview.</span>
                )}
                <small className="standard-tag-label">Standard tags</small>
                <div className="tag-suggestion-grid">
                  {instagramStandardTags.map((tag) => {
                    const selected = instagramTags.includes(tag);
                    return (
                      <button
                        type="button"
                        className={selected ? "tag-suggestion selected" : "tag-suggestion"}
                        key={tag}
                        onClick={() => toggleInstagramTag(tag)}
                        aria-pressed={selected}
                      >
                        <span>#{tag}</span>
                        {selected && <strong aria-label="Selected">✓</strong>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <button
                className="secondary full"
                onClick={() => void previewInstagram()}
                disabled={instagramLoading}
              >
                {instagramLoading ? "Checking link…" : "Preview link"}
              </button>
            )}
            {instagramPreview && (
              <div className="instagram-preview">
                {instagramPreview.thumbnailUrl ? (
                  <img
                    src={instagramPreview.thumbnailUrl}
                    alt="Instagram preview"
                  />
                ) : (
                  <div className="preview-placeholder">◎</div>
                )}
                <div className="instagram-preview-metadata">
                  <b>
                    <InstagramMetadata
                      text={instagramPreview.title}
                      selectedPlaces={instagramPlaces}
                      onTogglePlace={toggleInstagramPlace}
                    />
                  </b>
                  <small>
                    by{" "}
                    <InstagramMetadata
                      text={instagramPreview.author}
                      selectedPlaces={instagramPlaces}
                      onTogglePlace={toggleInstagramPlace}
                    />
                  </small>
                  {instagramPreview.description && (
                    <p>
                      <InstagramMetadata
                        text={instagramPreview.description}
                        selectedPlaces={instagramPlaces}
                        onTogglePlace={toggleInstagramPlace}
                      />
                    </p>
                  )}
                  {instagramPreview.location && (
                    <small>
                      <InstagramMetadata
                        text={instagramPreview.location}
                        selectedPlaces={instagramPlaces}
                        onTogglePlace={toggleInstagramPlace}
                      />
                    </small>
                  )}
                  <span>
                    {instagramPreview.fallback
                      ? "Link saved with a simple preview"
                      : "Preview verified"}
                  </span>
                  <small className="place-tag-hint">
                    Highlighted place names are clickable tags. Hover Japanese names for English.
                  </small>
                  {!!instagramPlaces.length && (
                    <span className="selected-place-tags">
                      {instagramPlaces.map((place) => (
                        <em key={place}>#{place}</em>
                      ))}
                    </span>
                  )}
                  {!!instagramTags.length && (
                    <span className="selected-place-tags">
                      {instagramTags.map((tag) => <em key={tag}>#{tag}</em>)}
                    </span>
                  )}
                </div>
              </div>
            )}
            {instagramPreview?.location && !instagramLibraryMode && (
              <label className="location-choice">
                <input
                  type="checkbox"
                  checked={useInstagramLocation}
                  onChange={(e) => setUseInstagramLocation(e.target.checked)}
                />
                Use “{instagramPreview.location}” as this day’s sub-location
              </label>
            )}
            <button
              className="primary full"
              onClick={() => void saveInstagram()}
              disabled={!instagramPreview}
            >
              {editingInstagram
                ? "Update Instagram inspiration ✦"
                : instagramLibraryMode
                  ? "Save to journey library ✦"
                  : "Save to this day ✦"}
            </button>
          </div>
        </div>
      )}
      {pwaHelpOpen && (
        <div className="backdrop" onClick={() => setPwaHelpOpen(false)}>
          <div className="modal pwa-help-modal" onClick={(event) => event.stopPropagation()}>
            <button className="close" onClick={() => setPwaHelpOpen(false)} aria-label="Close sharing help">×</button>
            <span className="flower">✿</span>
            <p className="eyebrow">SHARE INSTAGRAM INSPIRATION</p>
            <h2>Send a video to <em>Ryōkō.</em></h2>
            <p className="modal-copy">
              Found a Reel or post you want to remember? You can send it straight into your journey while you are browsing Instagram.
            </p>
            <ol className="pwa-help-steps">
              <li>Open the Instagram video you like.</li>
              <li>Tap <b>Share</b>, then choose <b>Ryōkō</b>.</li>
              <li>Ryōkō opens with the link ready to preview and tag.</li>
              <li>Choose the places and tags, then save it to your library or a day.</li>
            </ol>
            <p className="pwa-help-note">
              If you cannot see Ryōkō in the Share list, use your browser menu and choose <b>Add to Home Screen</b> first.
            </p>
          </div>
        </div>
      )}
      {moveLibraryItem && (
        <div className="backdrop" onClick={() => setMoveLibraryItem(null)}>
          <div className="modal move-day-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setMoveLibraryItem(null)}>×</button>
            <span className="flower">✿</span>
            <p className="eyebrow">SEND TO DAY</p>
            <h2>Choose a <em>date.</em></h2>
            <p className="move-day-summary" title={moveLibraryItem.title}>Move “{moveLibraryItem.title}” from the journey library into your itinerary.</p>
            <div className="journey-options">
              {days.map((day, index) => (
                <button className="journey-option" key={day.id ?? day.date} onClick={() => void sendLibraryItemToDay(index)}>
                  <b>{day.date} · {day.city || "Untitled day"}</b><small>{day.title || "Add a title to this day"}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {playingInstagram && instagramEmbedUrl(playingInstagram.url) && (
        <div className="backdrop instagram-player-backdrop" onClick={() => setPlayingInstagram(null)}>
          <div className="instagram-player-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Instagram video preview">
            <button className="close" onClick={() => setPlayingInstagram(null)} aria-label="Close video preview">×</button>
            <div className="instagram-player-frame">
              <iframe
                src={instagramEmbedUrl(playingInstagram.url) ?? undefined}
                title={playingInstagram.title}
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
              />
            </div>
            <div className="instagram-player-caption">
              <b>{playingInstagram.title}</b>
              <small>Instagram · {playingInstagram.author}</small>
            </div>
          </div>
        </div>
      )}
      {modal === "join" && (
        <div className="backdrop">
          <div className="modal">
            <button className="close" onClick={() => setModal(null)}>
              ×
            </button>
            <span className="flower">✿</span>
            <p className="eyebrow">REJOIN A JOURNEY</p>
            <h2>
              Let’s go <em>together.</em>
            </h2>
            <label>
              Your name
              <input
                placeholder="e.g. Terry"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
            <label>
              Personal access code
              <input
                placeholder="8 character code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <button className="primary full" onClick={join}>
              Open journey ✦
            </button>
            <button
              className="secondary full"
              onClick={() => setModal("create")}
            >
              Start a new journey
            </button>
          </div>
        </div>
      )}
      {modal === "create" && (
        <div className="backdrop">
          <div className="modal">
            <button className="close" onClick={() => setModal(null)}>
              ×
            </button>
            <span className="flower">✿</span>
            <p className="eyebrow">START A NEW JOURNEY</p>
            <h2>
              Plan something <em>lovely.</em>
            </h2>
            <label>
              Trip name
              <input
                placeholder="e.g. Spring in Japan"
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                autoFocus
              />
            </label>
            <label>
              {accountUser ? "Profile name" : "Your name"}
              <input
                placeholder={accountUser ? accountDisplayName : "e.g. Terry"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!!accountUser}
              />
            </label>
            <label>
              Dates
              <div className="date-fields">
                <input
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    if (to && e.target.value > to) setTo("");
                  }}
                />
                <input
                  type="date"
                  min={from || new Date().toISOString().slice(0, 10)}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </label>
            <label>
              Destinations
              <p className="selection-summary">
                {chosen.length
                  ? `${chosen.length} selected: ${chosen.join(", ")}`
                  : "None selected yet — choose one or more destinations."}
              </p>
              <div className="destination-grid">
                {destinations.map((city) => (
                  <button
                    type="button"
                    className={
                      chosen.includes(city)
                        ? "destination selected-destination"
                        : "destination"
                    }
                    key={city}
                    onClick={() =>
                      setChosen((current) =>
                        current.includes(city)
                          ? current.filter((item) => item !== city)
                          : [...current, city],
                      )
                    }
                  >
                    <span>
                      {emojis[city]} {city}
                    </span>
                    {chosen.includes(city) && (
                      <strong aria-label="Selected">✓</strong>
                    )}
                  </button>
                ))}
              </div>
            </label>
            <button className="primary full" onClick={create}>
              Create live journey ✦
            </button>
          </div>
        </div>
      )}
      {modal === "invite" && (
        <div className="backdrop">
          <div className="modal">
            <button className="close" onClick={() => setModal(null)}>
              ×
            </button>
            <span className="flower">✿</span>
            <p className="eyebrow">INVITE A TRAVEL BUDDY</p>
            <h2>
              More is more <em>fun.</em>
            </h2>
            <label>
              Name
              <input
                placeholder="e.g. Alex"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
            <label>
              Access level
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "editor" | "viewer")
                }
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            {inviteError && <p className="form-error">{inviteError}</p>}
            <button
              className="primary full"
              onClick={async () => {
                if (!session || !name.trim()) {
                  setInviteError("Enter a name before generating an access code.");
                  return;
                }
                try {
                  const result = await issueMember(session, name, inviteRole, "#df8f9b");
                  setIssuedMember({
                    name: String(result?.name ?? name.trim()),
                    role: (result?.role ?? inviteRole) as "editor" | "viewer",
                    code: String(result?.code ?? ""),
                  });
                  setName("");
                  setModal("code");
                } catch (e) {
                  setInviteError((e as Error).message || "Unable to generate the access code.");
                }
              }}
            >
              Generate access code ✦
            </button>
          </div>
        </div>
      )}
      {modal === "code" && (
        <div className="backdrop">
          <div className="modal code-modal">
            <span className="flower">✿</span>
            <p className="eyebrow">{issuedMember ? "NEW MEMBER ACCESS CODE" : "YOUR OWNER ACCESS CODE"}</p>
            <h2>
              Keep this <em>safe.</em>
            </h2>
            <p className="modal-copy">
              {issuedMember
                ? `${issuedMember.name} can use this ${issuedMember.role} code to join the journey.`
                : "Use this permanent code to rejoin your journey and manage contributors."}
            </p>
            <code className="owner-code">{issuedMember?.code ?? session?.code}</code>
            <button
              className="primary full"
              onClick={() => {
                void navigator.clipboard?.writeText(issuedMember?.code ?? session?.code ?? "");
                setModal(null);
              }}
            >
              Copy access code
            </button>
            <button className="secondary full" onClick={() => setModal(null)}>
              I’ve saved it
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
