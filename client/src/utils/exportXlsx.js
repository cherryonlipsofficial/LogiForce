import { downloadBlob } from './downloadBlob';

/**
 * Export an array of objects to XLSX (actually CSV for now - no external dependency).
 * @param {Array} data - array of row objects
 * @param {Array} columns - [{ header: 'Name', accessor: 'fieldName' }]
 * @param {string} filename - download filename
 */
export function exportToCSV(data, columns, filename = 'report.csv') {
  const headers = columns.map(c => c.header);
  const rows = data.map(row =>
    columns.map(c => {
      let val = c.accessor.split('.').reduce((obj, key) => obj?.[key], row);
      if (val === null || val === undefined) val = '';
      // Escape commas and quotes in CSV
      val = String(val);
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    })
  );

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  downloadBlob(blob, filename);
}
