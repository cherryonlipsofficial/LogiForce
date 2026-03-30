const { SalaryRun, Project, AppNotification } = require('../models');
const { notifyByRole } = require('./notification.service');

// Map salary run status → which role should be notified
const STATUS_TO_ROLE = {
  draft: ['ops'],
  ops_approved: ['compliance'],
  compliance_approved: ['junior_accountant'],
  accounts_approved: ['accountant'],
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
async function checkAndSendReminders() {
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
      const targetRoles = STATUS_TO_ROLE[status];
      if (!targetRoles) continue;

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

      const sent = await notifyByRole(targetRoles, {
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

module.exports = { checkAndSendReminders };
