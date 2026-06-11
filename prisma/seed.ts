import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ─── Hero Templates ──────────────────────────────────────────────────────
  const templates = await Promise.all([
    prisma.heroTemplate.upsert({
      where: { class: 'guardian' },
      update: {},
      create: {
        class: 'guardian',
        label: 'Guardian',
        description: 'Heavily armored frontliner. High HP and defense.',
        baseHp: 120,
        baseAttack: 15,
        baseDefense: 20,
        baseSpeed: 5,
      },
    }),
    prisma.heroTemplate.upsert({
      where: { class: 'ranger' },
      update: {},
      create: {
        class: 'ranger',
        label: 'Ranger',
        description: 'Swift ranged attacker. High speed and attack.',
        baseHp: 80,
        baseAttack: 25,
        baseDefense: 8,
        baseSpeed: 12,
      },
    }),
    prisma.heroTemplate.upsert({
      where: { class: 'occultist' },
      update: {},
      create: {
        class: 'occultist',
        label: 'Occultist',
        description: 'Arcane damage dealer. Low HP but high burst.',
        baseHp: 60,
        baseAttack: 30,
        baseDefense: 5,
        baseSpeed: 10,
      },
    }),
    prisma.heroTemplate.upsert({
      where: { class: 'medic' },
      update: {},
      create: {
        class: 'medic',
        label: 'Medic',
        description: 'Support hero. Heals allies and buffs survival.',
        baseHp: 75,
        baseAttack: 10,
        baseDefense: 10,
        baseSpeed: 9,
      },
    }),
  ]);

  console.log(`Created ${templates.length} hero templates.`);

  // ─── Demo Player ─────────────────────────────────────────────────────────
  const existingDemo = await prisma.player.findUnique({
    where: { telegramId: '123456789' },
  });

  if (!existingDemo) {
    const player = await prisma.player.create({
      data: {
        telegramId: '123456789',
        username: 'demo_player',
        base: {
          create: {
            level: 1,
            buildings: {
              createMany: {
                data: [
                  { type: 'town_hall', level: 1 },
                  { type: 'barracks', level: 1 },
                  { type: 'forge', level: 1 },
                  { type: 'laboratory', level: 1 },
                  { type: 'storage', level: 1 },
                  { type: 'map_room', level: 1 },
                ],
              },
            },
          },
        },
        resourceBalance: {
          create: {
            gold: 500,
            stone: 200,
            iron: 100,
            essence: 20,
            relics: 2,
          },
        },
      },
    });

    // Create one hero of each class for the demo player
    const heroNames: Record<string, string> = {
      guardian: 'Aldric',
      ranger: 'Sylva',
      occultist: 'Morvyn',
      medic: 'Eryn',
    };

    for (const tmpl of templates) {
      await prisma.hero.create({
        data: {
          name: heroNames[tmpl.class] ?? tmpl.label,
          playerId: player.id,
          templateId: tmpl.id,
          hp: tmpl.baseHp,
          level: 1,
        },
      });
    }

    console.log(`Created demo player "${player.username}" with base and 4 heroes.`);
  } else {
    console.log('Demo player already exists, skipping.');
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
