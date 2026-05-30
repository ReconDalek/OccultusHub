import pg from 'pg';
import config from '../config.js';

const { Pool } = pg;

const pool = new Pool({
  user: config.database.user,
  password: config.database.password,
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export default pool;
