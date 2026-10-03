import { supabase } from "./supabase";

export type RyokoSession = {
  tripId: string;
  code: string;
  role: "owner" | "editor" | "viewer";
  displayName: string;
  color: string;
  startDate?: string;
  endDate?: string;
};

export async function createTrip(
  name: string,
  start: string,
  end: string,
  ownerName: string,
): Promise<RyokoSession> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.rpc("ryoko_create_trip", {
    p_name: name,
    p_start: start,
    p_end: end,
    p_owner_name: ownerName,
  });
  if (error) throw error;
  const session = {
    tripId: data.trip_id,
    code: data.code,
    role: data.role,
    displayName: ownerName,
    color: "#735fa6",
    startDate: start,
    endDate: end,
  } as RyokoSession;
  localStorage.setItem("ryoko_session", JSON.stringify(session));
  return session;
}

export async function joinTrip(
  code: string,
  displayName: string,
  color = "#df8f9b",
): Promise<RyokoSession> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.rpc("ryoko_join_trip", {
    p_code: code.trim().toLowerCase(),
    p_display_name: displayName,
    p_color: color,
  });
  if (error) throw error;
  const session = {
    tripId: data.trip_id,
    code: code.trim().toLowerCase(),
    role: data.role,
    displayName: data.display_name,
    color: data.color,
    startDate: data.start_date ?? data.startDate,
    endDate: data.end_date ?? data.endDate,
  } as RyokoSession;
  localStorage.setItem("ryoko_session", JSON.stringify(session));
  return session;
}

export async function listDays(session: RyokoSession) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("ryoko_list_days", {
    p_code: session.code,
    p_trip: session.tripId,
  });
  if (error) throw error;
  return data ?? [];
}

export async function saveDay(
  session: RyokoSession,
  day: {
    id?: string;
    date: string;
    city: string;
    title: string;
    notes?: string;
  },
) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("ryoko_save_day", {
    p_code: session.code,
    p_day: day.id ?? null,
    p_trip: session.tripId,
    p_date: day.date,
    p_city: day.city,
    p_title: day.title,
    p_notes: day.notes ?? null,
  });
  if (error) throw error;
  return data;
}

export async function saveItem(
  session: RyokoSession,
  item: {
    id?: string;
    dayId: string;
    kind: string;
    content: string;
    completed: boolean;
  },
) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("ryoko_save_item", {
    p_code: session.code,
    p_item: item.id ?? null,
    p_day: item.dayId,
    p_kind: item.kind,
    p_content: item.content,
    p_completed: item.completed,
  });
  if (error) throw error;
  return data;
}

export async function issueMember(
  session: RyokoSession,
  name: string,
  role: "editor" | "viewer",
  color: string,
) {
  if (!supabase || session.role !== "owner")
    throw new Error("Owner access required");
  const { data, error } = await supabase.rpc("ryoko_issue_member", {
    p_owner_code: session.code,
    p_trip: session.tripId,
    p_name: name,
    p_role: role,
    p_color: color,
  });
  if (error) throw error;
  return data;
}

export function getStoredSession(): RyokoSession | null {
  try {
    return JSON.parse(
      localStorage.getItem("ryoko_session") ?? "null",
    ) as RyokoSession | null;
  } catch {
    return null;
  }
}

export function subscribeToTripPresence(
  session: RyokoSession,
  onSync: (members: unknown[]) => void,
) {
  const client = supabase;
  if (!client) return () => undefined;
  const channel = client.channel(`ryoko:${session.tripId}`, {
    config: { presence: { key: session.code } },
  });
  channel
    .on("presence", { event: "sync" }, () =>
      onSync(Object.values(channel.presenceState()).flat()),
    )
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED")
        await channel.track({
          name: session.displayName,
          color: session.color,
          role: session.role,
        });
    });
  return () => {
    void client.removeChannel(channel);
  };
}
