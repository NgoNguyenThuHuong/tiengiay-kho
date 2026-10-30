#!/usr/bin/env python3
"""Check local import environment settings without displaying their values."""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"
ACCOUNT_ID_PATTERN = re.compile(r"[0-9a-fA-F]{32}\Z")
SETTINGS = (
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_BASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
)


def read_settings():
    settings = {}
    formatting_ok = {}
    for line in ENV_PATH.read_text(encoding="utf-8-sig").splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
            continue
        raw_key, raw_value = line.split("=", 1)
        key = raw_key.strip()
        if key not in SETTINGS:
            continue
        formatting_ok[key] = (
            raw_key == key
            and raw_value == raw_value.strip()
            and '"' not in raw_value
            and "'" not in raw_value
        )
        settings[key] = raw_value.strip()
    return settings, formatting_ok


def format_is_valid(key, value):
    if not value:
        return False
    if key == "SUPABASE_URL":
        return value.startswith("https://") and value.endswith(".supabase.co")
    if key == "R2_PUBLIC_BASE_URL":
        return value.startswith("https://") and not value.endswith("/")
    if key == "R2_ACCOUNT_ID":
        return ACCOUNT_ID_PATTERN.fullmatch(value) is not None
    if key == "R2_BUCKET":
        return value == "tiengiay-kho"
    return True


def main():
    if not ENV_PATH.is_file():
        print(".env: không tìm thấy")
        return 1

    settings, formatting_ok = read_settings()
    valid = True
    for key in SETTINGS:
        value = settings.get(key, "")
        populated = bool(value)
        no_quotes_or_extra_spaces = formatting_ok.get(key, False)
        correctly_formatted = populated and format_is_valid(key, value)
        print(f"{key}: {'đã điền' if populated else 'còn trống'}")
        print(
            f"  định dạng: "
            f"{'OK' if no_quotes_or_extra_spaces and correctly_formatted else 'lỗi'}"
        )
        valid = valid and no_quotes_or_extra_spaces and correctly_formatted

    print(f"Kết quả: {'OK' if valid else 'cần kiểm tra'}")
    return 0 if valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
