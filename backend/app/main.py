"""API tiengiay (giai đoạn 1): danh mục, sản phẩm, tìm kiếm, ảnh.
Chạy:  uvicorn app.main:app --reload --port 8000     rồi mở http://127.0.0.1:8000/docs
"""
import math
import re
from contextlib import asynccontextmanager
from typing import Literal, Optional
from urllib.parse import quote

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import chat, db
from .config import CORS_ORIGINS, DATA_DIR


@asynccontextmanager
async def lifespan(_app):
    db.init_pool()
    chat.init_chat_table()
    yield
    db.close_pool()


app = FastAPI(title="Tiengiay API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["*"])
app.include_router(chat.router, prefix="/api")
(DATA_DIR / "images").mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(DATA_DIR)), name="media")


# ----------------------------------------------------------------- helpers
def image_url(local_path, cdn_url, source_url):
    """Ưu tiên CDN -> ảnh đã tải về máy -> ảnh gốc trên web cũ."""
    if cdn_url:
        return cdn_url
    if local_path:
        return "/media/" + quote(local_path.replace("\\", "/"), safe="/")
    return source_url


def like_pattern(token: str) -> str:
    return "%" + re.sub(r"([\\%_])", r"\\\1", token.lower()) + "%"


SORTS = {
    "newest": "p.id DESC",
    "price_asc": "p.price_vnd ASC NULLS LAST, p.id DESC",
    "price_desc": "p.price_vnd DESC NULLS LAST, p.id DESC",
    "title": "p.title ASC",
}


# --------------------------------------------------------------------- API
@app.get("/api/health")
def health():
    with db.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM products WHERE status='active'")
        return {"ok": True, "products": cur.fetchone()["n"]}


@app.get("/api/categories")
def categories():
    """Cây danh mục kèm số sản phẩm (danh mục cha gồm cả sản phẩm của danh mục con)."""
    with db.cursor() as cur:
        cur.execute("""
            SELECT c.id, c.slug, c.name, c.parent_id, c.sort_order,
                   COUNT(p.id) FILTER (WHERE p.status='active') AS own_count
            FROM categories c LEFT JOIN products p ON p.category_id = c.id
            GROUP BY c.id ORDER BY c.sort_order, c.id""")
        rows = cur.fetchall()
    nodes = {r["id"]: {"slug": r["slug"], "name": r["name"], "count": r["own_count"], "children": []} for r in rows}
    roots = []
    for r in rows:
        if r["parent_id"] and r["parent_id"] in nodes:
            nodes[r["parent_id"]]["children"].append(nodes[r["id"]])
            nodes[r["parent_id"]]["count"] += r["own_count"]
        else:
            roots.append(nodes[r["id"]])
    return roots


@app.get("/api/products")
def products(
    category: Optional[str] = Query(None, description="slug danh mục (gồm cả danh mục con)"),
    q: Optional[str] = Query(None, description="từ khóa, không phân biệt dấu/hoa thường"),
    min_price: Optional[int] = Query(None, ge=0),
    max_price: Optional[int] = Query(None, ge=0),
    has_price: Optional[bool] = Query(None, description="true: chỉ sản phẩm có giá số"),
    sort: Literal["newest", "price_asc", "price_desc", "title"] = "newest",
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=60),
):
    where, params = ["p.status = 'active'"], []
    if category:
        where.append("""(c.slug = %s OR c.parent_id = (SELECT id FROM categories WHERE slug = %s))""")
        params += [category, category]
    if q:
        for token in q.split()[:8]:
            where.append("(unaccent(lower(p.title)) LIKE unaccent(%s) OR unaccent(lower(coalesce(p.description,''))) LIKE unaccent(%s))")
            params += [like_pattern(token)] * 2
    if min_price is not None:
        where.append("p.price_vnd >= %s"); params.append(min_price)
    if max_price is not None:
        where.append("p.price_vnd <= %s"); params.append(max_price)
    if has_price is True:
        where.append("p.price_vnd IS NOT NULL")
    elif has_price is False:
        where.append("p.price_vnd IS NULL")
    where_sql = " AND ".join(where)

    with db.cursor() as cur:
        cur.execute(f"SELECT count(*) AS n FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE {where_sql}", params)
        total = cur.fetchone()["n"]
        cur.execute(f"""
            SELECT p.id, p.slug, p.title, p.price_vnd, p.price_text,
                   c.slug AS category_slug, c.name AS category_name,
                   i.local_path, i.cdn_url, i.source_url
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            LEFT JOIN LATERAL (SELECT local_path, cdn_url, source_url FROM product_images
                               WHERE product_id = p.id ORDER BY position LIMIT 1) i ON true
            WHERE {where_sql}
            ORDER BY {SORTS[sort]}
            LIMIT %s OFFSET %s""", params + [page_size, (page - 1) * page_size])
        rows = cur.fetchall()

    return {
        "items": [{
            "id": r["id"], "slug": r["slug"], "title": r["title"],
            "price_vnd": r["price_vnd"], "price_text": r["price_text"],
            "category": {"slug": r["category_slug"], "name": r["category_name"]},
            "thumbnail": image_url(r["local_path"], r["cdn_url"], r["source_url"]),
        } for r in rows],
        "total": total, "page": page, "page_size": page_size,
        "pages": math.ceil(total / page_size) if total else 0,
    }


