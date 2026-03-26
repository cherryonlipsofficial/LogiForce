import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import PermissionGate from '../../components/ui/PermissionGate';
import KpiCard from '../../components/ui/KpiCard';
import Avatar from '../../components/ui/Avatar';
import StatusBadge from '../../components/ui/StatusBadge';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Pagination from '../../components/ui/Pagination';
import DriverDetail from './DriverDetail';
import { getDrivers, createDriver, getDriverStatusCounts, exportDriversCsv, bulkImportDrivers, downloadImportTemplate } from '../../api/driversApi';
import { getProjects } from '../../api/projectsApi';

const fallbackDrivers = [
  { id: 'DRV-00814', name: 'Mohamed Al Farsi', nationality: 'Emirati', client: 'Amazon UAE', supplier: 'Own vehicle', status: 'active', baseSalary: 2800, netSalary: 2313, advanceBalance: 500, workingDays: 22, overtimeHrs: 4.5, grossSalary: 2800, deductions: 487, joinDate: '03 Mar 2023', visaExpiry: '15 Apr 2026', emiratesId: '784-1985-1234567-1', phone: '+971 55 123 4567', vehicle: 'AB-12345', payStructure: 'Monthly fixed' },
  { id: 'DRV-00234', name: 'Raj Kumar', nationality: 'Indian', client: 'Amazon UAE', supplier: 'Belhasa', status: 'active', baseSalary: 2200, netSalary: 0, advanceBalance: 1200, workingDays: 0, overtimeHrs: 0, grossSalary: 0, deductions: 225, joinDate: '15 Jun 2022', visaExpiry: '20 Aug 2026', emiratesId: '784-1990-7654321-2', phone: '+971 52 987 6543', vehicle: 'CD-67890', payStructure: 'Monthly fixed' },
  { id: 'DRV-00410', name: 'Carlos Martinez', nationality: 'Filipino', client: 'Noon', supplier: 'EasyLease', status: 'active', baseSalary: 2500, netSalary: 2550, advanceBalance: 0, workingDays: 27, overtimeHrs: 12, grossSalary: 2900, deductions: 350, joinDate: '01 Jan 2023', visaExpiry: '10 Dec 2026', emiratesId: '784-1988-3456789-3', phone: '+971 56 111 2233', vehicle: 'EF-11223', payStructure: 'Monthly fixed' },
  { id: 'DRV-00187', name: 'Suresh Patel', nationality: 'Indian', client: 'Noon', supplier: 'Own vehicle', status: 'active', baseSalary: 2400, netSalary: 2325, advanceBalance: 800, workingDays: 26, overtimeHrs: 8, grossSalary: 2600, deductions: 275, joinDate: '22 Feb 2022', visaExpiry: '05 Mar 2027', emiratesId: '784-1985-9876543-4', phone: '+971 50 444 5566', vehicle: 'GH-33445', payStructure: 'Monthly fixed' },
  { id: 'DRV-00562', name: 'Ahmed Karimi', nationality: 'Pakistani', client: 'Amazon UAE', supplier: 'Belhasa', status: 'on_leave', baseSalary: 2600, netSalary: 2180, advanceBalance: 0, workingDays: 22, overtimeHrs: 0, grossSalary: 2600, deductions: 420, joinDate: '10 Apr 2021', visaExpiry: '25 Nov 2026', emiratesId: '784-1992-1122334-5', phone: '+971 55 777 8899', vehicle: 'IJ-55667', payStructure: 'Monthly fixed' },
  { id: 'DRV-00318', name: 'James Okafor', nationality: 'Nigerian', client: 'Talabat', supplier: 'LeasePlan', status: 'suspended', baseSalary: 2300, netSalary: 1210, advanceBalance: 1800, workingDays: 18, overtimeHrs: 0, grossSalary: 1590, deductions: 380, joinDate: '08 Sep 2023', visaExpiry: '01 Mar 2026', emiratesId: '784-1995-5544332-6', phone: '+971 52 333 4455', vehicle: 'KL-77889', payStructure: 'Monthly fixed' },
  { id: 'DRV-00091', name: 'Ali Hassan', nationality: 'Yemeni', client: 'Amazon UAE', supplier: 'Own vehicle', status: 'active', baseSalary: 2100, netSalary: 0, advanceBalance: 0, workingDays: 0, overtimeHrs: 0, grossSalary: 0, deductions: 75, joinDate: '14 Nov 2022', visaExpiry: '30 Jun 2026', emiratesId: '784-1987-6677889-7', phone: '+971 56 222 3344', vehicle: 'MN-99001', payStructure: 'Monthly fixed' },
  { id: 'DRV-00655', name: 'Priya Sharma', nationality: 'Indian', client: 'Noon', supplier: 'EasyLease', status: 'active', baseSalary: 2700, netSalary: 2490, advanceBalance: 300, workingDays: 24, overtimeHrs: 6, grossSalary: 2800, deductions: 310, joinDate: '05 May 2023', visaExpiry: '12 Sep 2026', emiratesId: '784-1993-2233445-8', phone: '+971 50 666 7788', vehicle: 'OP-12234', payStructure: 'Monthly fixed' },
];

