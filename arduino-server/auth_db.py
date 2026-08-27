# auth_db.py
# Optional MySQL database manager for user accounts and JWT sessions.
# Gracefully disabled if pymysql/bcrypt/jwt are not installed.

import os
import datetime
import secrets

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

_AVAILABLE = True
try:
    import pymysql
    import pymysql.cursors
    import bcrypt
    import jwt
except ImportError:
    _AVAILABLE = False

# ─── Config from environment ───────────────────────────────────────────────────
_DB_HOST         = os.getenv('DB_HOST', 'localhost')
_DB_PORT         = int(os.getenv('DB_PORT', 3306))
_DB_NAME         = os.getenv('DB_NAME', 'arduinoclaw_users')
_DB_USER         = os.getenv('DB_USER', 'root')
_DB_PASS         = os.getenv('DB_PASS', '')
_JWT_SECRET      = os.getenv('JWT_SECRET', 'changeme')
_JWT_EXPIRY_HOURS = int(os.getenv('JWT_EXPIRY_HOURS', 72))

# ─── DB Connection ─────────────────────────────────────────────────────────────
def _db_connect():
    """Opens and returns a new MySQL connection using env credentials."""
    if not _AVAILABLE:
        raise RuntimeError("pymysql is not installed.")
    return pymysql.connect(
        host=_DB_HOST,
        port=_DB_PORT,
        user=_DB_USER,
        password=_DB_PASS,
        database=_DB_NAME,
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
        connect_timeout=5
    )

# ─── Table Initialisation ──────────────────────────────────────────────────────
def init_db():
    """
    Creates the users and sessions tables if they don't already exist.
    Called once on server startup.
    """
    if not _AVAILABLE:
        return

    try:
        conn = _db_connect()
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id                 INT AUTO_INCREMENT PRIMARY KEY,
                    name               VARCHAR(255) DEFAULT NULL,
                    email              VARCHAR(255) UNIQUE NOT NULL,
                    pw_hash            VARCHAR(255) NOT NULL,
                    plan               ENUM('free', 'premium') DEFAULT 'free',
                    premium_expires_at DATETIME DEFAULT NULL,
                    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)
            try:
                cur.execute("ALTER TABLE users ADD COLUMN name VARCHAR(255) DEFAULT NULL;")
            except Exception:
                pass
            try:
                cur.execute("ALTER TABLE users ADD COLUMN premium_expires_at DATETIME DEFAULT NULL;")
            except Exception:
                pass

            cur.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id         INT AUTO_INCREMENT PRIMARY KEY,
                    user_id    INT NOT NULL,
                    token      TEXT NOT NULL,
                    expires_at DATETIME NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)
        conn.close()
    except Exception:
        pass

# ─── User Registration ─────────────────────────────────────────────────────────
def register_user(name: str, email: str, password: str) -> dict:
    if not _AVAILABLE:
        return {'success': False, 'error': 'Auth database not configured.'}
    name = name.strip()
    email = email.strip().lower()
    if not name:
        return {'success': False, 'error': 'Name is required.'}
    if not email or not password:
        return {'success': False, 'error': 'Email and password are required.'}
    if len(password) < 6:
        return {'success': False, 'error': 'Password must be at least 6 characters.'}

    pw_bytes = password.encode('utf-8')
    pw_hash  = bcrypt.hashpw(pw_bytes, bcrypt.gensalt(10)).decode('utf-8')

    try:
        conn = _db_connect()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s;", (email,))
            if cur.fetchone():
                conn.close()
                return {'success': False, 'error': 'An account with this email already exists.'}

            cur.execute(
                "INSERT INTO users (name, email, pw_hash, plan) VALUES (%s, %s, %s, 'free');",
                (name, email, pw_hash)
            )
            user_id = cur.lastrowid
        conn.close()
        return {'success': True, 'user_id': user_id}
    except Exception as e:
        return {'success': False, 'error': f'Database error: {str(e)}'}

