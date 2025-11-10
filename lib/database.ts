import { ensureSupabase } from './supabase';

export interface User {
  id: string;
  google_id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  created_at: string;
  updated_at: string;
  last_login: string;
  login_count: number;
}

export class UserDatabase {
  static async upsertUser(userData: {
    google_id: string;
    email: string;
    name?: string;
    image?: string;
  }): Promise<User> {
    const supabase = ensureSupabase();
    const now = new Date().toISOString();

    const existingRes = await supabase
      .from('users')
      .select('*')
      .eq('google_id', userData.google_id)
      .maybeSingle();

    if (existingRes.error) {
      throw existingRes.error;
    }

    if (existingRes.data) {
      const updateRes = await supabase
        .from('users')
        .update({
          email: userData.email,
          name: userData.name || null,
          image: userData.image || null,
          updated_at: now,
          last_login: now,
          login_count: existingRes.data.login_count + 1,
        })
        .eq('google_id', userData.google_id)
        .select()
        .single();

      if (updateRes.error || !updateRes.data) {
        throw updateRes.error || new Error('Failed to update user');
      }

      return updateRes.data;
    }

    const insertRes = await supabase
      .from('users')
      .insert({
        google_id: userData.google_id,
        email: userData.email,
        name: userData.name || null,
        image: userData.image || null,
        created_at: now,
        updated_at: now,
        last_login: now,
        login_count: 1,
      })
      .select()
      .single();

    if (insertRes.error || !insertRes.data) {
      throw insertRes.error || new Error('Failed to insert user');
    }

    return insertRes.data;
  }

  static async getAllUsers(limit = 100, offset = 0): Promise<{
    users: User[];
    total: number;
  }> {
    const supabase = ensureSupabase();

    const { data, error, count } = await supabase
      .from('users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error || !data) {
      throw error || new Error('Failed to fetch users');
    }

    return {
      users: data,
      total: count ?? data.length,
    };
  }

  static async getUserByGoogleId(googleId: string): Promise<User | null> {
    const supabase = ensureSupabase();

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('google_id', googleId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ?? null;
  }

  static async getUserStats(): Promise<{
    totalUsers: number;
    newUsersToday: number;
    newUsersThisWeek: number;
    newUsersThisMonth: number;
  }> {
    const supabase = ensureSupabase();

    const [totalRes, todayRes, weekRes, monthRes] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfDay().toISOString()),
      supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', daysAgoIso(7)),
      supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', daysAgoIso(30)),
    ]);

    if (totalRes.error || todayRes.error || weekRes.error || monthRes.error) {
      throw (
        totalRes.error ||
        todayRes.error ||
        weekRes.error ||
        monthRes.error ||
        new Error('Failed to load user stats')
      );
    }

    return {
      totalUsers: totalRes.count ?? 0,
      newUsersToday: todayRes.count ?? 0,
      newUsersThisWeek: weekRes.count ?? 0,
      newUsersThisMonth: monthRes.count ?? 0,
    };
  }

  static async testConnection(): Promise<boolean> {
    try {
      ensureSupabase();
      const { error } = await ensureSupabase()
        .from('users')
        .select('id', { count: 'exact', head: true })
        .limit(1);

      if (error) {
        console.error('[database] Supabase connectivity check failed:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[database] Supabase connectivity check threw:', error);
      return false;
    }
  }
}

function startOfDay() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}