const Drivers = () => {
  const [selected, setSelected] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['drivers', { search, status: statusFilter, projectId: projectFilter, page }],
    queryFn: () => getDrivers({ search, status: statusFilter !== 'all' ? statusFilter : undefined, projectId: projectFilter !== 'all' ? projectFilter : undefined, page, limit: 20 }),
    retry: 1,
    onError: () => toast.error('Failed to load drivers'),
  });

  const { data: countsData } = useQuery({
    queryKey: ['driverStatusCounts'],
    queryFn: () => getDriverStatusCounts(),
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => getProjects({ limit: 1000 }),
  });
  const projectsList = projectsData?.data || [];

  const drivers = data?.data || fallbackDrivers;
  const pagination = data?.pagination;
  const counts = countsData?.data || {};

  const handleExport = async () => {
    try {
      const params = {
        status: statusFilter !== 'all' ? statusFilter : undefined,
        projectId: projectFilter !== 'all' ? projectFilter : undefined,
        search: search || undefined,
      };
      const response = await exportDriversCsv(params);
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'drivers-export.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Drivers exported successfully');
    } catch {
      toast.error('Failed to export drivers');
    }
  };

  const filtered = drivers;

  const getInitials = (name) =>
    name ? name.split(' ').map((n) => n[0]).join('').toUpperCase() : '??';

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Total drivers" value={(counts.total ?? 0).toLocaleString()} />
        <KpiCard label="Active" value={(counts.active ?? 0).toLocaleString()} color="#4ade80" />
        <KpiCard label="On leave" value={(counts.onLeave ?? 0).toLocaleString()} color="#7eb3fc" />
        <KpiCard label="Suspended" value={(counts.suspended ?? 0).toLocaleString()} color="#f87171" />
      </div>

      {/* Table */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or ID..."
            style={{ width: 240, height: 34 }}
          />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={{ width: 160, height: 34 }}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="on_leave">On leave</option>
            <option value="suspended">Suspended</option>
          </select>
          <select value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setPage(1); }} style={{ width: 160, height: 34 }}>
            <option value="all">All projects</option>
            {projectsList.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Btn small variant="ghost" onClick={handleExport}>Export</Btn>
            <PermissionGate permission="drivers.create">
              <Btn small variant="ghost" onClick={() => setShowBulkImportModal(true)}>Bulk import</Btn>
              <Btn small variant="primary" onClick={() => setShowAddModal(true)}>+ Add driver</Btn>
            </PermissionGate>
          </div>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  {['Driver', 'Nationality', 'Project', 'Vehicle', 'Status', 'Base salary', 'Mar net pay', 'Advance'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '9px 14px',
                        fontSize: 11,
                        color: 'var(--text3)',
                        fontWeight: 500,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        textAlign: 'left',
                        background: 'var(--surface2)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr
                    key={d._id || d.id}
                    onClick={() => setSelected(d)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar initials={getInitials(d.fullName || d.name)} size={30} />
                        <div>
                          <div style={{ fontSize: 13 }}>{d.fullName || d.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)' }}>{d.employeeCode || d.id}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12 }}>{d.nationality || '—'}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12 }}>{d.projectId?.name || d.project || '—'}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)' }}>{d.vehiclePlate || '—'}</td>
                    <td style={{ padding: '11px 14px' }}><StatusBadge status={d.status} /></td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>AED {(d.baseSalary || 0).toLocaleString()}</span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: (d.netSalary || 0) > 0 ? '#4ade80' : '#f87171' }}>
                        AED {(d.netSalary || 0).toLocaleString()}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {(d.advanceBalance || 0) > 0 ? (
                        <Badge variant="warning">AED {d.advanceBalance.toLocaleString()}</Badge>
                      ) : (
                        <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={pagination?.pages || 1}
          total={pagination?.total ?? drivers.length}
          pageSize={pagination?.limit || 20}
          onPageChange={setPage}
        />
      </div>

      {/* Side panel */}
      {selected && <DriverDetail driver={selected} onClose={() => setSelected(null)} />}

      {/* Add modal */}
      {showAddModal && <AddDriverModal onClose={() => setShowAddModal(false)} />}

      {/* Bulk import modal */}
      {showBulkImportModal && <BulkImportModal onClose={() => setShowBulkImportModal(false)} />}
    </div>
  );
};

