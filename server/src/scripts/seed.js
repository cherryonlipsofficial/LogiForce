require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const {
  User,
  Role,
  Client,
  Supplier,
  Driver,
  AttendanceBatch,
  AttendanceRecord,
  SalaryRun,
  Project,
  ProjectContract,
  DriverProjectAssignment,
} = require('../models');
const { seedRoles } = require('./seedRoles');

const seed = async () => {
  await connectDB();

  console.log('Clearing existing data...');
  await Promise.all([
    User.deleteMany({}),
    Role.deleteMany({}),
    Client.deleteMany({}),
    Supplier.deleteMany({}),
    Driver.deleteMany({}),
    AttendanceBatch.deleteMany({}),
    AttendanceRecord.deleteMany({}),
    SalaryRun.deleteMany({}),
    Project.deleteMany({}),
    ProjectContract.deleteMany({}),
    DriverProjectAssignment.deleteMany({}),
  ]);

  // Reset counters
  const Counter = mongoose.models.Counter || mongoose.model('Counter',
    new mongoose.Schema({ _id: { type: String }, seq: { type: Number, default: 0 } })
  );
  await Counter.deleteMany({});

  // --- Roles ---
  const roles = await seedRoles();

  // --- Users ---
  console.log('Creating users...');
  const [admin, accountant, ops, compliance, sales, viewer] = await User.create([
    { name: 'System Admin', email: 'admin@logiforce.com', password: 'Admin@123', roleId: roles.admin._id },
    { name: 'Sarah Accountant', email: 'accountant@logiforce.com', password: 'Account@123', roleId: roles.accountant._id },
    { name: 'James Operations', email: 'ops@logiforce.com', password: 'Ops@123', roleId: roles.ops._id },
    { name: 'Layla Compliance', email: 'compliance@logiforce.com', password: 'Compliance@123', roleId: roles.compliance._id },
    { name: 'Nadia Sales', email: 'sales@logiforce.com', password: 'Sales@123', roleId: roles.sales._id },
    { name: 'Test Viewer', email: 'viewer@logiforce.com', password: 'Viewer@123', roleId: roles.viewer._id },
  ]);

  // Add permission override on accountant: grant drivers.create
  accountant.permissionOverrides = [{
    key: 'drivers.create',
    granted: true,
    reason: 'Approved by management — handles driver onboarding during ops absence',
    grantedBy: admin._id,
    grantedAt: new Date(),
  }];
  await accountant.save();

  console.log('  Created 6 users (with roles assigned)');

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

  // --- Projects ---
  console.log('Creating projects...');

  // Amazon UAE projects
  const amazonProj1 = await Project.create({
    name: 'Last Mile Delivery — Dubai',
    clientId: amazon._id,
    ratePerDriver: 4500,
    rateBasis: 'monthly_fixed',
    location: 'Dubai',
    serviceType: 'Last-mile delivery',
    plannedDriverCount: 200,
    status: 'active',
    operationsContactName: 'Ahmed Al Maktoum',
    operationsContactPhone: '+971501234567',
    createdBy: admin._id,
  });

  const amazonProj2 = await Project.create({
    name: 'Grocery Delivery — Abu Dhabi',
    clientId: amazon._id,
    ratePerDriver: 4200,
    rateBasis: 'monthly_fixed',
    location: 'Abu Dhabi',
    serviceType: 'Grocery delivery',
    plannedDriverCount: 120,
    status: 'active',
    createdBy: admin._id,
  });

  const amazonProj3 = await Project.create({
    name: 'Amazon Fresh — Sharjah',
    clientId: amazon._id,
    ratePerDriver: 3900,
    rateBasis: 'monthly_fixed',
    location: 'Sharjah',
    serviceType: 'Fresh grocery',
    plannedDriverCount: 100,
    status: 'active',
    createdBy: admin._id,
  });

  // Noon projects
  const noonProj1 = await Project.create({
    name: 'Noon Express Delivery — Dubai',
    clientId: noon._id,
    ratePerDriver: 3800,
    rateBasis: 'monthly_fixed',
    location: 'Dubai',
    serviceType: 'Express delivery',
    plannedDriverCount: 180,
    status: 'active',
    operationsContactName: 'Fatima Hassan',
    operationsContactPhone: '+971502345678',
    createdBy: admin._id,
  });

  const noonProj2 = await Project.create({
    name: 'NoonFood Riders — Dubai',
    clientId: noon._id,
    ratePerDriver: 3500,
    rateBasis: 'monthly_fixed',
    location: 'Dubai',
    serviceType: 'Food delivery',
    plannedDriverCount: 130,
    status: 'active',
    createdBy: admin._id,
  });

  // Talabat project
  const talabatProj1 = await Project.create({
    name: 'Talabat Riders — Dubai',
    clientId: talabat._id,
    ratePerDriver: 3400,
    rateBasis: 'monthly_fixed',
    location: 'Dubai',
    serviceType: 'Food delivery',
    plannedDriverCount: 120,
    status: 'active',
    operationsContactName: 'Khalid Rashid',
    operationsContactPhone: '+971503456789',
    createdBy: admin._id,
  });

  console.log('  Created 6 projects');

  // --- Project Contracts ---
  console.log('Creating project contracts...');

  const contractDefs = [
    { project: amazonProj1, type: 'one_year', months: 12, start: '2026-01-01', rate: 4500 },
    { project: amazonProj2, type: 'six_months', months: 6, start: '2026-01-01', rate: 4200 },
    { project: amazonProj3, type: 'one_year', months: 12, start: '2026-03-01', rate: 3900 },
    { project: noonProj1, type: 'one_year', months: 12, start: '2026-01-01', rate: 3800 },
    { project: noonProj2, type: 'six_months', months: 6, start: '2026-02-01', rate: 3500 },
    { project: talabatProj1, type: 'one_year', months: 12, start: '2026-01-01', rate: 3400 },
  ];

  const contracts = {};
  for (const def of contractDefs) {
    const startDate = new Date(def.start);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + def.months);

    const contract = await ProjectContract.create({
      projectId: def.project._id,
      clientId: def.project.clientId,
      contractType: def.type,
      durationMonths: def.months,
      startDate,
      endDate,
      ratePerDriver: def.rate,
      rateBasis: 'monthly_fixed',
      status: 'active',
      createdBy: admin._id,
    });
    contracts[def.project._id.toString()] = contract;
  }

  console.log('  Created 6 project contracts');

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

  // --- Assign Drivers to Projects ---
  console.log('Assigning drivers to projects...');

  const amazonDrivers = drivers.filter((d) => d.clientId.toString() === amazon._id.toString());
  const noonDrivers = drivers.filter((d) => d.clientId.toString() === noon._id.toString());
  const talabatDrivers = drivers.filter((d) => d.clientId.toString() === talabat._id.toString());

  // Assignment helper
  const assignDriver = async (driver, project) => {
    const contract = contracts[project._id.toString()];
    const assignment = await DriverProjectAssignment.create({
      driverId: driver._id,
      projectId: project._id,
      clientId: project.clientId,
      contractId: contract?._id,
      ratePerDriver: contract?.ratePerDriver || project.ratePerDriver,
      assignedDate: new Date('2026-01-15'),
      status: 'active',
      assignedBy: admin._id,
    });
    driver.projectId = project._id;
    driver.currentProjectAssignmentId = assignment._id;
    await driver.save();
  };

  // First 8 Amazon drivers → Amazon Project 1
  for (const d of amazonDrivers.slice(0, 8)) {
    await assignDriver(d, amazonProj1);
  }

  // Noon: First 5 → Noon Project 1
  for (const d of noonDrivers.slice(0, 5)) {
    await assignDriver(d, noonProj1);
  }

  // Noon: Remaining 2 → Noon Project 2
  for (const d of noonDrivers.slice(5)) {
    await assignDriver(d, noonProj2);
  }

  // Talabat: All 5 → Talabat Project 1
  for (const d of talabatDrivers) {
    await assignDriver(d, talabatProj1);
  }

  console.log('  Assigned all drivers to projects');

  // --- 3 Months of Attendance & Salary Data ---
  const periods = [
    { year: 2025, month: 11 },
    { year: 2025, month: 12 },
    { year: 2026, month: 1 },
  ];

  console.log('Creating attendance and salary data for 3 months...');

  for (const period of periods) {
    const clientGroups = [
      { client: amazon, drivers: amazonDrivers },
      { client: noon, drivers: noonDrivers },
      { client: talabat, drivers: talabatDrivers },
    ];

    for (const { client, drivers: clientDrivers } of clientGroups) {
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

        // Salary run (now includes project info)
        const baseSalary = driver.baseSalary;
        const proratedSalary = Math.round((baseSalary / 26) * workingDays * 100) / 100;
        const overtimePay = Math.round(overtimeHours * (baseSalary / 26 / 8) * 1.5 * 100) / 100;
        const grossSalary = proratedSalary + overtimePay;
        const totalDeductions = 0;
        const netSalary = grossSalary - totalDeductions;

        // Find the driver's project assignment rate
        const projectId = driver.projectId || null;
        let projectRatePerDriver = null;
        if (driver.currentProjectAssignmentId) {
          const assignment = await DriverProjectAssignment.findById(
            driver.currentProjectAssignmentId
          );
          if (assignment) projectRatePerDriver = assignment.ratePerDriver;
        }

        await SalaryRun.create({
          driverId: driver._id,
          clientId: client._id,
          projectId: projectId || undefined,
          projectRatePerDriver: projectRatePerDriver || undefined,
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
  console.log('  Ops:        ops@logiforce.com / Ops@123');
  console.log('  Compliance: compliance@logiforce.com / Compliance@123');
  console.log('  Sales:      sales@logiforce.com / Sales@123');
  console.log('  Viewer:     viewer@logiforce.com / Viewer@123');
  console.log('---');
  console.log('Roles seeded: admin, accountant, ops, compliance, sales, viewer');
  console.log('Users seeded: 6 (with roles assigned)');
  console.log('Permission overrides: 1 example override on accountant user (drivers.create)');
  console.log('Projects created: 6 (3 Amazon UAE, 2 Noon, 1 Talabat)');
  console.log('Driver assignments: 20 drivers assigned to projects');
  console.log('Contracts active: 6');

  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
