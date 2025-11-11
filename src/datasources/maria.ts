/*  // Placeholder code for a MariaDB connection DataSource

import env from 'env';
import mariadb from 'mariadb';

export type MariaDbDataSource = {
  connection: mariadb.Connection;
};

let mariaDbConnection: mariadb.Connection | null = null;

export async function initMariaDB(): Promise<MariaDbDataSource> {
  const pool = mariadb.cratePool({
    host: env.MARIADB_HOST,
    port: env.MARIADB_PORT,
    user: env.MARIADB_USER,
    password: env.MARIADB_PASSWORD,
    database: env.DB_NAME,
  });
  
  if (!mariaDbConnection) {
    mariaDbConnection = await pool.getConnection();
  }
  console.log('✅ Connected to MySQL');

  return { connection: mariaDbConnection };
}

export async function closeMariaDbConnection ({connection}: MariaDbDataSource) {
  if (mariaDbConnection) {
    await connection.end();
    mariaDbConnection = null;
    console.log('🧹 MySQL connection closed');
  }
}

*/