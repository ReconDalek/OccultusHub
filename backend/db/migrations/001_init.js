import pool from '../pool.js';

const initDatabase = async () => {
  const client = await pool.connect();

  try {
    console.log('Starting database initialization...');

    await client.query('BEGIN');

    // Drop existing tables if they exist (for fresh setup)
    await client.query('DROP TABLE IF EXISTS login_history CASCADE');
    await client.query('DROP TABLE IF EXISTS admin_users CASCADE');
    await client.query('DROP TABLE IF EXISTS page_settings CASCADE');
    await client.query('DROP TABLE IF EXISTS system_settings CASCADE');
    await client.query('DROP TABLE IF EXISTS users CASCADE');

    // Create users table
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        torn_user_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255) NOT NULL,
        faction_id BIGINT,
        faction_position VARCHAR(255),
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        is_admin BOOLEAN DEFAULT FALSE
      )
    `);
    console.log('✓ Created users table');

    // Create admin_users table (audit trail)
    await client.query(`
      CREATE TABLE admin_users (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        granted_by INT REFERENCES users(id) ON DELETE SET NULL,
        granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        revoked_at TIMESTAMP,
        revoked_by INT REFERENCES users(id) ON DELETE SET NULL,
        reason TEXT
      )
    `);
    console.log('✓ Created admin_users table');

    // Create page_settings table
    await client.query(`
      CREATE TABLE page_settings (
        id SERIAL PRIMARY KEY,
        page_name VARCHAR(100) UNIQUE NOT NULL,
        is_visible BOOLEAN DEFAULT TRUE,
        updated_by INT REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created page_settings table');

    // Create login_history table
    await client.query(`
      CREATE TABLE login_history (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(45),
        user_agent TEXT
      )
    `);
    console.log('✓ Created login_history table');

    // Create system_settings table
    await client.query(`
      CREATE TABLE system_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created system_settings table');

    // Seed default page settings
    const pages = ['factions', 'companies', 'leadership', 'respect'];
    for (const page of pages) {
      await client.query(
        'INSERT INTO page_settings (page_name, is_visible) VALUES ($1, $2)',
        [page, true]
      );
    }
    console.log('✓ Seeded default page settings');

    // Seed default system settings
    const systemSettings = [
      { key: 'site_title', value: 'occultusHub' },
      { key: 'cache_expiry_minutes', value: '60' },
      { key: 'max_users', value: '1000' },
    ];
    for (const setting of systemSettings) {
      await client.query(
        'INSERT INTO system_settings (key, value) VALUES ($1, $2)',
        [setting.key, setting.value]
      );
    }
    console.log('✓ Seeded default system settings');

    await client.query('COMMIT');
    console.log('\n✅ Database initialization completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Database initialization failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

initDatabase();
