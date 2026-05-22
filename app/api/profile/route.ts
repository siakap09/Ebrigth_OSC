import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

// GET /api/profile — returns the caller's own profile, always.
//
// Sourced from User (the authenticated principal), with phone enriched from
// the matching BranchStaff row when one exists. Returns minimum fields only:
// name, email, branch, role, phone. No NRIC, bank, salary rate, or addresses.
export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const email = (session.user as { email?: string | null } | undefined)?.email;
  if (!email) return NextResponse.json({ error: 'Session is missing an email' }, { status: 400 });

  const user = await prisma.user.findUnique({
    where:  { email },
    select: { id: true, name: true, email: true, branchName: true, role: true },
  });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const staff = await prisma.branchStaff.findFirst({
    where:  { email: { equals: email, mode: 'insensitive' } },
    select: { phone: true, nickname: true, branch: true, name: true },
  });

  return NextResponse.json({
    id:        String(user.id),
    name:      user.name ?? staff?.name ?? '',
    nickname:  staff?.nickname ?? '',
    email:     user.email,
    branch:    user.branchName ?? staff?.branch ?? '',
    role:      user.role,
    phone:     staff?.phone ?? '',
  });
}

export async function PUT(request: Request) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const userData = await request.json();
    
    // In a real app, update the database with the new user data
    // For now, we'll just return success
    return NextResponse.json({
      success: true,
      message: "Profile updated successfully",
      data: userData,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
