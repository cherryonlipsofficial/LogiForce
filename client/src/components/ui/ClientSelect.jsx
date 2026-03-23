import { useQuery } from '@tanstack/react-query';
import { getClients } from '../../api/clientsApi';

const ClientSelect = ({ value, onChange, style = {} }) => {
  const { data } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => getClients(),
    staleTime: 5 * 60 * 1000,
  });

  const clients = data?.data || [];

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', ...style }}>
      <option value="">Select client</option>
      {clients.map((c) => (
        <option key={c._id} value={c._id}>{c.name}</option>
      ))}
    </select>
  );
};

export default ClientSelect;
