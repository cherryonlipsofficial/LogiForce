import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import KpiCard from '../../components/ui/KpiCard';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import SidePanel from '../../components/ui/SidePanel';
import ClientSelect from '../../components/ui/ClientSelect';
import { useAuth } from '../../context/AuthContext';
import PermissionGate from '../../components/ui/PermissionGate';
import { getProjects, createProject, updateProject, deleteProject, assignDriverToProject, unassignDriverFromProject, getProjectDrivers } from '../../api/projectsApi';
import { getDrivers } from '../../api/driversApi';
import { formatDate } from '../../utils/formatters';
import { useFormatters } from '../../hooks/useFormatters';
import Pagination from '../../components/ui/Pagination';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const statusColors = {
  active: 'success',
  on_hold: 'warning',
  completed: 'default',
  cancelled: 'danger',
};

// Legacy canEdit removed — using PermissionGate / hasPermission instead

const Projects = () => {
  const { isMobile, isTablet } = useBreakpoint();
  const { formatCurrencyFull } = useFormatters();
  const [search, setSearch] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [page, setPage] = useState(1);
  const { hasPermission } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['projects', filterClient, filterStatus, search, page],
    queryFn: () => getProjects({
      ...(filterClient && { clientId: filterClient }),
      ...(filterStatus && { status: filterStatus }),
      ...(search && { search }),
      page,
      limit: 20,
    }),
    retry: 1,
  });

  const { mutate: doDelete } = useMutation({
    mutationFn: (id) => deleteProject(id),
    onSuccess: () => {
      toast.success('Project deleted');
      qc.invalidateQueries(['projects']);
      setSelectedProjectId(null);
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to delete project'),
  });

  const projects = data?.data || [];
  const pagination = data?.pagination;
  const activeCount = projects.filter((p) => p.status === 'active').length;
  const totalDrivers = projects.reduce((s, p) => s + (p.driverCount || 0), 0);

  const selectedProject = selectedProjectId ? projects.find((p) => p._id === selectedProjectId) || null : null;
  const editingProject = editingProjectId ? projects.find((p) => p._id === editingProjectId) || null : null;

  const handleEdit = (project) => {
    setSelectedProjectId(null);
    setEditingProjectId(project._id);
  };

  const handleDelete = (project) => {
    if (window.confirm(`Are you sure you want to delete "${project.name}"? This action cannot be undone.`)) {
      doDelete(project._id);
    }
  };

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard label="Total projects" value={projects.length} />
        <KpiCard label="Active" value={activeCount} color="#4ade80" />
        <KpiCard label="Total drivers" value={totalDrivers.toLocaleString()} />
        <KpiCard label="On hold" value={projects.filter((p) => p.status === 'on_hold').length} color="#facc15" />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search projects..." style={{ width: 220, height: 34 }} />
          <div style={{ width: 180 }}>
            <ClientSelect value={filterClient} onChange={(v) => { setFilterClient(v); setPage(1); }} />
          </div>
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} style={{ width: 140, height: 34 }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <PermissionGate permission="projects.create">
              <Btn small variant="primary" onClick={() => setShowAddModal(true)}>+ Add project</Btn>
            </PermissionGate>
          </div>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : projects.length === 0 ? (
          <EmptyState title="No projects found" message="Add a project to get started." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  {['Code', 'Project', 'Client', 'Rate/Driver', 'Drivers', 'Location', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', background: 'var(--surface2)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr
                    key={p._id}
                    onClick={() => setSelectedProjectId(p._id)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 12 }}>{p.projectCode}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                      {p.serviceType && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{p.serviceType}</div>}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12 }}>
                      <div>{p.clientId?.name || '—'}</div>
                      {p.clientId?._id && <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{p.clientId._id}</div>}
                    </td>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 12 }}>{formatCurrencyFull(p.ratePerDriver)}</td>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 12 }}>{p.driverCount || 0}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)' }}>{p.location || '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <Badge variant={statusColors[p.status] || 'default'}>{p.status?.replace('_', ' ')}</Badge>
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
          total={pagination?.total ?? projects.length}
          pageSize={pagination?.limit || 20}
          onPageChange={setPage}
        />
      </div>

      {selectedProject && <ProjectDetail project={selectedProject} onClose={() => setSelectedProjectId(null)} onEdit={handleEdit} onDelete={handleDelete} hasPermission={hasPermission} />}
      {showAddModal && <ProjectFormModal onClose={() => setShowAddModal(false)} />}
      {editingProject && <ProjectFormModal project={editingProject} onClose={() => setEditingProjectId(null)} />}
    </div>
  );
};

