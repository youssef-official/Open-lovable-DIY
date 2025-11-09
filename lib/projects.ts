import { ensureSupabase } from './supabase';
import type { ConversationState } from '@/types/conversation';

export interface ProjectRecord {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  sandbox_id?: string | null;
  last_prompt?: string | null;
  last_state?: ConversationState | null;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
}

export class ProjectRepository {
  static async createProject(params: {
    userId: string;
    name: string;
    description?: string;
    initialPrompt?: string;
    sandboxId?: string;
  }): Promise<ProjectRecord> {
    const supabase = ensureSupabase();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from<ProjectRecord>('projects')
      .insert({
        user_id: params.userId,
        name: params.name,
        description: params.description || null,
        last_prompt: params.initialPrompt || null,
        sandbox_id: params.sandboxId || null,
        created_at: now,
        updated_at: now,
        last_opened_at: now,
      })
      .select()
      .single();

    if (error || !data) {
      throw error || new Error('Failed to create project');
    }

    return data;
  }

  static async listProjects(userId: string, limit = 10): Promise<ProjectRecord[]> {
    const supabase = ensureSupabase();

    const { data, error } = await supabase
      .from<ProjectRecord>('projects')
      .select('id, user_id, name, description, updated_at, last_opened_at, last_prompt, sandbox_id')
      .eq('user_id', userId)
      .order('last_opened_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error || !data) {
      throw error || new Error('Failed to fetch projects');
    }

    return data;
  }

  static async getProject(userId: string, projectId: string): Promise<ProjectRecord | null> {
    const supabase = ensureSupabase();

    const { data, error } = await supabase
      .from<ProjectRecord>('projects')
      .select('*')
      .eq('user_id', userId)
      .eq('id', projectId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ?? null;
  }

  static async saveState(params: {
    userId: string;
    projectId: string;
    state: ConversationState;
    lastPrompt?: string;
    sandboxId?: string;
  }): Promise<ProjectRecord> {
    const supabase = ensureSupabase();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from<ProjectRecord>('projects')
      .update({
        last_state: params.state,
        last_prompt: params.lastPrompt || null,
        sandbox_id: params.sandboxId || null,
        updated_at: now,
        last_opened_at: now,
      })
      .eq('user_id', params.userId)
      .eq('id', params.projectId)
      .select()
      .single();

    if (error || !data) {
      throw error || new Error('Failed to update project state');
    }

    return data;
  }

  static async updateMetadata(params: {
    userId: string;
    projectId: string;
    name?: string;
    description?: string;
  }): Promise<ProjectRecord> {
    const supabase = ensureSupabase();
    const now = new Date().toISOString();

    const payload: Partial<ProjectRecord> = {
      updated_at: now,
    };

    if (typeof params.name === 'string') {
      payload.name = params.name;
    }
    if (typeof params.description === 'string') {
      payload.description = params.description;
    }

    const { data, error } = await supabase
      .from<ProjectRecord>('projects')
      .update(payload)
      .eq('user_id', params.userId)
      .eq('id', params.projectId)
      .select()
      .single();

    if (error || !data) {
      throw error || new Error('Failed to update project metadata');
    }

    return data;
  }
}
