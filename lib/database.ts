import { Pool } from 'pg';

// Check if DATABASE_URL is available
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
}

// Create a connection pool for better performance
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// User interface for TypeScript
export interface User {
  id: number;
  google_id: string;
  email: string;
  name?: string;
  image?: string;
  created_at: Date;
  updated_at: Date;
  last_login: Date;
  login_count: number;
}

// Database functions for user management
export class UserDatabase {
  // Create or update user on login
  static async upsertUser(userData: {
    google_id: string;
    email: string;
    name?: string;
    image?: string;
  }): Promise<User> {
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO users (google_id, email, name, image, created_at, updated_at, last_login, login_count)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
        ON CONFLICT (google_id) 
        DO UPDATE SET 
          email = EXCLUDED.email,
          name = EXCLUDED.name,
          image = EXCLUDED.image,
          updated_at = CURRENT_TIMESTAMP,
          last_login = CURRENT_TIMESTAMP,
          login_count = users.login_count + 1
        RETURNING *;
      `;
      
      const result = await client.query(query, [
        userData.google_id,
        userData.email,
        userData.name || null,
        userData.image || null
      ]);
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  // Get all users for admin dashboard
  static async getAllUsers(limit: number = 100, offset: number = 0): Promise<{
    users: User[];
    total: number;
  }> {
    const client = await pool.connect();
    try {
      // Get total count
      const countQuery = 'SELECT COUNT(*) as total FROM users';
      const countResult = await client.query(countQuery);
      const total = parseInt(countResult.rows[0].total);

      // Get users with pagination
      const usersQuery = `
        SELECT * FROM users 
        ORDER BY created_at DESC 
        LIMIT $1 OFFSET $2
      `;
      const usersResult = await client.query(usersQuery, [limit, offset]);
      
      return {
        users: usersResult.rows,
        total
      };
    } finally {
      client.release();
    }
  }

  // Get user by Google ID
  static async getUserByGoogleId(googleId: string): Promise<User | null> {
    const client = await pool.connect();
    try {
      const query = 'SELECT * FROM users WHERE google_id = $1';
      const result = await client.query(query, [googleId]);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  // Get user statistics for admin dashboard
  static async getUserStats(): Promise<{
    totalUsers: number;
    newUsersToday: number;
    newUsersThisWeek: number;
    newUsersThisMonth: number;
  }> {
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as new_today,
          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as new_week,
          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as new_month
        FROM users
      `;
      const result = await client.query(query);
      const row = result.rows[0];
      
      return {
        totalUsers: parseInt(row.total_users),
        newUsersToday: parseInt(row.new_today),
        newUsersThisWeek: parseInt(row.new_week),
        newUsersThisMonth: parseInt(row.new_month)
      };
    } finally {
      client.release();
    }
  }

  // Test database connection
  static async testConnection(): Promise<boolean> {
    try {
      if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL environment variable is not set');
        return false;
      }

      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('Database connection test successful');
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      console.error('DATABASE_URL exists:', !!process.env.DATABASE_URL);
      return false;
    }
  }
}

// Export the pool for direct queries if needed
export { pool };

// Graceful shutdown
process.on('SIGINT', () => {
  pool.end();
});

process.on('SIGTERM', () => {
  pool.end();
});
