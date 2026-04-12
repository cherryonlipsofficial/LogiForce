const { getModel } = require('../config/modelRegistry');
const { notifyByPermission } = require('./notification.service');

function ordinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Notify Accounts users 3 days before each active project's salary release date.
 *
 * For every active project, compute (this month's salaryReleaseDay − daysBefore).
 * If that matches today, send a notification to all users holding the
 * `salary.approve_accounts` permission (i.e. the Accounts team).
 *
 * De-duplicated per project per day via an AppNotification lookup.
 *
 * @param {{ dbConnection: import('mongoose').Connection }} reqLike
 * @param {{ daysBefore?: number }} [options]
 */
async function notifyAccountsBeforeSalaryDate(reqLike, { daysBefore = 3 } = {}) {
  const Project = getModel(reqLike, 'Project');
  const AppNotification = getModel(reqLike, 'AppNotification');

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const projects = await Project.find({ status: 'active' })
    .select('_id name salaryReleaseDay');

  let notificationsSent = 0;

  for (const project of projects) {
    const releaseDay = project.salaryReleaseDay || 25;

    // Salary release date in the current month
    const releaseDate = new Date(now.getFullYear(), now.getMonth(), releaseDay);
    const notifyDate = new Date(releaseDate);
    notifyDate.setDate(notifyDate.getDate() - daysBefore);

    // Only fire when today is exactly the notify-date
    if (today.getTime() !== notifyDate.getTime()) continue;

    // De-duplicate: skip if this project already got an accounts reminder today
    const startOfDay = new Date(today);
    const endOfDay = new Date(today);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const alreadySent = await AppNotification.findOne({
      type: 'salary_approval_reminder',
      referenceModel: 'Project',
      referenceId: project._id,
      title: 'Salary date approaching',
      createdAt: { $gte: startOfDay, $lt: endOfDay },
    });
    if (alreadySent) continue;

    const sent = await notifyByPermission(reqLike, 'salary.approve_accounts', {
      type: 'salary_approval_reminder',
      title: 'Salary date approaching',
      message: `Salary release date for project "${project.name}" is on the ${releaseDay}${ordinalSuffix(releaseDay)} — only ${daysBefore} day(s) away. Please prepare accounts processing.`,
      referenceModel: 'Project',
      referenceId: project._id,
    });

    notificationsSent += sent;
  }

  return { notificationsSent };
}

// Map salary run status → which permission should be notified
const STATUS_TO_PERMISSION = {
  draft: 'salary.approve_ops',
  ops_approved: 'salary.approve_compliance',
  compliance_approved: 'salary.approve_accounts',
  accounts_approved: 'salary.process',
};

/**
 * Daily check for salary runs that need attention.
 * Runs via cron at 9:00 AM daily.
 *
 * Logic:
 * 1. Find all salary runs NOT in ['processed', 'paid'] status for the current period
 * 2. For each run, look up the project's salaryReleaseDay
 * 3. Calculate the deadline = salaryReleaseDay minus 3 days
 * 4. If today >= deadline date, send urgent reminders
 * 5. If today >= deadline - 2 days (i.e., 5 days before release), send early warnings
 */
async function checkAndSendReminders(req) {
  const SalaryRun = getModel(req, 'SalaryRun');
  const AppNotification = getModel(req, 'AppNotification');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const today = now.getDate();

  // Find all active salary runs for the current period
  const runs = await SalaryRun.find({
    'period.year': currentYear,
    'period.month': currentMonth,
    status: { $nin: ['processed', 'paid'] },
    isDeleted: { $ne: true },
  }).populate('projectId', 'name salaryReleaseDay');

  if (!runs.length) {
    return { notificationsSent: 0 };
  }

  // Group by project
  const byProject = {};
  for (const run of runs) {
    const pid = String(run.projectId?._id || run.projectId);
    if (!byProject[pid]) {
      byProject[pid] = {
        projectName: run.projectId?.name || 'Unknown',
        salaryReleaseDay: run.projectId?.salaryReleaseDay || 25,
        runs: [],
      };
    }
    byProject[pid].runs.push(run);
  }

  let notificationsSent = 0;

  for (const [projectId, group] of Object.entries(byProject)) {
    const { projectName, salaryReleaseDay } = group;
    const deadline = salaryReleaseDay - 3; // must be done 3 days before release
    const warningDay = deadline - 2;       // early warning 5 days before release
    const daysLeft = salaryReleaseDay - today;

    const isUrgent = today >= deadline;
    const isWarning = today >= warningDay;

    if (!isWarning) continue;

    // Group runs by status to send targeted notifications
    const byStatus = {};
    for (const run of group.runs) {
      if (!byStatus[run.status]) byStatus[run.status] = [];
      byStatus[run.status].push(run);
    }

    for (const [status, statusRuns] of Object.entries(byStatus)) {
      const targetPermission = STATUS_TO_PERMISSION[status];
      if (!targetPermission) continue;

      // Check if we already sent a reminder today for this project/status
      const startOfDay = new Date(currentYear, currentMonth - 1, today);
      const endOfDay = new Date(currentYear, currentMonth - 1, today + 1);

      const alreadySent = await AppNotification.findOne({
        type: 'salary_approval_reminder',
        'referenceModel': 'Project',
        referenceId: projectId,
        createdAt: { $gte: startOfDay, $lt: endOfDay },
        message: new RegExp(status),
      });

      if (alreadySent) continue;

      const count = statusRuns.length;
      const title = isUrgent
        ? `URGENT: Salary approval needed`
        : `Salary approval reminder`;
      const message = isUrgent
        ? `URGENT: ${count} salary run(s) for project ${projectName} need your approval. Salary release date is ${salaryReleaseDay}th. Only ${Math.max(0, daysLeft)} day(s) remaining!`
        : `Reminder: ${count} salary run(s) for project ${projectName} are pending your action. Salary release deadline in ${daysLeft} day(s).`;

      const sent = await notifyByPermission(req, targetPermission, {
        type: 'salary_approval_reminder',
        title,
        message,
        referenceModel: 'Project',
        referenceId: projectId,
      });

      notificationsSent += sent;
    }
  }

  return { notificationsSent };
}

module.exports = { checkAndSendReminders, notifyAccountsBeforeSalaryDate };
