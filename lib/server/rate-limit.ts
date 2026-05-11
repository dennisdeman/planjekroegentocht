/**
 * Simpele in-memory rate limiter.
 * Geschikt voor single-instance deployments (Vercel serverless reset per cold start).
 * Voor multi-instance: vervang door Redis-based limiter.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Periodiek opruimen (elke 5 minuten)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 5 * 60 * 1000);
}

export interface RateLimitConfig {
  /** Unieke prefix voor deze limiter (bijv. "login", "register") */
  prefix: string;
  /** Max aantal requests in het tijdvenster */
  maxRequests: number;
  /** Tijdvenster in seconden */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Check rate limit voor een IP-adres.
 */
export function checkRateLimit(ip: string, config: RateLimitConfig): RateLimitResult {
  const key = `${config.prefix}:${ip}`;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowSeconds * 1000 });
    return { allowed: true, remaining: config.maxRequests - 1, retryAfterSeconds: 0 };
  }

  if (entry.count >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds: retryAfter };
  }

  entry.count++;
  return { allowed: true, remaining: config.maxRequests - entry.count, retryAfterSeconds: 0 };
}

/**
 * Extraheert het client IP-adres uit een request.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
