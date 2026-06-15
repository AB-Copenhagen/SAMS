// Server-side Descope session validation using core-js-sdk.
// The me() call hits GET /v1/auth/me with Authorization: Bearer <projectId>:<sessionJwt>.
import createSdk from '@descope/core-js-sdk';

export type DescopeSession = {
  id: string;
  email: string;
  name?: string;
  roles?: string[];
};

const projectId = process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID;

let _sdk: ReturnType<typeof createSdk> | undefined;

function getSdk() {
  if (!projectId) throw new Error('NEXT_PUBLIC_DESCOPE_PROJECT_ID is not set');
  if (!_sdk) _sdk = createSdk({ projectId });
  return _sdk;
}

export async function verifyDescopeSession(sessionToken: string): Promise<DescopeSession | null> {
  try {
    const { ok, data } = await getSdk().me(sessionToken);
    if (!ok || !data) return null;
    return {
      id: data.userId,
      email: data.email ?? data.loginIds?.[0] ?? '',
      name: data.name,
      roles: data.roleNames ?? [],
    };
  } catch {
    return null;
  }
}
