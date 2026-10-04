import { supabase } from "./supabase";

export type AccountPlan = {
  trip_id: string;
  name: string;
  start_date: string;
  end_date: string;
  linked_at: string;
  archived_at?: string | null;
  created_by?: string | null;
  created_at?: string | null;
};

export async function requestAccountLink(email: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signInWithGithub() {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function linkCurrentTrip(tripId: string, code: string) {
  if (!supabase) return;
  const normalizedCode = code.trim().toLowerCase();
  if (!tripId || !normalizedCode) {
    throw new Error("The journey access code is missing. Please reopen the journey and try again.");
  }
  const { error } = await supabase.rpc("ryoko_link_account_trip", {
    p_trip: tripId,
    p_code: normalizedCode,
  });
  if (error) throw error;
}

export async function revealAccountTripCode(tripId: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("ryoko_reveal_account_trip_code", {
    p_trip: tripId,
  });
  if (error) throw error;
  return data as string;
}

export async function listAccountPlans() {
  if (!supabase) return [] as AccountPlan[];
  const { data, error } = await supabase.rpc("ryoko_list_account_trips");
  if (error?.code === "PGRST202") return [] as AccountPlan[];
  if (error) throw error;
  return (data ?? []) as AccountPlan[];
}

export async function listAdminPlans() {
  if (!supabase) return [] as AccountPlan[];
  const { data, error } = await supabase.rpc("ryoko_admin_list_trips");
  if (error?.code === "PGRST202") return [] as AccountPlan[];
  if (error) throw error;
  return (data ?? []) as AccountPlan[];
}

export async function deleteAdminPlan(tripId: string) {
  if (!supabase) return;
  const { error } = await supabase.rpc("ryoko_admin_delete_trip", {
    p_trip: tripId,
  });
  if (error) throw error;
}

export async function isAdmin() {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("ryoko_is_admin");
  if (error?.code === "PGRST202") return false;
  if (error) throw error;
  return Boolean(data);
}

export async function saveAccountProfile(
  displayName: string,
  avatarColor: string,
) {
  if (!supabase) return;
  const authProfile = await supabase.auth.updateUser({
    data: { display_name: displayName, avatar_color: avatarColor },
  });
  if (authProfile.error) throw authProfile.error;
  const { error } = await supabase.rpc("ryoko_save_account_profile", {
    p_display_name: displayName,
    p_avatar_color: avatarColor,
  });
  if (error?.code === "PGRST202") {
    return;
  }
  if (error) throw error;
}

export async function getAccountProfile() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("ryoko_get_account_profile");
  if (error?.code === "PGRST202") return null;
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function archiveAdminPlan(tripId: string) {
  if (!supabase) return;
  const { error } = await supabase.rpc("ryoko_admin_archive_trip", {
    p_trip: tripId,
  });
  if (error) throw error;
}

export async function archiveOwnPlan(tripId: string) {
  if (!supabase) return;
  const { error } = await supabase.rpc("ryoko_archive_account_trip", {
    p_trip: tripId,
  });
  if (error) throw error;
}

export async function restoreAdminPlan(tripId: string) {
  if (!supabase) return;
  const { error } = await supabase.rpc("ryoko_admin_restore_trip", {
    p_trip: tripId,
  });
  if (error) throw error;
}

export async function unlinkPlan(tripId: string) {
  if (!supabase) return;
  const { error } = await supabase.rpc("ryoko_unlink_account_trip", {
    p_trip: tripId,
  });
  if (error) throw error;
}

export async function exportAccountData() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("ryoko_export_account_data");
  if (error) throw error;
  return data;
}

export async function requestAccountDeletion() {
  if (!supabase) return;
  const { error } = await supabase.rpc("ryoko_request_account_deletion");
  if (error) throw error;
}
