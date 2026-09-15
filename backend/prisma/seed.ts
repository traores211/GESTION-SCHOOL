import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);

  const org = await prisma.organisation.upsert({
    where: { slug: 'demo-school' },
    update: {},
    create: {
      name: 'Demo School Group',
      slug: 'demo-school',
      email: 'contact@school.local',
    },
  });

  const school = await prisma.school.upsert({
    where: { code: 'DEMO-001' },
    update: {},
    create: {
      organisationId: org.id,
      name: 'École Démo',
      code: 'DEMO-001',
      email: 'ecole@school.local',
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@school.local' },
    update: { password: passwordHash, status: 'ACTIVE' },
    create: {
      email: 'admin@school.local',
      password: passwordHash,
      firstName: 'Admin',
      lastName: 'Système',
      role: 'SUPER_ADMIN',
      schoolId: school.id,
    },
  });

  console.log('Seed complete. Admin login: admin@school.local / admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
