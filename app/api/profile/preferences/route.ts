import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { invalidateStaffPreference, PAGE_SIZE_OPTIONS, LANDING_PAGE_CHOICES, roleAllowsLandingChoice } from '../../../../lib/staff-preferences';

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ message: 'Invalid body' }, { status: 400 });

  const { theme, defaultPageSize, defaultLandingPage } = body as Record<string, unknown>;

  // Validate against the same fixed allowlists resolvePageSize/resolveLandingPage check on read —
  // never persist a value a client could use to smuggle something unexpected into a later
  // redirect() call or an unsupported page size.
  if (theme !== undefined && theme !== null && theme !== 'light' && theme !== 'dark') {
    return NextResponse.json({ message: 'Invalid theme' }, { status: 400 });
  }
  if (defaultPageSize !== undefined && defaultPageSize !== null && !PAGE_SIZE_OPTIONS.includes(defaultPageSize as number)) {
    return NextResponse.json({ message: 'Invalid defaultPageSize' }, { status: 400 });
  }
  const landingChoice = LANDING_PAGE_CHOICES.find((c) => c.value === defaultLandingPage);
  if (defaultLandingPage !== undefined && defaultLandingPage !== null && !landingChoice) {
    return NextResponse.json({ message: 'Invalid defaultLandingPage' }, { status: 400 });
  }
  if (landingChoice && !roleAllowsLandingChoice(user.role, landingChoice.minRole)) {
    return NextResponse.json({ message: 'Invalid defaultLandingPage' }, { status: 400 });
  }

  await prisma.staffPreference.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      theme: (theme as string | null) ?? null,
      defaultPageSize: (defaultPageSize as number | null) ?? null,
      defaultLandingPage: (defaultLandingPage as string | null) ?? null,
    },
    update: {
      theme: (theme as string | null) ?? null,
      defaultPageSize: (defaultPageSize as number | null) ?? null,
      defaultLandingPage: (defaultLandingPage as string | null) ?? null,
    },
  });

  invalidateStaffPreference(user.id);

  const response = NextResponse.json({ ok: true });
  // Mirror theme into a plain (non-httpOnly) cookie so the root layout can set <html data-theme>
  // synchronously on the next request with no DB round trip and no flash of the old theme.
  if (theme === 'light' || theme === 'dark') {
    response.cookies.set('theme', theme, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  } else {
    response.cookies.delete('theme');
  }
  return response;
}
