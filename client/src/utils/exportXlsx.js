import { downloadBlob } from './downloadBlob';

/**
 * Export an array of objects to CSV.
 * @param {Array} data - array of row objects
 * @param {Array} columns - [{ header: 'Display Name', accessor: 'fieldName' }]
 *   accessor supports dot notation like 'statusCounts.active'
 * @param {string} filename - download filename (default: 'report.csv')
 */
export function exportToCSV(data, columns, filename = 'report.csv') {
  const headers = columns.map(c => c.header);
  const rows = data.map(row =>
    columns.map(c => {
      // Support dot notation accessors like 'statusCounts.active'
      let val = c.accessor.split('.').reduce((obj, key) => obj?.[key], row);
      if (val === null || val === undefined) val = '';
      val = String(val);
      // Escape for CSV
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    })
  );

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}
