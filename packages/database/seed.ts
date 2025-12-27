import { prisma } from './index';

async function main() {
    console.log('Seeding...');
    // No seeds needed for now for the MVP, effectively a no-op that just tests the connection
    // await prisma.simulationRun.create({ data: {} });
    console.log('Seed complete');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
