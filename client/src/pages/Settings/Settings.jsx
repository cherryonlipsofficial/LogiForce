import PermissionGate from '../../components/ui/PermissionGate';
import CompanyPanel from '../../components/settings/CompanyPanel';

const Settings = () => {
  return (
    <PermissionGate permission="settings.manage">
      <CompanyPanel />
    </PermissionGate>
  );
};

export default Settings;