@app.get("/api/products/{slug}")
def product_detail(slug: str):
    with db.cursor() as cur:
        cur.execute("""
            SELECT p.id, p.slug, p.title, p.price_vnd, p.price_text, p.description, p.source_url,
                   p.category_id, c.slug AS category_slug, c.name AS category_name,
                   pc.slug AS parent_slug, pc.name AS parent_name
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            LEFT JOIN categories pc ON pc.id = c.parent_id
            WHERE p.slug = %s AND p.status = 'active'""", (slug,))
        p = cur.fetchone()
        if not p:
            raise HTTPException(404, "Không tìm thấy sản phẩm")
        cur.execute("SELECT position, local_path, cdn_url, source_url FROM product_images WHERE product_id=%s ORDER BY position", (p["id"],))
        images = [{"position": r["position"], "url": image_url(r["local_path"], r["cdn_url"], r["source_url"])} for r in cur.fetchall()]
        cur.execute("""
            SELECT p.slug, p.title, p.price_vnd, p.price_text, i.local_path, i.cdn_url, i.source_url
            FROM products p
            LEFT JOIN LATERAL (SELECT local_path, cdn_url, source_url FROM product_images
                               WHERE product_id = p.id ORDER BY position LIMIT 1) i ON true
            WHERE p.category_id = %s AND p.id <> %s AND p.status='active'
            ORDER BY p.id DESC LIMIT 8""", (p["category_id"], p["id"]))
        related = [{"slug": r["slug"], "title": r["title"], "price_vnd": r["price_vnd"], "price_text": r["price_text"],
                    "thumbnail": image_url(r["local_path"], r["cdn_url"], r["source_url"])} for r in cur.fetchall()]

    breadcrumb = [{"slug": "san-pham", "name": "Sản phẩm"}]
    if p["parent_slug"]:
        breadcrumb.append({"slug": p["parent_slug"], "name": p["parent_name"]})
    if p["category_slug"]:
        breadcrumb.append({"slug": p["category_slug"], "name": p["category_name"]})
    return {
        "id": p["id"], "slug": p["slug"], "title": p["title"],
        "price_vnd": p["price_vnd"], "price_text": p["price_text"],
        "description": p["description"], "images": images,
        "category": {"slug": p["category_slug"], "name": p["category_name"]},
        "breadcrumb": breadcrumb, "related": related,
    }


@app.get("/api/suggest")
def suggest(q: str = Query(..., min_length=1, max_length=80), limit: int = Query(8, ge=1, le=20)):
    """Gợi ý khi gõ ô tìm kiếm (nền cho gợi ý keyword AI sau này)."""
    tokens = q.split()[:6]
    where = " AND ".join(["unaccent(lower(title)) LIKE unaccent(%s)"] * len(tokens))
    with db.cursor() as cur:
        cur.execute(f"SELECT title, slug FROM products WHERE status='active' AND {where} ORDER BY char_length(title), title LIMIT %s",
                    [like_pattern(t) for t in tokens] + [limit])
        return [{"title": r["title"], "slug": r["slug"]} for r in cur.fetchall()]
