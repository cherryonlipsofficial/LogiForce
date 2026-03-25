import { useQuery } from '@tanstack/react-query';
import { getProjects } from '../../api/projectsApi';

const ProjectSelect = ({ value, onChange, clientId, style = {} }) => {
  const { data } = useQuery({
    queryKey: ['projects-list', clientId],
    queryFn: () => getProjects(clientId ? { clientId } : {}),
    staleTime: 5 * 60 * 1000,
  });

  const projects = data?.data || [];

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', ...style }}>
      <option value="">Select project</option>
      {projects.map((p) => (
        <option key={p._id} value={p._id}>{p.projectCode} — {p.name}</option>
      ))}
    </select>
  );
};

export default ProjectSelect;
