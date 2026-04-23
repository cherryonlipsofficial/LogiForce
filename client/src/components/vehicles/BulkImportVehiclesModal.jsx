import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Btn from '../ui/Btn';
import { bulkUploadVehicles, downloadVehicleTemplate } from '../../api/vehiclesApi';
import { downloadBlob } from '../../utils/downloadBlob';

const BulkImportVehiclesModal = ({ onClose }) => {
  const queryClient = useQueryClient();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      const ext = selected.name.split('.').pop().toLowerCase();
      if (!['csv', 'xlsx', 'xls'].includes(ext)) {
        toast.error('Please select a .csv or .xlsx file');
        return;
      }
      setFile(selected);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await bulkUploadVehicles(file);
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-summary'] });
      const data = res.data || res;
      if (data.errors?.length > 0) {
        setResult(data);
        if (data.created > 0) {
          toast.success(`${data.created} vehicle(s) imported, but ${data.errors.length} error(s) occurred`);
        }
      } else {
        toast.success(`${data.created ?? data.count ?? 0} vehicle(s) imported successfully`);
        onClose();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Import failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await downloadVehicleTemplate();
      const blob = new Blob([response.data], { type: 'text/csv' });
      downloadBlob(blob, 'vehicles-import-template.csv');
    } catch {
      toast.error('Failed to download template');
    }
  };

  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };

  return (
    <Modal title="Bulk import vehicles" onClose={onClose} width={560}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 12px' }}>
          Upload a CSV or Excel file to import multiple vehicles at once. Supported columns:
          <strong> Plate, Make, Model, Year, Color, Vehicle Type, Status, Supplier Name, Monthly Rate, Contract Start, Contract End, Mulkiya Expiry, Insurance Expiry, Own Vehicle, Notes</strong>.
        </p>
        <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 12px' }}>
          Download the template below to see the expected format. Supplier names must match existing suppliers in the system. Maximum 500 rows per upload.
        </p>
        <Btn small variant="ghost" onClick={handleDownloadTemplate}>
          Download CSV template
        </Btn>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Select file *</label>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileChange}
          style={{ fontSize: 13 }}
        />
        {file && (
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
            Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
          </div>
        )}
      </div>

      {result && (
        <div style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 14,
          marginBottom: 16,
          fontSize: 13,
        }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: '#4ade80', fontWeight: 500 }}>{result.created} created</span>
            {result.errors.length > 0 && (
              <span style={{ color: '#f87171', fontWeight: 500, marginLeft: 12 }}>
                {result.errors.length} error(s)
              </span>
            )}
          </div>
          {result.errors.length > 0 && (
            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
              {result.errors.map((err, i) => (
                <div key={i} style={{ fontSize: 11, color: '#f87171', padding: '3px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  Row {err.row}: {err.message || err.error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>{result ? 'Close' : 'Cancel'}</Btn>
        {!result && (
          <Btn variant="primary" onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? 'Importing...' : 'Import vehicles'}
          </Btn>
        )}
      </div>
    </Modal>
  );
};

export default BulkImportVehiclesModal;
