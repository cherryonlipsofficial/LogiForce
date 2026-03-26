require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  // Update HR role → Compliance
  const hrResult = await db.collection('roles').updateOne(
    { name: 'hr' },
    { $set: { name: 'compliance', displayName: 'Compliance',
              description: 'Compliance team — manages driver documents, KYC and contact verification' } }
  );
  console.log('HR → Compliance:', hrResult.modifiedCount, 'role updated');

  // Update displayName for ops → Operations (keep slug as 'ops')
  const opsResult = await db.collection('roles').updateOne(
    { name: 'ops' },
    { $set: { displayName: 'Operations',
              description: 'Operations team — manages fleet, projects, attendance and driver activation' } }
  );
  console.log('ops displayName → Operations:', opsResult.modifiedCount, 'role updated');

  // Create Sales role if it does not exist
  const existing = await db.collection('roles').findOne({ name: 'sales' });
  if (!existing) {
    await db.collection('roles').insertOne({
      name: 'sales',
      displayName: 'Sales',
      description: 'Sales team — can add new drivers in Draft status',
      permissions: ['drivers.view', 'drivers.create', 'clients.view', 'projects.view', 'reports.view'],
      isSystemRole: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('Sales role created');
  } else {
    console.log('Sales role already exists — skipped');
  }

  // Note: Users who had the 'hr' role don't need updating because roleId
  // is an ObjectId reference — the role document was updated in-place.

  console.log('\nMigration complete.');
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