# ─── User Login ───────────────────────────────────────────────────────────────
def login_user(email: str, password: str) -> dict:
    if not _AVAILABLE:
        return {'success': False, 'error': 'Auth database not configured.'}
    email = email.strip().lower()
    if not email or not password:
        return {'success': False, 'error': 'Email and password are required.'}

    try:
        conn = _db_connect()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, email, pw_hash, plan, premium_expires_at FROM users WHERE email = %s;",
                (email,)
            )
            user = cur.fetchone()
            if not user:
                conn.close()
                return {'success': False, 'error': 'Invalid email or password.'}

            if not bcrypt.checkpw(password.encode('utf-8'), user['pw_hash'].encode('utf-8')):
                conn.close()
                return {'success': False, 'error': 'Invalid email or password.'}

            plan = user['plan']
            if plan == 'premium' and user['premium_expires_at']:
                if user['premium_expires_at'] < datetime.datetime.utcnow():
                    cur.execute("UPDATE users SET plan = 'free' WHERE id = %s;", (user['id'],))
                    plan = 'free'

            now     = datetime.datetime.utcnow()
            expires = now + datetime.timedelta(hours=_JWT_EXPIRY_HOURS)
            payload = {
                'user_id': user['id'],
                'email':   user['email'],
                'name':    user.get('name') or user['email'].split('@')[0],
                'plan':    plan,
                'iat':     now,
                'exp':     expires
            }
            token = jwt.encode(payload, _JWT_SECRET, algorithm='HS256')

            cur.execute(
                "INSERT INTO sessions (user_id, token, expires_at) VALUES (%s, %s, %s);",
                (user['id'], token, expires)
            )
        conn.close()
        return {
            'success': True,
            'token':   token,
            'user': {
                'id':    user['id'],
                'name':  user.get('name') or user['email'].split('@')[0],
                'email': user['email'],
                'plan':  plan
            }
        }
    except Exception as e:
        return {'success': False, 'error': f'Database error: {str(e)}'}

# ─── User Logout ──────────────────────────────────────────────────────────────
def logout_user(token: str) -> dict:
    if not _AVAILABLE:
        return {'success': True}
    try:
        conn = _db_connect()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM sessions WHERE token = %s;", (token,))
        conn.close()
        return {'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}

# ─── Token Validation ─────────────────────────────────────────────────────────
def validate_token(token: str) -> dict | None:
    if not _AVAILABLE:
        return None
    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=['HS256'])
        conn = _db_connect()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM sessions WHERE token = %s AND expires_at > %s;",
                (token, datetime.datetime.utcnow())
            )
            session = cur.fetchone()
        conn.close()
        if not session:
            return None
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, Exception):
        return None

# ─── Get User by ID ───────────────────────────────────────────────────────────
def get_user(user_id: int) -> dict | None:
    if not _AVAILABLE:
        return None
    try:
        conn = _db_connect()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, email, plan, premium_expires_at, created_at FROM users WHERE id = %s;",
                (user_id,)
            )
            user = cur.fetchone()
            if not user:
                conn.close()
                return None

            if user['plan'] == 'premium' and user['premium_expires_at']:
                if user['premium_expires_at'] < datetime.datetime.utcnow():
                    cur.execute("UPDATE users SET plan = 'free' WHERE id = %s;", (user_id,))
                    user['plan'] = 'free'
        conn.close()
        return user
    except Exception:
        return None

# ─── Admin: Upgrade user to premium ──────────────────────────────────────────
def upgrade_to_premium(email: str, duration_days: int = 30) -> dict:
    if not _AVAILABLE:
        return {'success': False, 'error': 'Auth database not configured.'}
    email   = email.strip().lower()
    expires = datetime.datetime.utcnow() + datetime.timedelta(days=duration_days)
    try:
        conn = _db_connect()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s;", (email,))
            user = cur.fetchone()
            if not user:
                conn.close()
                return {'success': False, 'error': f'User with email {email} not found.'}

            cur.execute(
                "UPDATE users SET plan = 'premium', premium_expires_at = %s WHERE email = %s;",
                (expires, email)
            )
        conn.close()
        return {
            'success': True,
            'message': f'{email} upgraded to premium for {duration_days} days.',
            'expires_at': expires.isoformat()
        }
    except Exception as e:
        return {'success': False, 'error': str(e)}

# ─── Admin: Downgrade user to free ────────────────────────────────────────────
def downgrade_to_free(email: str) -> dict:
    if not _AVAILABLE:
        return {'success': False, 'error': 'Auth database not configured.'}
    email = email.strip().lower()
    try:
        conn = _db_connect()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET plan = 'free', premium_expires_at = NULL WHERE email = %s;",
                (email,)
            )
        conn.close()
        return {'success': True, 'message': f'{email} downgraded to free.'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

# ─── Admin: List users ────────────────────────────────────────────────────────
def list_users() -> list:
    if not _AVAILABLE:
        return []
    try:
        conn = _db_connect()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, email, plan, premium_expires_at, created_at FROM users ORDER BY created_at DESC LIMIT 100;"
            )
            users = cur.fetchall()
        conn.close()
        return users
    except Exception:
        return []