const ProjectDetail = ({ project, onClose, onEdit, onDelete, hasPermission }) => {
  const { isMobile } = useBreakpoint();
  const { formatCurrencyFull } = useFormatters();
  const qc = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);

  const { data: driversData } = useQuery({
    queryKey: ['project-drivers', project._id],
    queryFn: () => getProjectDrivers(project._id, { limit: 100 }),
  });

  const { mutate: doUnassign } = useMutation({
    mutationFn: (driverId) => unassignDriverFromProject(driverId),
    onSuccess: () => {
      toast.success('Driver unassigned');
      qc.invalidateQueries(['project-drivers', project._id]);
      qc.invalidateQueries(['projects']);
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to unassign'),
  });

  const drivers = driversData?.data || [];

  return (
    <SidePanel onClose={onClose}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{project.projectCode}</div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{project.name}</div>
          <Badge variant={statusColors[project.status] || 'default'}>{project.status?.replace('_', ' ')}</Badge>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {hasPermission('projects.edit') && <Btn small variant="ghost" onClick={() => onEdit(project)}>Edit</Btn>}
          {hasPermission('projects.delete') && <Btn small variant="ghost" onClick={() => onDelete(project)} style={{ color: '#f87171' }}>Delete</Btn>}
          <button onClick={onClose} style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 8, padding: '4px 10px', fontSize: 16 }}>&times;</button>
        </div>
      </div>
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <InfoRow label="Client" value={project.clientId?.name} />
          <InfoRow label="Rate per driver" value={formatCurrencyFull(project.ratePerDriver)} />
          <InfoRow label="Rate basis" value={project.rateBasis?.replace('_', ' ')} />
          <InfoRow label="Currency" value={project.currency || 'AED'} />
          <InfoRow label="Location" value={project.location} />
          <InfoRow label="Service type" value={project.serviceType} />
          <InfoRow label="Planned drivers" value={project.plannedDriverCount} />
          <InfoRow label="Actual drivers" value={project.driverCount || 0} />
          <InfoRow label="Ops contact" value={project.operationsContactName} />
          <InfoRow label="Ops phone" value={project.operationsContactPhone} />
          <InfoRow label="Ops email" value={project.operationsContactEmail} />
          <InfoRow label="Created" value={formatDate(project.createdAt)} />
        </div>
        {project.description && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Description</div>
            <div style={{ fontSize: 13 }}>{project.description}</div>
          </div>
        )}

        {/* Assigned drivers */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Assigned drivers ({drivers.length})</div>
            {hasPermission('projects.assign_drivers') && <Btn small variant="primary" onClick={() => setShowAssign(true)}>+ Assign</Btn>}
          </div>
          {drivers.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: '10px 0' }}>No drivers assigned yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {drivers.map((d) => (
                <div key={d._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{d.fullName}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{d.employeeCode} · {d.status}</div>
                  </div>
                  {hasPermission('projects.assign_drivers') && (
                    <Btn small variant="ghost" onClick={() => {
                      if (window.confirm(`Unassign ${d.fullName} from this project?`)) doUnassign(d._id);
                    }} style={{ color: '#f87171', fontSize: 11 }}>Unassign</Btn>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {showAssign && <AssignDriverModal projectId={project._id} clientId={project.clientId?._id || project.clientId} onClose={() => setShowAssign(false)} />}
    </SidePanel>
  );
};

const AssignDriverModal = ({ projectId, clientId, onClose }) => {
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const qc = useQueryClient();

  const { data: driversData } = useQuery({
    queryKey: ['available-drivers', clientId],
    queryFn: () => getDrivers({ clientId, limit: 500 }),
  });

  const drivers = (driversData?.data || []).filter((d) => !d.projectId || d.projectId === projectId);

  const { mutate: doAssign, isPending: isLoading } = useMutation({
    mutationFn: () => assignDriverToProject(projectId, selectedDriverId),
    onSuccess: () => {
      toast.success('Driver assigned');
      qc.invalidateQueries(['project-drivers', projectId]);
      qc.invalidateQueries(['projects']);
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to assign driver'),
  });

  return (
    <Modal title="Assign driver to project" onClose={onClose} width={420}>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Select driver</label>
        <select value={selectedDriverId} onChange={(e) => setSelectedDriverId(e.target.value)} style={{ width: '100%' }}>
          <option value="">Choose a driver...</option>
          {drivers.map((d) => (
            <option key={d._id} value={d._id}>
              {d.employeeCode} — {d.fullName} {d.projectId ? '(currently assigned)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={() => doAssign()} disabled={!selectedDriverId || isLoading}>
          {isLoading ? 'Assigning...' : 'Assign'}
        </Btn>
      </div>
    </Modal>
  );
};

const InfoRow = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value || '—'}</div>
  </div>
);

const ProjectFormModal = ({ project, onClose }) => {
  const { isMobile } = useBreakpoint();
  const isEdit = !!project;
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: isEdit ? {
      name: project.name || '',
      description: project.description || '',
      clientId: project.clientId?._id || project.clientId || '',
      ratePerDriver: project.ratePerDriver || '',
      rateBasis: project.rateBasis || 'monthly_fixed',
      currency: project.currency || 'AED',
      operationsContactName: project.operationsContactName || '',
      operationsContactPhone: project.operationsContactPhone || '',
      operationsContactEmail: project.operationsContactEmail || '',
      location: project.location || '',
      serviceType: project.serviceType || '',
      status: project.status || 'active',
      plannedDriverCount: project.plannedDriverCount || 0,
      salaryReleaseDay: project.salaryReleaseDay || 25,
    } : {
      rateBasis: 'monthly_fixed',
      currency: 'AED',
      status: 'active',
      plannedDriverCount: 0,
      salaryReleaseDay: 25,
    },
  });
  const qc = useQueryClient();

  const { mutate: save, isPending: isLoading } = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        ratePerDriver: Number(data.ratePerDriver),
        plannedDriverCount: Number(data.plannedDriverCount) || 0,
        salaryReleaseDay: Number(data.salaryReleaseDay) || 25,
      };
      return isEdit ? updateProject(project._id, payload) : createProject(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Project updated' : 'Project created');
      qc.invalidateQueries(['projects']);
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.message || (isEdit ? 'Failed to update project' : 'Failed to create project')),
  });

  const fieldStyle = { marginBottom: 14 };
  const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 };

  return (
    <Modal title={isEdit ? 'Edit project' : 'Add new project'} onClose={onClose} width={560}>
      <form onSubmit={handleSubmit((data) => save(data))}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Project name *</label>
            <input {...register('name', { required: true })} placeholder="Last-Mile Dubai" />
            {errors.name && <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Client *</label>
            <ClientSelect value={watch('clientId')} onChange={(v) => {
              setValue('clientId', v, { shouldValidate: true });
            }} />
            <input type="hidden" {...register('clientId', { required: true })} />
            {errors.clientId && <span style={{ color: '#f87171', fontSize: 11 }}>Required</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Rate per driver *</label>
            <input type="number" step="any" {...register('ratePerDriver', { required: true, min: 0 })} placeholder="2500" />
            {errors.ratePerDriver && <span style={{ color: '#f87171', fontSize: 11 }}>Required (positive number)</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Rate basis</label>
            <select {...register('rateBasis')}>
              <option value="monthly_fixed">Monthly fixed</option>
              <option value="daily_rate">Daily rate</option>
              <option value="per_order">Per order</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Currency</label>
            <select {...register('currency')}>
              <option value="AED">AED</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Status</label>
            <select {...register('status')}>
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Location</label>
            <input {...register('location')} placeholder="Dubai - Jumeirah" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Service type</label>
            <input {...register('serviceType')} placeholder="Last-mile delivery" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Planned driver count</label>
            <input type="number" {...register('plannedDriverCount')} placeholder="0" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Salary release day (1-28)</label>
            <input type="number" min="1" max="28" {...register('salaryReleaseDay', { min: 1, max: 28 })} placeholder="25" />
            {errors.salaryReleaseDay && <span style={{ color: '#f87171', fontSize: 11 }}>Must be between 1 and 28</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Ops contact name</label>
            <input {...register('operationsContactName')} placeholder="John Doe" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Ops contact phone</label>
            <input {...register('operationsContactPhone', { validate: (v) => !v || /^\+?\d{7,15}$/.test(v) || 'Enter a valid phone number (no spaces, 7-15 digits, optional + prefix)' })} placeholder="+971501234567" onKeyDown={(e) => { if (e.key === ' ') e.preventDefault(); }} onPaste={(e) => { const pasted = e.clipboardData.getData('text'); if (/\s/.test(pasted)) { e.preventDefault(); const cleaned = pasted.replace(/\s/g, ''); document.execCommand('insertText', false, cleaned); } }} />
            {errors.operationsContactPhone && <span style={{ color: '#f87171', fontSize: 11 }}>{errors.operationsContactPhone.message}</span>}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Ops contact email</label>
            <input type="email" {...register('operationsContactEmail')} placeholder="ops@company.com" />
          </div>
          <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Description</label>
            <textarea {...register('description')} rows={2} placeholder="Project details..." style={{ width: '100%', resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={isLoading}>{isLoading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save changes' : 'Create project')}</Btn>
        </div>
      </form>
    </Modal>
  );
};

export default Projects;
