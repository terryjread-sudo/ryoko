import { useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  createTrip,
  getStoredSession,
  issueMember,
  joinTrip,
  listDays,
  saveDay,
  saveItem,
  subscribeToTripPresence,
  type RyokoSession,
} from "./lib/ryoko";

type Day = {
  id?: string;
  date: string;
  city: string;
  emoji: string;
  title: string;
  items: string[];
  instagramUrl?: string;
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

export default function App() {
  const [session, setSession] = useState<RyokoSession | null>(() =>
    getStoredSession(),
  );
  const [days, setDays] = useState<Day[]>([]);
  const [journeyName, setJourneyName] = useState("Your Japan journey");
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(0);
  const [modal, setModal] = useState<
    "start" | "join" | "create" | "invite" | null
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
  const [error, setError] = useState("");
  const [linkDrafts, setLinkDrafts] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void listDays(session)
      .then((rows) =>
        setDays(
          rows.map(
            (row: {
              id: string;
              day_date: string;
              city: string | null;
              title: string | null;
            }) => ({
              id: row.id,
              date: row.day_date,
              city: row.city ?? "",
              emoji: emojis[row.city ?? ""] ?? "✦",
              title: row.title ?? "",
              items: [],
            }),
          ),
        ),
      )
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
  const addInstagram = async (index: number) => {
    const url = linkDrafts[index]?.trim();
    const day = days[index];
    if (!session || !day?.id || !url) return;
    try {
      await saveItem(session, {
        dayId: day.id,
        kind: "instagram",
        content: url,
        completed: false,
      });
      setDays((current) =>
        current.map((item, i) =>
          i === index ? { ...item, instagramUrl: url } : item,
        ),
      );
      setLinkDrafts((current) => ({ ...current, [index]: "" }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const addDay = async () => {
    if (!session) {
      setModal("join");
      return;
    }
    const date = from || new Date().toISOString().slice(0, 10);
    try {
      const saved = await saveDay(session, { date, city: "", title: "" });
      setDays((current) => [
        ...current,
        { id: saved?.id, date, city: "", emoji: "✦", title: "", items: [] },
      ]);
      setActive(days.length);
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
  };
  const create = async () => {
    if (!tripName || !name || !from || !to || !chosen.length)
      return setError("Add a name, dates, and at least one destination.");
    try {
      const created = await createTrip(tripName, from, to, name);
      setSession(created);
      setJourneyName(tripName);
      setModal(null);
      for (const city of chosen) {
        const saved = await saveDay(created, { date: from, city, title: "" });
        setDays((current) => [
          ...current,
          {
            id: saved?.id,
            date: from,
            city,
            emoji: emojis[city],
            title: "",
            items: [],
          },
        ]);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const join = async () => {
    if (!name || !code) return;
    try {
      const joined = await joinTrip(code, name);
      setSession(joined);
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
            {session ? "● Connected" : "○ Not connected"}
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
            onClick={() => setModal("join")}
            aria-label="Switch journey"
          >
            {session?.displayName?.[0] ?? "?"}
          </button>
        </div>
      </header>
      <section className="hero">
        <div>
          <p className="eyebrow">
            {session ? "YOUR SHARED JAPAN ITINERARY" : "A SHARED JAPAN PLANNER"}
          </p>
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
              {days[active] && <label className="selected-date">Selected date <input type="date" value={days[active].date} onChange={e => updateDay(active, 'date', e.target.value)} /></label>}
              <h2>
                Let’s make it <em>happen</em>.
              </h2>
            </div>
            <button className="round" onClick={addDay} aria-label="Add a day">
              ＋
            </button>
          </div>
          <div className="timeline">
            {days.map((day, index) => (
              <article
                draggable
                className={`day ${active === index ? "selected" : ""}`}
                key={day.id ?? `${day.date}-${index}`}
                onDragStart={() => setDragged(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => moveDay(index)}
                onClick={() => setActive(index)}
              >
                <div className="date">
                  <input className="date-input" type="date" value={day.date} onChange={e => updateDay(index, 'date', e.target.value)} onClick={e => e.stopPropagation()} />
                  <b>{day.date.slice(8, 10)}</b>
                  <small>{day.date.slice(5, 7)}</small>
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
                        onClick={(e) => e.stopPropagation()}
                      />
                    </span>
                    <span className="drag">⠿</span>
                  </div>
                  <input
                    className="inline-input title-input"
                    placeholder="Give this day a title"
                    value={day.title}
                    onChange={(e) => updateDay(index, "title", e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="instagram-row">
                    <input className="inline-input instagram-input" placeholder="Paste an Instagram post or Reel URL" value={linkDrafts[index] ?? day.instagramUrl ?? ''} onChange={e => setLinkDrafts(current => ({ ...current, [index]: e.target.value }))} onClick={e => e.stopPropagation()} />
                    <button className="save-link" onClick={e => { e.stopPropagation(); void addInstagram(index) }}>Save link</button>
                  </div>
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
          <div className="map">
            <div className="mountain">⌁</div>
            {days.map((day, index) => (
              <button
                key={day.id ?? index}
                className={`pin ${index % 2 ? "kyoto" : "tokyo"}`}
                onClick={() => setActive(index)}
              >
                ✦<small>{day.city || "Choose a destination"}</small>
              </button>
            ))}
            <span className="japan">
              JAPAN
              <br />
              <small>本州</small>
            </span>
          </div>
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
              Your name
              <input
                placeholder="e.g. Terry"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Dates
              <div className="date-fields">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </label>
            <label>
              Destinations
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
                    {emojis[city]} {city}
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
    </main>
  );
}
