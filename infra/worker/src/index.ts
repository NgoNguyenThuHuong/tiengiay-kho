export interface Env {
  BUCKET: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ALLOWED_ORIGINS: string;
}

const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB tối đa
const SLUG_REGEX = /^[a-z0-9-]{1,120}$/;

/**
 * Kiểm tra WebP magic bytes:
 * Bytes 0..3: 'RIFF' (0x52, 0x49, 0x46, 0x46)
 * Bytes 8..11: 'WEBP' (0x57, 0x45, 0x42, 0x50)
 */
function isValidWebP(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const bytes = new Uint8Array(buffer, 0, 12);
  const isRiff =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46;
  const isWebp =
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  return isRiff && isWebp;
}

/**
 * Trả CORS headers dựa trên origin người gửi
 */
function getCorsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim().toLowerCase());

  const isAllowed = allowed.includes(origin.toLowerCase());
  const matchedOrigin = isAllowed ? origin : allowed[0] || "http://localhost:3000";

  return {
    "Access-Control-Allow-Origin": matchedOrigin,
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Xác thực người dùng bằng cách chuyển JWT tới Supabase Auth /auth/v1/user
 */
async function authenticateUser(request: Request, env: Env): Promise<boolean> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: authHeader,
      },
    });
    return res.status === 200;
  } catch (err) {
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = getCorsHeaders(request, env);

    // 1. Handle CORS Preflight OPTIONS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 2. Xác thực JWT Supabase cho toàn bộ endpoints
    const isAuthenticated = await authenticateUser(request, env);
    if (!isAuthenticated) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or missing Supabase JWT" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Endpoint: POST /upload?slug=<slug>
    if (request.method === "POST" && path === "/upload") {
      const slug = url.searchParams.get("slug");
      if (!slug || !SLUG_REGEX.test(slug)) {
        return new Response(
          JSON.stringify({
            error: "Bad Request: Invalid or missing slug (must match [a-z0-9-]{1,120})",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Check Content-Type header
      const contentType = request.headers.get("Content-Type") || "";
      if (!contentType.toLowerCase().startsWith("image/webp")) {
        return new Response(
          JSON.stringify({ error: "Unsupported Media Type: Only image/webp is accepted" }),
          {
            status: 415,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Check Content-Length if present
      const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
      if (contentLength > MAX_FILE_SIZE) {
        return new Response(
          JSON.stringify({ error: "Payload Too Large: File exceeds 3MB limit" }),
          {
            status: 413,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Đọc toàn bộ buffer của ảnh
      const buffer = await request.arrayBuffer();

      // Kiểm tra kích thước buffer thực tế
      if (buffer.byteLength > MAX_FILE_SIZE) {
        return new Response(
          JSON.stringify({ error: "Payload Too Large: Actual file size exceeds 3MB limit" }),
          {
            status: 413,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (buffer.byteLength === 0) {
        return new Response(
          JSON.stringify({ error: "Bad Request: File is empty" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Kiểm tra magic bytes WebP
      if (!isValidWebP(buffer)) {
        return new Response(
          JSON.stringify({ error: "Invalid WebP format: Header does not match RIFF...WEBP" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Tạo object_key dạng images/<slug>/<uuid>.webp
      const uuid = crypto.randomUUID();
      const objectKey = `images/${slug}/${uuid}.webp`;

      // Kiểm tra trùng lặp trên R2 (không bao giờ ghi đè)
      const existing = await env.BUCKET.head(objectKey);
      if (existing !== null) {
        return new Response(
          JSON.stringify({ error: "Conflict: Object key already exists" }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Ghi vào R2 qua R2Binding
      await env.BUCKET.put(objectKey, buffer, {
        httpMetadata: {
          contentType: "image/webp",
          cacheControl: "public, max-age=31536000",
        },
      });

      return new Response(JSON.stringify({ object_key: objectKey }), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Endpoint: DELETE /object?key=<object_key> (Dọn ảnh mồ côi)
    if (request.method === "DELETE" && path === "/object") {
      const key = url.searchParams.get("key");
      if (!key || !key.startsWith("images/")) {
        return new Response(
          JSON.stringify({
            error: "Bad Request: Invalid or missing key (must start with images/)",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      await env.BUCKET.delete(key);

      return new Response(JSON.stringify({ success: true, deleted_key: key }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },
};