const AddDriverModal = ({ onClose }) => {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors }, setError } = useForm();
  const [submitting, setSubmitting] = useState(false);

  const { data: projectsData } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => getProjects({ limit: 1000 }),
  });
  const projects = projectsData?.data || [];

  const onSubmit = async (formData) => {
    setSubmitting(true);
    try {
      const payload = {
        fullName: formData.fullName,
        nationality: formData.nationality,
        phoneUae: formData.phoneUae,
        baseSalary: Number(formData.baseSalary),
        payStructure: formData.payStructure,
        projectId: formData.projectId,
        emiratesId: formData.emiratesId || undefined,
        joinDate: formData.joinDate || undefined,
      };
      await createDriver(payload);
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      toast.success('Driver created successfully');
      onClose();
    } catch (err) {
      const apiErrors = err?.response?.data?.errors;
      if (apiErrors && Array.isArray(apiErrors)) {
        apiErrors.forEach(({ field, message }) => {
          setError(field, { type: 'server', message });
        });
      } else {
        toast.error(err?.response?.data?.message || 'Failed to create driver');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fieldStyle = { marginBottom: 14 };
  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };
  const errorStyle = { color: '#f87171', fontSize: 11, marginTop: 2, display: 'block' };

  return (
    <Modal title="Add new driver" onClose={onClose} width={520}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Full name *</label>
            <input
              {...register('fullName', {
                required: 'Full name is required',
                minLength: { value: 2, message: 'Must be at least 2 characters' },
                maxLength: { value: 200, message: 'Must be under 200 characters' },
              })}
              placeholder="Mohamed Al Farsi"
            />
            {errors.fullName && <span style={errorStyle}>{errors.fullName.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Nationality *</label>
            <input
              {...register('nationality', { required: 'Nationality is required' })}
              placeholder="Emirati"
            />
            {errors.nationality && <span style={errorStyle}>{errors.nationality.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>UAE Phone *</label>
            <input
              {...register('phoneUae', {
                required: 'UAE phone number is required',
                pattern: {
                  value: /^\+971\d{9}$/,
                  message: 'Must match format +971XXXXXXXXX',
                },
              })}
              placeholder="+971501234567"
            />
            {errors.phoneUae && <span style={errorStyle}>{errors.phoneUae.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Emirates ID</label>
            <input
              {...register('emiratesId', {
                pattern: {
                  value: /^784-\d{4}-\d{7}-\d{1}$/,
                  message: 'Must match format 784-XXXX-XXXXXXX-X',
                },
              })}
              placeholder="784-XXXX-XXXXXXX-X"
            />
            {errors.emiratesId && <span style={errorStyle}>{errors.emiratesId.message}</span>}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Project *</label>
            <select {...register('projectId', { required: 'Project is required' })}>
              <option value="">Select project</option>
              {projects.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
            {errors.projectId && <span style={errorStyle}>{errors.projectId.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Pay structure *</label>
            <select {...register('payStructure', { required: 'Pay structure is required' })}>
              <option value="">Select pay structure</option>
              <option value="MONTHLY_FIXED">Monthly fixed</option>
              <option value="DAILY_RATE">Daily rate</option>
              <option value="PER_TRIP">Per trip</option>
            </select>
            {errors.payStructure && <span style={errorStyle}>{errors.payStructure.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Base salary *</label>
            <input
              type="number"
              step="any"
              {...register('baseSalary', {
                required: 'Base salary is required',
                min: { value: 0.01, message: 'Must be a positive number' },
              })}
              placeholder="2800"
            />
            {errors.baseSalary && <span style={errorStyle}>{errors.baseSalary.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Joining date</label>
            <input type="date" {...register('joinDate')} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create driver'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

const BulkImportModal = ({ onClose }) => {
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
      const res = await bulkImportDrivers(file);
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['driverStatusCounts'] });
      if (res.data.errors?.length > 0) {
        setResult(res.data);
        if (res.data.created > 0) {
          toast.success(`${res.data.created} driver(s) imported, but ${res.data.errors.length} error(s) occurred`);
        }
      } else {
        toast.success(`${res.data.created} driver(s) imported successfully`);
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
      const response = await downloadImportTemplate();
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'drivers-import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download template');
    }
  };

  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };

  return (
    <Modal title="Bulk import drivers" onClose={onClose} width={560}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 12px' }}>
          Upload a CSV or Excel file to import multiple drivers at once. Required columns:
          <strong> fullName, nationality, phoneUae, baseSalary, payStructure, project</strong> (project name or ID).
        </p>
        <Btn small variant="ghost" onClick={handleDownloadTemplate}>
          Download Excel template
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
                  Row {err.row} ({err.fullName}): {err.message}
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
            {uploading ? 'Importing...' : 'Import drivers'}
          </Btn>
        )}
      </div>
    </Modal>
  );
};

export default Drivers;
