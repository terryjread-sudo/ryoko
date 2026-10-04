import { supabase } from "./supabase";

export type AccountPlan = {
  trip_id: string;
  name: string;
  start_date: string;
  end_date: string;
  linked_at: string;
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
  const { error } = await supabase.rpc("ryoko_link_account_trip", {
    p_trip: tripId,
    p_code: code,
  });
  if (error) throw error;
}

export async function listAccountPlans() {
  if (!supabase) return [] as AccountPlan[];
  const { data, error } = await supabase.rpc("ryoko_list_account_trips");
  if (error) throw error;
  return (data ?? []) as AccountPlan[];
}

export async function listAdminPlans() {
  if (!supabase) return [] as AccountPlan[];
  const { data, error } = await supabase.rpc("ryoko_admin_list_trips");
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
