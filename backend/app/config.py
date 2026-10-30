import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # thư mục dự án (E:\tiengiay)
DATA_DIR = ROOT / "data"                            # chứa images/ do scraper tải về


def database_url() -> str:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    # Dùng 127.0.0.1 (không dùng localhost) để tránh Windows nối nhầm vào PostgreSQL khác qua IPv6
    return "postgresql://tiengiay:tiengiay_dev_2026@127.0.0.1:5432/tiengiay"


def anthropic_api_key() -> str | None:
    if os.environ.get("ANTHROPIC_API_KEY"):
        val = os.environ["ANTHROPIC_API_KEY"].strip()
        if val:
            return val
    env = ROOT / ".env"
    if env.exists():
        try:
            for line in env.read_text(encoding="utf-8").splitlines():
                sline = line.strip()
                if sline.startswith("ANTHROPIC_API_KEY="):
                    val = sline.split("=", 1)[1].strip().strip('"').strip("'")
                    if val:
                        return val
        except Exception:
            pass
    return None


def chat_model() -> str:
    if os.environ.get("CHAT_MODEL"):
        val = os.environ["CHAT_MODEL"].strip()
        if val:
            return val
    env = ROOT / ".env"
    if env.exists():
        try:
            for line in env.read_text(encoding="utf-8").splitlines():
                sline = line.strip()
                if sline.startswith("CHAT_MODEL="):
                    val = sline.split("=", 1)[1].strip().strip('"').strip("'")
                    if val:
                        return val
        except Exception:
            pass
    return "claude-haiku-4-5-20251001"


CHAT_MODEL = chat_model()


def chat_log_salt() -> str:
    if os.environ.get("CHAT_LOG_SALT"):
        return os.environ["CHAT_LOG_SALT"].strip()
    env = ROOT / ".env"
    if env.exists():
        try:
            for line in env.read_text(encoding="utf-8").splitlines():
                sline = line.strip()
                if sline.startswith("CHAT_LOG_SALT="):
                    return sline.split("=", 1)[1].strip().strip('"').strip("'")
        except Exception:
            pass
    return "tiengiay_chat_log_salt_2026"


CORS_ORIGINS = [o for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o]
