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
  DriverLedger,
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
    DriverLedger.deleteMany({}),
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
    { name: 'System Admin', email: 'admin@logiforce.com', password: 'Admin@123', roleId: roles.tenant_admin._id, isActive: true, activatedAt: new Date() },
    { name: 'Sarah Accountant', email: 'accountant@logiforce.com', password: 'Account@123', roleId: roles.accountant._id, isActive: true, activatedAt: new Date() },
    { name: 'James Operations', email: 'ops@logiforce.com', password: 'Ops@123', roleId: roles.ops._id, isActive: true, activatedAt: new Date() },
    { name: 'Layla Compliance', email: 'compliance@logiforce.com', password: 'Compliance@123', roleId: roles.compliance._id, isActive: true, activatedAt: new Date() },
    { name: 'Nadia Sales', email: 'sales@logiforce.com', password: 'Sales@123', roleId: roles.sales._id, isActive: true, activatedAt: new Date() },
    { name: 'Test Viewer', email: 'viewer@logiforce.com', password: 'Viewer@123', roleId: roles.viewer._id, isActive: true, activatedAt: new Date() },
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
  // baseSalary is a monthly amount, so drivers are MONTHLY_FIXED (salary is
  // prorated by working days). DAILY_RATE would multiply it by working days.
  const driverData = [
    // Amazon drivers (8)
    ...Array.from({ length: 8 }, (_, i) => ({
      fullName: ['Mohammad Ali', 'Rahul Sharma', 'Suresh Kumar', 'Abdul Rahman', 'Vikram Singh', 'Naveen Reddy', 'Faisal Khan', 'Deepak Yadav'][i],
      nationality: ['Pakistan', 'India', 'India', 'Bangladesh', 'India', 'India', 'Pakistan', 'India'][i],
      phoneUae: `+97150${String(1000000 + i)}`,
      baseSalary: 3000 + (i * 100),
      payStructure: 'MONTHLY_FIXED',
      status: 'active',
      clientId: amazon._id,
      joinDate: new Date('2024-01-15'),
      createdBy: admin._id,
    })),
    // Noon drivers (8)
    ...Array.from({ length: 8 }, (_, i) => ({
      fullName: ['Hassan Mirza', 'Pradeep Nair', 'Samir Patel', 'Arjun Das', 'Bilal Ahmed', 'Ravi Shankar', 'Wasim Akram', 'Fayyaz Memon'][i],
      nationality: ['Pakistan', 'India', 'India', 'India', 'Pakistan', 'India', 'Pakistan', 'Pakistan'][i],
      phoneUae: `+97155${String(1000000 + i)}`,
      baseSalary: [2800, 2900, 3000, 3100, 3200, 3300, 3400, 2400][i],
      payStructure: 'MONTHLY_FIXED',
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
      payStructure: 'MONTHLY_FIXED',
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

  // driverId -> active assignment (carries the contract rate snapshot)
  const assignmentByDriver = new Map();

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
    assignmentByDriver.set(driver._id.toString(), assignment);
  };

  // First 8 Amazon drivers → Amazon Project 1
  for (const d of amazonDrivers.slice(0, 8)) {
    await assignDriver(d, amazonProj1);
  }

  // Noon: First 5 → Noon Project 1
  for (const d of noonDrivers.slice(0, 5)) {
    await assignDriver(d, noonProj1);
  }

  // Noon: Remaining 3 → Noon Project 2
  for (const d of noonDrivers.slice(5)) {
    await assignDriver(d, noonProj2);
  }

  // Talabat: All 5 → Talabat Project 1
  for (const d of talabatDrivers) {
    await assignDriver(d, talabatProj1);
  }

  console.log('  Assigned all drivers to projects');

  // --- 3 Months of Attendance & Salary Data ---
  // One regular attendance batch per staffed project per month, following the
  // app's workflow (attendance.routes.js upload → attendanceApproval.service.js
  // → salary.service.js runPayroll / approvals / processSalaryRun). Each month
  // sits at a different stage so every screen has something to act on:
  //   Feb 2026 — attendance approved, payroll run, salaries processed and paid
  //   Mar 2026 — attendance approved, payroll run, salaries awaiting ops approval
  //   Apr 2026 — attendance uploaded, awaiting Sales and Ops review
  // All months fall inside each project's contract term and after the drivers'
  // 15 Jan 2026 project assignments.
  const periods = [
    { year: 2026, month: 2, batchStatus: 'processed', salaryStatus: 'paid' },
    { year: 2026, month: 3, batchStatus: 'processed', salaryStatus: 'draft' },
    { year: 2026, month: 4, batchStatus: 'pending_review', salaryStatus: null },
  ];

  const staffedProjects = [amazonProj1, noonProj1, noonProj2, talabatProj1].map((project) => ({
    project,
    contract: contracts[project._id.toString()],
    drivers: drivers.filter((d) => d.projectId?.toString() === project._id.toString()),
  }));

  // A day in the month after `period` — when its attendance is uploaded,
  // approved and paid.
  const followingMonth = ({ year, month }, day) => new Date(Date.UTC(year, month, day));

  const approvedBy = (user, approvedAt) => ({
    status: 'approved',
    approvedBy: user._id,
    approvedByName: user.name,
    approvedAt,
  });

  const ledgerBalance = new Map(); // driverId -> running balance
  let batchCount = 0;
  let salaryRunCount = 0;

  console.log('Creating attendance and salary data for 3 months...');

  for (const period of periods) {
    const { year, month } = period;
    const label = `${year}-${String(month).padStart(2, '0')}`;
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 1));
    const daysInMonth = new Date(year, month, 0).getDate();
    const attendanceApproved = period.batchStatus !== 'pending_review';

    for (const { project, contract, drivers: projectDrivers } of staffedProjects) {
      if (!(contract.startDate <= periodStart && periodEnd <= contract.endDate)) {
        throw new Error(`${label} is outside the contract term for project "${project.name}"`);
      }

      const batch = await AttendanceBatch.create({
        projectId: project._id,
        clientId: project.clientId,
        period: { year, month },
        batchType: 'regular',
        version: 1,
        status: period.batchStatus,
        totalRows: projectDrivers.length,
        matchedRows: projectDrivers.length,
        warningRows: 0,
        errorRows: 0,
        unmatchedRows: 0,
        uploadedBy: accountant._id,
        uploadedByName: accountant.name,
        notificationSentAt: followingMonth(period, 2),
        ...(attendanceApproved && {
          salesApproval: approvedBy(sales, followingMonth(period, 3)),
          opsApproval: approvedBy(ops, followingMonth(period, 4)),
        }),
      });
      batchCount++;

      const records = await AttendanceRecord.insertMany(
        projectDrivers.map((driver, i) => ({
          batchId: batch._id,
          driverId: driver._id,
          clientId: project.clientId,
          projectId: project._id,
          period: { year, month },
          workingDays: 20 + ((i * 3 + month) % 7), // 20–26, below the 26-day over_limit flag
          overtimeHours: 0, // OT is uploaded as a separate 'overtime' batch
          rawEmployeeCode: driver.employeeCode,
          status: 'valid',
        }))
      );

      if (!period.salaryStatus) continue;

      const paid = period.salaryStatus === 'paid';

      for (const [i, driver] of projectDrivers.entries()) {
        const record = records[i];
        const assignment = assignmentByDriver.get(driver._id.toString());

        // MONTHLY_FIXED calculation from salary.service.js calculateDriverSalary.
        // OT and allowances are not auto-added there, and these drivers have no
        // SIM, leased vehicle or advance, so there are no deductions.
        const grossSalary = Math.round(
          Math.min((driver.baseSalary / daysInMonth) * record.workingDays, driver.baseSalary) * 100
        ) / 100;

        const run = await SalaryRun.create({
          driverId: driver._id,
          clientId: project.clientId,
          projectId: project._id,
          projectRatePerDriver: assignment.ratePerDriver,
          attendanceBatchId: batch._id,
          attendanceRecordId: record._id,
          period: { year, month },
          workingDays: record.workingDays,
          overtimeHours: record.overtimeHours,
          baseSalary: driver.baseSalary,
          proratedSalary: grossSalary,
          overtimePay: 0,
          allowances: [],
          grossSalary,
          deductions: [],
          totalDeductions: 0,
          netSalary: grossSalary,
          status: period.salaryStatus,
          processedBy: accountant._id,
          ...(paid && {
            approvals: [
              { stage: 'salary.approve_ops', approvedBy: ops._id, approvedAt: followingMonth(period, 6) },
              { stage: 'salary.approve_compliance', approvedBy: compliance._id, approvedAt: followingMonth(period, 7) },
              { stage: 'salary.approve_accounts', approvedBy: accountant._id, approvedAt: followingMonth(period, 8) },
            ],
            processedAt: followingMonth(period, 9),
            paidAt: followingMonth(period, project.salaryReleaseDay),
          }),
        });
        salaryRunCount++;

        // Processing posts the salary credit to the driver ledger
        // (salary.service.js postLedgerEntries).
        if (paid) {
          const runningBalance = (ledgerBalance.get(driver._id.toString()) || 0) + run.netSalary;
          ledgerBalance.set(driver._id.toString(), runningBalance);
          await DriverLedger.create({
            driverId: driver._id,
            salaryRunId: run._id,
            entryType: 'salary_credit',
            debit: 0,
            credit: run.netSalary,
            runningBalance,
            description: `Salary credit for ${label}`,
            referenceId: run.runId,
            period: run.period,
            createdBy: accountant._id,
          });
        }
      }
    }

    console.log(`  Created data for ${label} (attendance: ${period.batchStatus}, salaries: ${period.salaryStatus || 'not run'})`);
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
  console.log('Driver assignments: 21 drivers assigned to projects');
  console.log('Contracts active: 6');
  console.log(`Attendance batches: ${batchCount} (Feb–Apr 2026 across ${staffedProjects.length} staffed projects)`);
  console.log(`Salary runs: ${salaryRunCount} (Feb 2026 paid, Mar 2026 draft)`);

  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
