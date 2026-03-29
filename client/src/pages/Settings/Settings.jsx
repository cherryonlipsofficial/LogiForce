import PermissionGate from '../../components/ui/PermissionGate';
import CompanyPanel from '../../components/settings/CompanyPanel';

const Settings = () => {
  return (
    <PermissionGate permission="settings.edit">
      <CompanyPanel />
    </PermissionGate>
  );
};

export default Settings;
