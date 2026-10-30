#!/usr/bin/env python3
"""Đưa các URL về 'pending' để chạy lại bằng parser mới. Không xóa dữ liệu, không đụng PostgreSQL.
  python reset_status.py skipped   # chỉ chạy lại các URL từng bị bỏ qua
  python reset_status.py all       # chạy lại tất cả (nên làm lần này để sửa giá)
Bản products cũ được ghi đè khi chạy lại (INSERT OR REPLACE).
"""
import shutil, sqlite3, sys
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "data" / "scrape.db"
mode = sys.argv[1] if len(sys.argv) > 1 else ""
if mode not in ("skipped", "all"):
    sys.exit(__doc__)
shutil.copy(DB, DB.with_name("scrape.backup.db"))
con = sqlite3.connect(DB)
where = "WHERE status='skipped'" if mode == "skipped" else ""
n = con.execute(f"UPDATE product_urls SET status='pending', error=NULL {where}").rowcount
con.commit()
print(f"Đã sao lưu scrape.backup.db và đưa {n} URL về pending.")
