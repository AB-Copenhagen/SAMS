import { NextResponse } from 'next/server';
import { getCurrentUser, hasPermission } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { buildCustomerWhere } from '../../../lib/customer-query';

const PER_PAGE = 50;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!hasPermission(user, 'crm', 'view')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1);
  const rawMarketingOptIn = searchParams.get('marketingOptIn');
  const rawMinSpend = searchParams.get('minSpend');
  const rawMinMatchesAttended = searchParams.get('minMatchesAttended');
  const rawSeasonPassHolder = searchParams.get('seasonPassHolder');
  const where = buildCustomerWhere({
    q: searchParams.get('q') ?? undefined,
    marketingOptIn: rawMarketingOptIn === 'true' ? true : rawMarketingOptIn === 'false' ? false : undefined,
    minSpend: rawMinSpend ? Number(rawMinSpend) : undefined,
    segment: searchParams.get('segment') ?? undefined,
    minMatchesAttended: rawMinMatchesAttended ? Number(rawMinMatchesAttended) : undefined,
    seasonPassHolder: rawSeasonPassHolder === 'true' ? true : rawSeasonPassHolder === 'false' ? false : undefined,
  });

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { updatedAt: 'desc' }, take: PER_PAGE, skip: (page - 1) * PER_PAGE }),
    prisma.customer.count({ where }),
  ]);

  return NextResponse.json({ customers, total, page, pages: Math.ceil(total / PER_PAGE) || 1 });
}
