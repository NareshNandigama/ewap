import { PrismaClient, WorkflowRunStatus } from '../src/generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const DEMO_MARKER = 'EWAP_DEMO_SEED_2026';

const statusCounts = {
  SUCCESS: 34,
  FAILED: 7,
  RUNNING: 3,
  PENDING: 5,
  CANCELLED: 2,
};

function createDate(daysAgo, hour) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 15, 0, 0);
  return date;
}

async function main() {
  // Prevent accidentally running the seed twice.
  const existingDemoData = await prisma.workflowExecutionLog.findFirst({
    where: {
      message: DEMO_MARKER,
    },
  });

  if (existingDemoData) {
    console.log('Demo data already exists. Nothing was inserted.');
    return;
  }

  const workflows = await prisma.workflow.findMany({
    select: {
      id: true,
      name: true,
    },
  });

  if (workflows.length === 0) {
    throw new Error(
      'No workflows found. Create at least one workflow before seeding demo data.',
    );
  }

  const statuses = Object.entries(statusCounts).flatMap(([status, count]) =>
    Array.from({ length: count }, () => status),
  );

  /*
   * Deterministically mix the statuses so the Runs table doesn't
   * show one giant block of SUCCESS records.
   */
  const mixedStatuses = [];

  while (statuses.length > 0) {
    const successIndex = statuses.indexOf('SUCCESS');

    if (successIndex !== -1) {
      mixedStatuses.push(statuses.splice(successIndex, 1)[0]);
    }

    if (statuses.length > 0) {
      const index = mixedStatuses.length % statuses.length;
      mixedStatuses.push(statuses.splice(index, 1)[0]);
    }
  }

  for (let index = 0; index < mixedStatuses.length; index++) {
    const status = mixedStatuses[index];

    const workflow = workflows[index % workflows.length];

    // Spread records across approximately the last month.
    const daysAgo = (index * 7) % 30;
    const hour = 8 + (index % 10);

    const createdAt = createDate(daysAgo, hour);

    let completedAt = null;

    if (
      status === WorkflowRunStatus.SUCCESS ||
      status === WorkflowRunStatus.FAILED ||
      status === WorkflowRunStatus.CANCELLED
    ) {
      completedAt = new Date(
        createdAt.getTime() + (4 + (index % 20)) * 60 * 1000,
      );
    }

    await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        status,
        createdAt,
        completedAt,

        logs: {
          create: {
            level:
              status === WorkflowRunStatus.FAILED
                ? 'ERROR'
                : status === WorkflowRunStatus.SUCCESS
                  ? 'SUCCESS'
                  : 'INFO',

            message:
              index === 0
                ? DEMO_MARKER
                : `Demo workflow execution: ${status}`,

            metadata: {
              demo: true,
              seededFor: 'portfolio',
            },
          },
        },
      },
    });
  }

  console.log('');
  console.log('EWAP demo data created successfully.');
  console.log('------------------------------------');
  console.log('SUCCESS:   34');
  console.log('FAILED:     7');
  console.log('RUNNING:    3');
  console.log('PENDING:    5');
  console.log('CANCELLED:  2');
  console.log('------------------------------------');
  console.log('TOTAL:      51');
  console.log('Completed-run success rate: 82.9%');
}

main()
  .catch((error) => {
    console.error('Demo seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });