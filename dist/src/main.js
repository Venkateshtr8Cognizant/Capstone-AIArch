import { createStoreOps } from './app.js';
import { JsonLogger } from './platform/support/logger.js';
import { seedDemoData } from './seed.js';
const logger = new JsonLogger();
const port = Number(process.env.PORT ?? 3000);
const ops = createStoreOps({ logger });
if (process.env.STOREOPS_SEED !== 'false') {
    await seedDemoData(ops);
    logger.info('storeops.seeded', { store: 'store_401' });
}
const server = ops.app.listen(port, () => {
    logger.info('storeops.started', { port, node: process.version });
});
for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
        logger.info('storeops.stopping', { signal });
        server.close(() => process.exit(0));
    });
}
//# sourceMappingURL=main.js.map