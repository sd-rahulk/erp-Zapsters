import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(password, hash) {
  const [salt, digest] = hash?.split(":") ?? ["missing-account", ""];
  const candidate = scryptSync(password, salt, 64);
  return digest.length === 128 && timingSafeEqual(candidate, Buffer.from(digest, "hex"));
}
