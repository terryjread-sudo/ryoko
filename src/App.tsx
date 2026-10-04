import { useEffect, useMemo, useState } from "react";
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
  saveDay,
  saveItem,
  subscribeToTripPresence,
  type RyokoSession,
} from "./lib/ryoko";
import { resolveInstagramUrl, type InstagramPreview } from "./lib/instagram";
import { supabase } from "./lib/supabase";
import {
  deleteAdminPlan,
  exportAccountData,
  archiveAdminPlan,
  getAccountProfile,
  isAdmin,
  linkCurrentTrip,
  listAccountPlans,
  listAdminPlans,
  requestAccountLink,
  revealAccountTripCode,
  restoreAdminPlan,
  saveAccountProfile,
  requestAccountDeletion,
  unlinkPlan,
  signInWithGithub,
  type AccountPlan,
} from "./lib/account";

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
};
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
}: {
  days: Day[];
  onSelect: (index: number) => void;
}) {
  const [zoom, setZoom] = useState(5);
  const width = 800;
  const height = 430;
  const points = days.map((day, index) => ({
    day,
    index,
    coord:
      destinationCoords[day.city] ?? ([35.6762, 139.6503] as [number, number]),
  }));
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
  const tiles = Array.from({ length: 25 }, (_, index) => {
    const col = (index % 5) - 2;
    const row = Math.floor(index / 5) - 2;
    const tileX = Math.floor(centerPoint[0] / 256) + col;
    const tileY = Math.floor(centerPoint[1] / 256) + row;
    return {
      tileX,
      tileY,
      x: width / 2 + tileX * 256 - centerPoint[0],
      y: height / 2 + tileY * 256 - centerPoint[1],
    };
  });
  return (
    <div className="real-map">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Interactive map of Japan"
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
        {points.map(({ day, index, coord }) => {
          const point = project(coord[0], coord[1], zoom);
          return (
            <g
              key={day.id ?? index}
              className="real-pin"
              transform={`translate(${width / 2 + point[0] - centerPoint[0]},${height / 2 + point[1] - centerPoint[1]})`}
              onClick={() => onSelect(index)}
            >
              <circle r="13" />
              <text y="4" textAnchor="middle">
                ✦
              </text>
              <text className="real-pin-label" y="29" textAnchor="middle">
                {day.city || "Choose a destination"}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="map-controls">
        <button
          onClick={() => setZoom((value) => Math.min(8, value + 1))}
          aria-label="Zoom in"
        >
          ＋
        </button>
        <button
          onClick={() => setZoom((value) => Math.max(3, value - 1))}
          aria-label="Zoom out"
        >
          −
        </button>
        <button onClick={() => setZoom(5)} aria-label="Reset map zoom">
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
  const [journeyName, setJourneyName] = useState("Your Japan journey");
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(0);
  const [modal, setModal] = useState<
    "start" | "join" | "create" | "invite" | "code" | "account" | null
  >(() => (getStoredSession() ? null : "start"));
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [tripName, setTripName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [active, setActive] = useState(0);
  const [dragged, setDragged] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [instagramDay, setInstagramDay] = useState<number | null>(null);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [instagramPreview, setInstagramPreview] =
    useState<InstagramPreview | null>(null);
  const [instagramLoading, setInstagramLoading] = useState(false);
  const [instagramError, setInstagramError] = useState("");
  const [useInstagramLocation, setUseInstagramLocation] = useState(false);
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
  const [destinationFocus, setDestinationFocus] = useState<number | null>(null);
  const [accountProfile, setAccountProfile] = useState({
    displayName: "",
    avatarColor: "#735fa6",
  });
  const [accountIsAdmin, setAccountIsAdmin] = useState(false);
  const [accountCodes, setAccountCodes] = useState<Record<string, string>>({});

  const journeyStart = session?.startDate || from || undefined;
  const journeyEnd = session?.endDate || to || undefined;
  const isJourneyDate = (value: string) =>
    (!journeyStart || value >= journeyStart) &&
    (!journeyEnd || value <= journeyEnd);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth
      .getSession()
      .then(({ data }) => setAccountUser(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, authSession) => {
      setAccountUser(authSession?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
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
      return;
    }
    setLoading(true);
    void listDays(session)
      .then(async (rows) => {
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
                instagramItems: instagramItems.map(
                  (item: { id: string; content: string }) => {
                    try {
                      return {
                        id: item.id,
                        ...JSON.parse(item.content),
                      } as InstagramItem;
                    } catch {
                      return {
                        id: item.id,
                        url: item.content,
                        title: "Instagram inspiration",
                        author: "Instagram",
                      };
                    }
                  },
                ),
              } as Day;
            },
          ),
        );
        setDays(loaded);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return subscribeToTripPresence(session, (members) =>
      setOnline(members.length),
    );
  }, [session]);

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
    setDays((current) =>
      current.map((day, i) =>
        i === index
          ? {
              ...day,
              [field]: value,
              emoji: field === "city" ? (emojis[value] ?? "✦") : day.emoji,
            }
          : day,
      ),
    );
    const next = { ...days[index], [field]: value };
    if (session && next.id)
      void saveDay(session, {
        id: next.id,
        date: field === "date" ? value : next.date,
        city: field === "city" ? value : next.city,
        title: field === "title" ? value : next.title,
      }).catch((e) => setError(e.message));
  };
  const openInstagram = (index: number) => {
    setInstagramDay(index);
    setInstagramUrl("");
    setInstagramPreview(null);
    setInstagramError("");
    setUseInstagramLocation(false);
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
  const saveInstagram = async () => {
    const index = instagramDay;
    const day = index === null ? undefined : days[index];
    if (!session || index === null || !day?.id || !instagramPreview) return;
    try {
      const metadata = JSON.stringify({
        url: instagramPreview.url,
        title: instagramPreview.title,
        description: instagramPreview.description,
        author: instagramPreview.author,
        location: instagramPreview.location,
      });
      const saved = await saveItem(session, {
        dayId: day.id,
        kind: "instagram",
        content: metadata,
        completed: false,
      });
      setDays((current) =>
        current.map((item, i) =>
          i === index
            ? {
                ...item,
                instagramItems: [
                  ...item.instagramItems,
                  {
                    id: saved?.id,
                    url: instagramPreview.url,
                    title: instagramPreview.title,
                    description: instagramPreview.description,
                    author: instagramPreview.author,
                    thumbnailUrl: instagramPreview.thumbnailUrl,
                  },
                ],
                subLocation: useInstagramLocation
                  ? instagramPreview.location
                  : item.subLocation,
              }
            : item,
        ),
      );
      setInstagramDay(null);
    } catch (e) {
      setInstagramError((e as Error).message);
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
      setActive(days.length);
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
      setDays((current) => current.filter((_, i) => i !== index));
      setActive((current) => Math.max(0, Math.min(current, days.length - 2)));
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
    setActive(target);
  };
  const create = async () => {
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
      setSession({ ...created, startDate: from, endDate: to });
      if (accountUser) {
        try {
          await linkCurrentTrip(created.tripId, created.code);
        } catch {
          setAccountMessage(
            "Journey created. Link it from your account profile after the account migration is applied.",
          );
        }
      }
      setJourneyName(tripName);
      setDays(createdDays);
      setActive(0);
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const join = async () => {
    if (!name || !code) return;
    try {
      const joined = await joinTrip(code, name);
      setSession(joined);
      if (accountUser) await linkCurrentTrip(joined.tripId, joined.code);
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
        <button className="trip-switcher" onClick={() => setModal("join")}>
          <i /> <b>{journeyName}</b>⌄
        </button>
        <div className="top-actions">
          <span className="save">
            {accountUser ? "● Connected" : "○ Not connected"}
          </span>
          <button
            className="ghost"
            onClick={() => setModal("join")}
            aria-label="Switch journey"
          >
            ⚙
          </button>
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
                Your <em>Japan</em> story <span>✦</span>
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
            onClick={() => setModal("invite")}
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
              {online} collaborators online <i />
            </small>
          </div>
        </section>
      )}
      <div className="workspace">
        <section className="timeline-panel">
          <div className="heading">
            <div>
              <p className="eyebrow">YOUR ITINERARY</p>
              {days[active] && (
                <label className="selected-date">
                  Selected date{" "}
                  <input
                    type="date"
                    min={journeyStart}
                    max={journeyEnd}
                    value={days[active].date}
                    onChange={(e) => updateDay(active, "date", e.target.value)}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.currentTarget.showPicker?.();
                    }}
                  />
                </label>
              )}
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
                onDragEnter={() => setDragOver(index)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(index);
                }}
                onDragEnd={() => {
                  setDragged(null);
                  setDragOver(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  moveDay(index);
                }}
                onClick={() => setActive(index)}
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
                  <input
                    className="inline-input title-input"
                    placeholder="Give this day a title"
                    value={day.title}
                    onChange={(e) => updateDay(index, "title", e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {day.subLocation && (
                    <p className="sub-location">⌖ {day.subLocation}</p>
                  )}
                  <button
                    className="instagram-trigger"
                    onClick={(e) => {
                      e.stopPropagation();
                      openInstagram(index);
                    }}
                  >
                    {day.instagramItems.length
                      ? "View saved Instagram inspiration"
                      : "＋ Add Instagram post or Reel"}
                  </button>
                  {!!day.instagramItems.length && (
                    <div className="instagram-items">
                      {day.instagramItems.map((item) => (
                        <article
                          className="instagram-item"
                          key={item.id ?? item.url}
                        >
                          <a href={item.url} target="_blank" rel="noreferrer">
                            <>
                              {item.thumbnailUrl ? (
                                <img src={item.thumbnailUrl} alt="" />
                              ) : (
                                <span className="instagram-item-placeholder">
                                  ◎
                                </span>
                              )}
                              <span>
                                <b>{item.title}</b>
                                <small>by {item.author}</small>
                              </span>
                            </>
                          </a>
                          <button
                            className="instagram-remove"
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
                              } catch (error) {
                                setError((error as Error).message);
                              }
                            }}
                          >
                            ×
                          </button>
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
              onClick={() => setActive(0)}
              aria-label="Center map"
            >
              ⌖
            </button>
          </div>
          <JapanMap days={days} onSelect={setActive} />
          <div className="legend">
            {days.length
              ? `${cities} destinations in your journey`
              : "Destinations will appear here"}
          </div>
        </aside>
      </div>
      <footer>
        <button className="footer-link" onClick={startOver}>
          Start a different journey
        </button>
        <span>{error || "Your journey data is stored securely."}</span>
      </footer>
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
                  <span
                    className="profile-avatar"
                    style={{ background: accountProfile.avatarColor }}
                  >
                    {accountInitial}
                  </span>
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
                <label>
                  Avatar colour
                  <input
                    type="color"
                    value={accountProfile.avatarColor}
                    onChange={(e) =>
                      setAccountProfile((current) => ({
                        ...current,
                        avatarColor: e.target.value,
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
                  accountPlans.map((plan) => (
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
          </div>
        </div>
      )}
      {instagramDay !== null && (
        <div className="backdrop" onClick={() => setInstagramDay(null)}>
          <div
            className="modal instagram-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close" onClick={() => setInstagramDay(null)}>
              ×
            </button>
            <span className="flower">✿</span>
            <p className="eyebrow">ADD INSTAGRAM INSPIRATION</p>
            <h2>
              Preview before <em>saving.</em>
            </h2>
            <p className="modal-copy">
              Paste a public Instagram post or Reel. We’ll check the link and
              show you how it will appear on this day.
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
            <button
              className="secondary full"
              onClick={() => void previewInstagram()}
              disabled={instagramLoading}
            >
              {instagramLoading ? "Checking link…" : "Preview link"}
            </button>
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
                <div>
                  <b>{instagramPreview.title}</b>
                  <small>by {instagramPreview.author}</small>
                  {instagramPreview.description && (
                    <p>{instagramPreview.description}</p>
                  )}
                  <span>
                    {instagramPreview.fallback
                      ? "Link saved with a simple preview"
                      : "Preview verified"}
                  </span>
                </div>
              </div>
            )}
            {instagramPreview?.location && (
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
              Save to this day ✦
            </button>
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
            <button
              className="primary full"
              onClick={async () => {
                if (session && name)
                  await issueMember(session, name, inviteRole, "#df8f9b");
                setModal(null);
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
            <p className="eyebrow">YOUR OWNER ACCESS CODE</p>
            <h2>
              Keep this <em>safe.</em>
            </h2>
            <p className="modal-copy">
              Use this permanent code to rejoin your journey and manage
              contributors.
            </p>
            <code className="owner-code">{session?.code}</code>
            <button
              className="primary full"
              onClick={() => {
                void navigator.clipboard?.writeText(session?.code ?? "");
                setModal(null);
              }}
            >
              Copy owner code
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
