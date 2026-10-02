export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  team: string;
  title: string;
  services: string[];
}

export const SESSION_COOKIE_NAME = "gv_report_session";
const SESSION_EXPIRY_SECONDS = 24 * 60 * 60; // 24시간

function getSecretKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.APP_SECRET_KEY ||
    "gv-chatbot-report-fallback-secret-2026"
  );
}

export function cleanServices(value: unknown, role?: string): string[] {
  if (value === null || value === undefined) {
    if (role === "admin") {
      return ["psi", "report"];
    }
    return ["psi"];
  }

  let list: string[] = [];
  if (Array.isArray(value)) {
    list = value.map((s) => String(s).trim());
  } else if (typeof value === "string") {
    list = [value.trim()];
  }

  const valid = new Set(["psi", "report"]);
  const cleaned = list.filter((s) => valid.has(s));
  return cleaned.length > 0 ? Array.from(new Set(cleaned)).sort() : ["psi"];
}

async function getCryptoKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const secretBytes = enc.encode(getSecretKey());
  return await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function createSessionToken(
  user: AuthUser,
  expirySeconds = SESSION_EXPIRY_SECONDS
): Promise<string> {
  const enc = new TextEncoder();
  const exp = Math.floor(Date.now() / 1000) + expirySeconds;
  const payload = {
    ...user,
    exp,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadBytes = enc.encode(payloadJson);
  const payloadB64 = base64UrlEncode(payloadBytes);

  const key = await getCryptoKey();
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(payloadB64)
  );
  const signatureBytes = new Uint8Array(signatureBuffer);
  const signatureB64 = base64UrlEncode(signatureBytes);

  return `${payloadB64}.${signatureB64}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<AuthUser | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signatureB64] = parts;

  try {
    const key = await getCryptoKey();
    const enc = new TextEncoder();
    const signatureBytes = base64UrlDecode(signatureB64);

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes as unknown as BufferSource,
      enc.encode(payloadB64)
    );

    if (!valid) return null;

    const dec = new TextDecoder();
    const payloadJson = dec.decode(base64UrlDecode(payloadB64));
    const data = JSON.parse(payloadJson) as AuthUser & { exp: number };

    const now = Math.floor(Date.now() / 1000);
    if (!data.exp || data.exp < now) {
      return null;
    }

    return {
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role,
      team: data.team,
      title: data.title,
      services: data.services || ["psi"],
    };
  } catch {
    return null;
  }
}
