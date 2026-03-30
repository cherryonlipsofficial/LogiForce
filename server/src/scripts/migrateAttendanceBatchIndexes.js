require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const collection = db.collection('attendancebatches');

  console.log('Dropping old indexes on attendancebatches...');

  // Drop the old unique batchId index
  try {
    await collection.dropIndex('batchId_1');
    console.log('Dropped batchId_1 index');
  } catch (e) {
    console.log('batchId_1 index not found or already dropped:', e.message);
  }

  // Drop the old composite unique index (project + period without version)
  try {
    await collection.dropIndex('projectId_1_period.year_1_period.month_1');
    console.log('Dropped projectId_1_period.year_1_period.month_1 index');
  } catch (e) {
    console.log('Old composite index not found or already dropped:', e.message);
  }

  // Set version=1 on existing documents that lack it
  const result = await collection.updateMany(
    { version: { $exists: false } },
    { $set: { version: 1 } }
  );
  console.log(`Set version=1 on ${result.modifiedCount} existing batches`);

  // Mongoose syncIndexes will create the new indexes on next app startup
  console.log('Migration complete. New indexes will be created on next app startup.');

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
