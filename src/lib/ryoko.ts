import { supabase } from "./supabase";

export type RyokoSession = {
  tripId: string;
  code: string;
  journeyName?: string;
  role: "owner" | "editor" | "viewer";
  displayName: string;
  color: string;
  startDate?: string;
  endDate?: string;
};
export type AuditEvent = {
  id: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export async function createTrip(
  name: string,
  start: string,
  end: string,
  ownerName: string,
): Promise<RyokoSession> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.rpc("ryoko_create_trip_with_code", {
    p_name: name,
    p_start: start,
    p_end: end,
    p_owner_name: ownerName,
  });
  if (error) throw error;
  const code = String(data?.code ?? "").trim().toLowerCase();
  if (!data?.trip_id || !code) {
    throw new Error("The server did not return a journey access code.");
  }
  const session = {
    tripId: data.trip_id,
    code,
    journeyName: name,
    role: data.role,
    displayName: ownerName,
    color: "#735fa6",
    startDate: start,
    endDate: end,
  } as RyokoSession;
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
    journeyName: data.name ?? undefined,
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
  const { data, error } = session.code
    ? await supabase.rpc("ryoko_list_days", {
        p_code: session.code,
        p_trip: session.tripId,
      })
    : await supabase.rpc("ryoko_list_account_days", { p_trip: session.tripId });
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
  const { data, error } = session.code
    ? await supabase.rpc("ryoko_save_day", {
        p_code: session.code,
        p_day: day.id ?? null,
        p_trip: session.tripId,
        p_date: day.date,
        p_city: day.city,
        p_title: day.title,
        p_notes: day.notes ?? null,
      })
    : await supabase.rpc("ryoko_save_account_day", {
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

export async function deleteDay(session: RyokoSession, dayId: string) {
  if (!supabase) return;
  const { error } = session.code
    ? await supabase.rpc("ryoko_delete_day", {
        p_code: session.code,
        p_day: dayId,
        p_trip: session.tripId,
      })
    : await supabase.rpc("ryoko_delete_account_day", {
        p_day: dayId,
        p_trip: session.tripId,
      });
  if (error) throw error;
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
  const { data, error } = session.code
    ? await supabase.rpc("ryoko_save_item", {
        p_code: session.code,
        p_item: item.id ?? null,
        p_day: item.dayId,
        p_kind: item.kind,
        p_content: item.content,
        p_completed: item.completed,
      })
    : await supabase.rpc("ryoko_save_account_item", {
        p_trip: session.tripId,
        p_item: item.id ?? null,
        p_day: item.dayId,
        p_kind: item.kind,
        p_content: item.content,
        p_completed: item.completed,
      });
  if (error) throw error;
  return data;
}

export async function listInstagramItems(session: RyokoSession, dayId: string) {
  if (!supabase) return [];
  const { data, error } = session.code
    ? await supabase.rpc("ryoko_list_day_items", {
        p_code: session.code,
        p_trip: session.tripId,
        p_day: dayId,
      })
    : await supabase.rpc("ryoko_list_account_day_items", {
        p_trip: session.tripId,
        p_day: dayId,
      });
  if (error) throw error;
  return (data ?? []).filter(
    (item: { kind?: string }) => item.kind === "instagram",
  );
}

export async function listJourneyInstagramItems(session: RyokoSession) {
  if (!supabase) return [];
  const { data, error } = session.code
    ? await supabase.rpc("ryoko_list_trip_instagram", {
        p_code: session.code,
        p_trip: session.tripId,
      })
    : await supabase.rpc("ryoko_list_account_instagram", {
        p_trip: session.tripId,
      });
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; content: string }>;
}

export async function saveJourneyInstagramItem(
  session: RyokoSession,
  content: string,
  canonicalUrl: string,
) {
  if (!supabase) return null;
  const { data, error } = session.code
    ? await supabase.rpc("ryoko_save_trip_instagram", {
        p_code: session.code,
        p_trip: session.tripId,
        p_content: content,
        p_canonical_url: canonicalUrl,
      })
    : await supabase.rpc("ryoko_save_account_instagram", {
        p_trip: session.tripId,
        p_content: content,
        p_canonical_url: canonicalUrl,
      });
  if (error) throw error;
  return data as string | null;
}

export async function deleteJourneyInstagramItem(
  session: RyokoSession,
  itemId: string,
) {
  if (!supabase) return;
  const { error } = session.code
    ? await supabase.rpc("ryoko_delete_trip_instagram", {
        p_code: session.code,
        p_trip: session.tripId,
        p_item: itemId,
      })
    : await supabase.rpc("ryoko_delete_account_instagram", {
        p_trip: session.tripId,
        p_item: itemId,
      });
  if (error) throw error;
}

export async function moveJourneyInstagramToDay(
  session: RyokoSession,
  itemId: string,
  dayId: string,
) {
  if (!supabase) return null;
  const { data, error } = session.code
    ? await supabase.rpc("ryoko_move_trip_instagram_to_day", {
        p_code: session.code,
        p_trip: session.tripId,
        p_item: itemId,
        p_day: dayId,
      })
    : await supabase.rpc("ryoko_move_account_instagram_to_day", {
        p_trip: session.tripId,
        p_item: itemId,
        p_day: dayId,
      });
  if (error) throw error;
  return data as string | null;
}

export async function deleteItem(
  session: RyokoSession,
  itemId: string,
  dayId: string,
) {
  if (!supabase) return;
  const { error } = session.code
    ? await supabase.rpc("ryoko_delete_item", {
        p_code: session.code,
        p_trip: session.tripId,
        p_item: itemId,
      })
    : await supabase.rpc("ryoko_delete_account_item", {
        p_trip: session.tripId,
        p_day: dayId,
        p_item: itemId,
      });
  if (error) throw error;
}

export async function moveItem(
  session: RyokoSession,
  itemId: string,
  fromDayId: string,
  toDayId: string,
) {
  if (!supabase || !itemId || fromDayId === toDayId) return;
  const { error } = session.code
    ? await supabase.rpc("ryoko_move_item", {
        p_code: session.code,
        p_trip: session.tripId,
        p_item: itemId,
        p_from_day: fromDayId,
        p_to_day: toDayId,
      })
    : await supabase.rpc("ryoko_move_account_item", {
        p_trip: session.tripId,
        p_item: itemId,
        p_from_day: fromDayId,
        p_to_day: toDayId,
      });
  if (error) throw error;
}

export async function recordAuditEvent(
  session: RyokoSession,
  eventType: string,
  payload: Record<string, unknown>,
) {
  if (!supabase) return;
  const eventPayload = {
    ...payload,
    actor: session.displayName,
  };
  const { error } = session.code
    ? await supabase.rpc("ryoko_record_audit_event", {
        p_code: session.code,
        p_trip: session.tripId,
        p_event_type: eventType,
        p_payload: eventPayload,
      })
    : await supabase.rpc("ryoko_record_account_audit_event", {
        p_trip: session.tripId,
        p_event_type: eventType,
        p_payload: eventPayload,
      });
  if (error) throw error;
}

export async function listAuditEvents(session: RyokoSession) {
  if (!supabase) return [] as AuditEvent[];
  const { data, error } = session.code
    ? await supabase.rpc("ryoko_list_audit_events", {
        p_code: session.code,
        p_trip: session.tripId,
      })
    : await supabase.rpc("ryoko_list_account_audit_events", {
        p_trip: session.tripId,
      });
  if (error) throw error;
  return (data ?? []) as AuditEvent[];
}

export async function listTripMemberCount(session: RyokoSession) {
  if (!supabase) return 1;
  const { data, error } = await supabase.rpc("ryoko_count_trip_members", {
    p_trip: session.tripId,
    p_code: session.code || null,
  });
  if (error) throw error;
  return Math.max(1, Number(data ?? 1));
}

export async function issueMember(
  session: RyokoSession,
  name: string,
  role: "editor" | "viewer",
  color: string,
) {
  if (!supabase || session.role !== "owner")
    throw new Error("Owner access required");
  const { data, error } = session.code
    ? await supabase.rpc("ryoko_issue_member", {
        p_owner_code: session.code,
        p_trip: session.tripId,
        p_name: name,
        p_role: role,
        p_color: color,
      })
    : await supabase.rpc("ryoko_issue_account_member", {
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
  if (!client)
    return Object.assign(() => undefined, {
      updateActiveDay: (_day: number) => undefined,
    });
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
          activeDay: null,
        });
    });
  const cleanup = () => {
    void client.removeChannel(channel);
  };
  return Object.assign(cleanup, {
    updateActiveDay: (day: number) => {
      void channel.track({
        name: session.displayName,
        color: session.color,
        role: session.role,
        activeDay: day,
      });
    },
  });
}
