/**
 * User Profile Data Access Repository.
 * Handles profile management, Supabase Auth user mapping, and active workspace tracking.
 */

import { DatabaseExecutor, getDatabaseExecutor } from '../client.js';
import { UserProfile, UpsertUserProfileInput } from '../types.js';

export class UserProfileRepository {
  constructor(private executor?: DatabaseExecutor) {}

  private get db(): DatabaseExecutor {
    return this.executor || getDatabaseExecutor();
  }

  async findById(id: string): Promise<UserProfile | null> {
    const res = await this.db.query<UserProfile>(
      'SELECT * FROM user_profiles WHERE id = $1 LIMIT 1',
      [id]
    );
    return res.rows[0] || null;
  }

  async findByUserId(userId: string): Promise<UserProfile | null> {
    const res = await this.db.query<UserProfile>(
      'SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    return res.rows[0] || null;
  }

  async findByUsername(username: string): Promise<UserProfile | null> {
    const res = await this.db.query<UserProfile>(
      'SELECT * FROM user_profiles WHERE username = $1 LIMIT 1',
      [username]
    );
    return res.rows[0] || null;
  }

  async upsert(input: UpsertUserProfileInput): Promise<UserProfile> {
    // Ensure parent auth user record exists to satisfy foreign key constraints
    try {
      await this.db.query(
        'INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [input.userId, `${input.username || 'user'}@hopper.local`]
      );
    } catch (_authErr) {
      // Ignore if auth schema is managed by Supabase managed service
    }

    const sql = `
      INSERT INTO user_profiles (user_id, username, full_name, avatar_url, bio, role, current_workspace_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id) DO UPDATE SET
        username = COALESCE(EXCLUDED.username, user_profiles.username),
        full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
        bio = COALESCE(EXCLUDED.bio, user_profiles.bio),
        role = COALESCE(EXCLUDED.role, user_profiles.role),
        current_workspace_id = COALESCE(EXCLUDED.current_workspace_id, user_profiles.current_workspace_id),
        updated_at = NOW()
      RETURNING *
    `;
    const res = await this.db.query<UserProfile>(sql, [
      input.userId,
      input.username || null,
      input.fullName || null,
      input.avatarUrl || null,
      input.bio || null,
      input.role || 'developer',
      input.currentWorkspaceId || null,
    ]);
    return res.rows[0];
  }

  async updateCurrentWorkspace(userProfileId: string, workspaceId: string | null): Promise<UserProfile> {
    const sql = `
      UPDATE user_profiles 
      SET current_workspace_id = $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING *
    `;
    const res = await this.db.query<UserProfile>(sql, [workspaceId, userProfileId]);
    if (!res.rows[0]) {
      throw new Error(`User profile with id ${userProfileId} not found`);
    }
    return res.rows[0];
  }
}
