# occultusHub Backend Setup Guide

## Prerequisites

- Node.js 16+ installed
- PostgreSQL 12+ installed and running
- A PostgreSQL user and database created

## Setup Steps

### 1. PostgreSQL Database Setup

First, create a PostgreSQL database and user for the application:

```bash
# Connect to PostgreSQL as admin
psql -U postgres

# Create database and user
CREATE DATABASE occultushub;
CREATE USER postgres WITH PASSWORD 'postgres';
ALTER ROLE postgres WITH SUPERUSER;
\q
```

Or using a GUI tool like pgAdmin:
- Create a new database named `occultushub`
- Create a user with username `postgres` and password `postgres`
- Grant all privileges on the database to the user

### 2. Backend Environment Setup

The `.env` file is already configured for local development. Key variables:

```
DB_USER=postgres          # PostgreSQL user
DB_PASSWORD=postgres      # PostgreSQL password
DB_HOST=localhost         # PostgreSQL host
DB_PORT=5432              # PostgreSQL port
DB_NAME=occultushub       # Database name
JWT_SECRET=dev-secret...  # Change in production!
CORS_ORIGIN=http://localhost:5173  # Frontend URL
```

### 3. Initialize the Database

Run the database migration script to create all tables and seed data:

```bash
npm run migrate
```

This will:
- Create `users` table
- Create `admin_users` table (audit trail)
- Create `page_settings` table
- Create `login_history` table
- Create `system_settings` table
- Seed default pages and system settings

### 4. Start the Backend Server

For development with auto-reload:

```bash
npm run dev
```

For production:

```bash
npm start
```

The server will run on `http://localhost:5000`

### 5. Test the Backend

Check that the backend is running:

```bash
curl http://localhost:5000/api/health
# Should return: {"status":"ok"}
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with Torn API key
- `GET /api/auth/session` - Validate session and get user info
- `POST /api/auth/logout` - Logout

### Admin Management (requires admin role)
- `GET /api/admin/users` - List all users
- `GET /api/admin/users/:tornUserId/history` - Get user's login history
- `POST /api/admin/users/:tornUserId/grant` - Grant admin access
- `POST /api/admin/users/:tornUserId/revoke` - Revoke admin access

### Page Management
- `GET /api/admin/pages` - Get page visibility (admin only)
- `POST /api/admin/pages/:pageName/toggle` - Toggle page visibility (admin only)
- `GET /api/pages/visibility` - Get public page visibility

### Analytics (admin only)
- `GET /api/admin/analytics` - Get system analytics
- `GET /api/admin/cache/status` - Get cache status
- `POST /api/admin/cache/refresh` - Refresh cache

### System Settings (admin only)
- `GET /api/admin/settings` - Get all settings
- `POST /api/admin/settings/:key` - Update a setting

## Troubleshooting

### Database Connection Fails
- Ensure PostgreSQL is running: `psql -U postgres -d occultushub`
- Check `.env` file has correct credentials
- Verify database and user were created: `psql -l`

### Port Already in Use
- Change `PORT` in `.env` file
- Or kill the process using port 5000: `lsof -i :5000` then `kill -9 <PID>`

### CORS Errors
- Ensure `CORS_ORIGIN` in `.env` matches your frontend URL
- Frontend should be running on `http://localhost:5173` (Vite default)

## First Admin User

After the backend is running and frontend connects, manually make the first user an admin:

```bash
# Connect to the database
psql -U postgres -d occultushub

# Find your user ID
SELECT id, username, torn_user_id FROM users;

# Make yourself admin
UPDATE users SET is_admin = true WHERE username = 'YOUR_USERNAME';

# Verify
SELECT username, is_admin FROM users WHERE username = 'YOUR_USERNAME';

# Exit
\q
```

Then refresh the frontend - you should see the "Admin Panel" link in the member dropdown.

## Production Deployment

Before deploying to production:

1. Change `JWT_SECRET` to a strong random string
2. Set `NODE_ENV=production`
3. Update `CORS_ORIGIN` to your production frontend URL
4. Use a production PostgreSQL database
5. Enable HTTPS
6. Use environment-specific `.env` files (don't commit production `.env`)

## Monitoring

Monitor backend logs for errors:

```bash
npm run dev  # Shows logs in real-time during development
```

Check database size and query performance in production using PostgreSQL tools like pgAdmin or monitoring services.
