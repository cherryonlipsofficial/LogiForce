require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const {
  User,
  Client,
  Supplier,
  Driver,
  AttendanceBatch,
  AttendanceRecord,
  SalaryRun,
} = require('../models');

const seed = async () => {
  await connectDB();

  console.log('Clearing existing data...');
  await Promise.all([
    User.deleteMany({}),
    Client.deleteMany({}),
    Supplier.deleteMany({}),
    Driver.deleteMany({}),
    AttendanceBatch.deleteMany({}),
    AttendanceRecord.deleteMany({}),
    SalaryRun.deleteMany({}),
  ]);

  // Reset counters
  const Counter = mongoose.models.Counter || mongoose.model('Counter',
    new mongoose.Schema({ _id: { type: String }, seq: { type: Number, default: 0 } })
  );
  await Counter.deleteMany({});

  // --- Users ---
  console.log('Creating users...');
  const [admin, accountant, ops] = await User.create([
    { name: 'Admin User', email: 'admin@logiforce.com', password: 'Admin@123', role: 'admin' },
    { name: 'Sarah Accountant', email: 'accountant@logiforce.com', password: 'Account@123', role: 'accountant' },
    { name: 'Omar Ops', email: 'ops@logiforce.com', password: 'Ops@1234', role: 'ops' },
  ]);
  console.log('  Created 3 users');

  // --- Clients ---
  console.log('Creating clients...');
  const [amazon, noon, talabat] = await Client.create([
    {
      name: 'Amazon UAE',
      tradeLicenceNo: 'TL-2024-AMZ-001',
      vatNo: 'VAT-100001',
      ratePerDriver: 6500,
      paymentTerms: 'Net 30',
      contactName: 'Ahmed Al Maktoum',
      contactEmail: 'ahmed@amazon.ae',
      contactPhone: '+971501234567',
    },
    {
      name: 'Noon',
      tradeLicenceNo: 'TL-2024-NOON-002',
      vatNo: 'VAT-100002',
      ratePerDriver: 5800,
      paymentTerms: 'Net 30',
      contactName: 'Fatima Hassan',
      contactEmail: 'fatima@noon.com',
      contactPhone: '+971502345678',
    },
    {
      name: 'Talabat',
      tradeLicenceNo: 'TL-2024-TLB-003',
      vatNo: 'VAT-100003',
      ratePerDriver: 5200,
      paymentTerms: 'Net 45',
      contactName: 'Khalid Rashid',
      contactEmail: 'khalid@talabat.com',
      contactPhone: '+971503456789',
    },
  ]);
  console.log('  Created 3 clients');

  // --- Suppliers ---
  console.log('Creating suppliers...');
  await Supplier.create([
    {
      name: 'Belhasa',
      type: 'vehicle_leasing',
      monthlyRate: 2800,
      paymentTerms: 'Net 30',
      contactName: 'Rashid Belhasa',
      contactEmail: 'fleet@belhasa.ae',
      contactPhone: '+971504567890',
    },
    {
      name: 'EasyLease',
      type: 'vehicle_leasing',
      monthlyRate: 2500,
      paymentTerms: 'Net 30',
      contactName: 'Amir Patel',
      contactEmail: 'amir@easylease.ae',
      contactPhone: '+971505678901',
    },
    {
      name: 'Etisalat',
      type: 'telecom',
      monthlyRate: 150,
      paymentTerms: 'Net 15',
      contactName: 'Support Team',
      contactEmail: 'corporate@etisalat.ae',
      contactPhone: '+971800100',
    },
  ]);
  console.log('  Created 3 suppliers');

  // --- Drivers ---
  console.log('Creating drivers...');
  const driverData = [
    // Amazon drivers (8)
    ...Array.from({ length: 8 }, (_, i) => ({
      fullName: ['Mohammad Ali', 'Rahul Sharma', 'Suresh Kumar', 'Abdul Rahman', 'Vikram Singh', 'Naveen Reddy', 'Faisal Khan', 'Deepak Yadav'][i],
      nationality: ['Pakistan', 'India', 'India', 'Bangladesh', 'India', 'India', 'Pakistan', 'India'][i],
      phoneUae: `+97150${String(1000000 + i)}`,
      baseSalary: 3000 + (i * 100),
      payStructure: 'DAILY_RATE',
      status: 'active',
      clientId: amazon._id,
      joinDate: new Date('2024-01-15'),
      createdBy: admin._id,
    })),
    // Noon drivers (7)
    ...Array.from({ length: 7 }, (_, i) => ({
      fullName: ['Hassan Mirza', 'Pradeep Nair', 'Samir Patel', 'Arjun Das', 'Bilal Ahmed', 'Ravi Shankar', 'Wasim Akram'][i],
      nationality: ['Pakistan', 'India', 'India', 'India', 'Pakistan', 'India', 'Pakistan'][i],
      phoneUae: `+97155${String(1000000 + i)}`,
      baseSalary: 2800 + (i * 100),
      payStructure: 'DAILY_RATE',
      status: 'active',
      clientId: noon._id,
      joinDate: new Date('2024-02-01'),
      createdBy: admin._id,
    })),
    // Talabat drivers (5)
    ...Array.from({ length: 5 }, (_, i) => ({
      fullName: ['Tariq Mahmood', 'Ganesh Iyer', 'Zubair Shah', 'Manoj Tiwari', 'Imran Hussain'][i],
      nationality: ['Pakistan', 'India', 'Pakistan', 'India', 'Bangladesh'][i],
      phoneUae: `+97156${String(1000000 + i)}`,
      baseSalary: 2700 + (i * 100),
      payStructure: 'DAILY_RATE',
      status: 'active',
      clientId: talabat._id,
      joinDate: new Date('2024-03-01'),
      createdBy: admin._id,
    })),
  ];

  const drivers = await Driver.create(driverData);
  console.log(`  Created ${drivers.length} drivers`);

  // --- 3 Months of Attendance & Salary Data ---
  const periods = [
    { year: 2025, month: 11 },
    { year: 2025, month: 12 },
    { year: 2026, month: 1 },
  ];

  console.log('Creating attendance and salary data for 3 months...');

  for (const period of periods) {
    const clients = [
      { client: amazon, drivers: drivers.filter((d) => d.clientId.toString() === amazon._id.toString()) },
      { client: noon, drivers: drivers.filter((d) => d.clientId.toString() === noon._id.toString()) },
      { client: talabat, drivers: drivers.filter((d) => d.clientId.toString() === talabat._id.toString()) },
    ];

    for (const { client, drivers: clientDrivers } of clients) {
      // Create attendance batch
      const batch = await AttendanceBatch.create({
        clientId: client._id,
        period,
        status: 'approved',
        totalRows: clientDrivers.length,
        matchedRows: clientDrivers.length,
        warningRows: 0,
        errorRows: 0,
        unmatchedRows: 0,
        uploadedBy: ops._id,
        approvedBy: accountant._id,
        approvedAt: new Date(),
      });

      for (const driver of clientDrivers) {
        // Random working days between 20-26
        const workingDays = 20 + Math.floor(Math.random() * 7);
        const overtimeHours = Math.floor(Math.random() * 15);

        // Attendance record
        await AttendanceRecord.create({
          batchId: batch._id,
          driverId: driver._id,
          clientId: client._id,
          period,
          workingDays,
          overtimeHours,
          rawEmployeeCode: driver.employeeCode,
          status: 'valid',
        });

        // Salary run
        const baseSalary = driver.baseSalary;
        const proratedSalary = Math.round((baseSalary / 26) * workingDays * 100) / 100;
        const overtimePay = Math.round(overtimeHours * (baseSalary / 26 / 8) * 1.5 * 100) / 100;
        const grossSalary = proratedSalary + overtimePay;
        const totalDeductions = 0;
        const netSalary = grossSalary - totalDeductions;

        await SalaryRun.create({
          driverId: driver._id,
          clientId: client._id,
          period,
          workingDays,
          overtimeHours,
          baseSalary,
          proratedSalary,
          overtimePay,
          grossSalary,
          totalDeductions,
          netSalary,
          status: 'approved',
          processedBy: accountant._id,
          approvedBy: admin._id,
          approvedAt: new Date(),
        });
      }
    }

    console.log(`  Created data for ${period.year}-${String(period.month).padStart(2, '0')}`);
  }

  console.log('\nSeed completed successfully!');
  console.log('---');
  console.log('Login credentials:');
  console.log('  Admin:      admin@logiforce.com / Admin@123');
  console.log('  Accountant: accountant@logiforce.com / Account@123');
  console.log('  Ops:        ops@logiforce.com / Ops@1234');

  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
