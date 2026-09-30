import { afterEach, describe, expect, it } from "vitest";
import { decryptCalendarToken, encryptCalendarToken, pkceChallenge, randomOAuthValue } from "./calendar-crypto";

const originalKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  else process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = originalKey;
});

describe("calendar token protection", () => {
  it("encrypts tokens with authenticated encryption and decrypts them", async () => {
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const protectedToken = await encryptCalendarToken("refresh-token-value");
    expect(protectedToken).toMatch(/^v1\./);
    expect(protectedToken).not.toContain("refresh-token-value");
    await expect(decryptCalendarToken(protectedToken)).resolves.toBe("refresh-token-value");
  });

  it("creates PKCE values without unsafe URL characters", async () => {
    const verifier = randomOAuthValue(48);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await pkceChallenge(verifier)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
