from contextlib import contextmanager

from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool

from .config import database_url

_pool: ThreadedConnectionPool | None = None


def init_pool():
    global _pool
    _pool = ThreadedConnectionPool(1, 10, database_url())
    # Tìm không dấu / gần đúng. Cần quyền superuser (user tiengiay trong Docker có sẵn).
    conn = _pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            for ext in ("unaccent", "pg_trgm"):
                try:
                    cur.execute(f"CREATE EXTENSION IF NOT EXISTS {ext}")
                except Exception:
                    conn.rollback()
    finally:
        _pool.putconn(conn)


def close_pool():
    if _pool:
        _pool.closeall()


@contextmanager
def cursor():
    conn = _pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)
