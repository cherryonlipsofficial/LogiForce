import { useQuery } from '@tanstack/react-query';
import { getClients } from '../../api/clientsApi';

const ClientSelect = ({ value, onChange, showAll, style = {} }) => {
  const { data } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => getClients({ limit: 1000 }),
    staleTime: 5 * 60 * 1000,
  });

  const clients = data?.data || [];

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', ...style }}>
      <option value={showAll ? 'all' : ''}>{showAll ? 'All clients' : 'Select client'}</option>
      {clients.map((c) => (
        <option key={c._id} value={c._id}>{c.name}</option>
      ))}
    </select>
  );
};

export default ClientSelect;
