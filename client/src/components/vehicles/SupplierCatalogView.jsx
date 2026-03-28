import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSuppliers } from '../../api/suppliersApi';
import { getCategories, getVehicles } from '../../api/vehiclesApi';
import Badge from '../ui/Badge';
import PermissionGate from '../ui/PermissionGate';
import Btn from '../ui/Btn';
import LoadingSpinner from '../ui/LoadingSpinner';
import AddCategoryModal from './AddCategoryModal';
import AddVehicleModal from './AddVehicleModal';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const typeBadgeVariant = {
  car: 'info',
  bike: 'purple',
  van: 'success',
  truck: 'warning',
  cycle: 'success',
  electric_bike: 'success',
  other: 'default',
};

const statusBadge = (status) => {
  const map = {
    available: 'success',
    assigned: 'info',
    maintenance: 'warning',
    'off-hired': 'danger',
  };
  return map[status] || 'default';
};

const SupplierCatalogView = () => {
  const { isMobile, isTablet } = useBreakpoint();
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);

  // Fetch suppliers
  const { data: suppliersData, isLoading: suppliersLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => getSuppliers(),
  });
  const suppliers = suppliersData?.data || [];

  const selectedSupplier = suppliers.find((s) => s._id === selectedSupplierId);

  // Fetch categories for selected supplier
  const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories', selectedSupplierId],
    queryFn: () => getCategories({ supplierId: selectedSupplierId }),
    enabled: !!selectedSupplierId,
  });
  const categories = categoriesData?.data || [];

  const selectedCategory = categories.find((c) => c._id === selectedCategoryId);

  // Fetch vehicles for selected category
  const { data: vehiclesData, isLoading: vehiclesLoading } = useQuery({
    queryKey: ['vehicles', { categoryId: selectedCategoryId }],
    queryFn: () => getVehicles({ categoryId: selectedCategoryId, limit: 50 }),
    enabled: !!selectedCategoryId,
  });
  const vehicles = vehiclesData?.data || [];

  const handleSupplierClick = (id) => {
    setSelectedSupplierId(id);
    setSelectedCategoryId(null);
  };

  const handleCategoryClick = (id) => {
    setSelectedCategoryId(id);
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr' : '260px 1fr',
        gap: 20,
        minHeight: 600,
      }}
    >
      {/* LEFT COLUMN — Supplier list */}
      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text3)',
            marginBottom: 10,
          }}
        >
          Suppliers
        </div>

        {suppliersLoading ? (
          <LoadingSpinner />
        ) : suppliers.length === 0 ? (
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>
            No suppliers found
          </div>
        ) : (
          suppliers.map((supplier) => {
            const isSelected = supplier._id === selectedSupplierId;
            return (
              <div
                key={supplier._id}
                onClick={() => handleSupplierClick(supplier._id)}
                style={{
                  background: isSelected
                    ? 'rgba(79,142,247,0.08)'
                    : 'var(--surface2)',
                  border: isSelected
                    ? '1px solid rgba(79,142,247,0.4)'
                    : '1px solid transparent',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 6,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--text)',
                      marginBottom: 4,
                    }}
                  >
                    {supplier.name}
                  </div>
                  <Badge
                    variant={
                      supplier.serviceType?.toLowerCase().includes('vehicle') ||
                      supplier.serviceType?.toLowerCase().includes('lease')
                        ? 'purple'
                        : 'info'
                    }
                  >
                    {supplier.serviceType || 'Supplier'}
                  </Badge>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 12,
                      color: 'var(--text)',
                    }}
                  >
                    {supplier.vehicleCount || 0} vehicles
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text3)',
                      marginTop: 2,
                    }}
                  >
                    {supplier.contractCount || 0} contracts
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* RIGHT COLUMN */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* TOP HALF — Category table */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {!selectedSupplierId ? (
            <div
              style={{
                color: 'var(--text3)',
                fontSize: 13,
                padding: '60px 0',
                textAlign: 'center',
              }}
            >
              Select a supplier to view categories
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 14,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  Vehicle categories — {selectedSupplier?.name}
                </div>
                <Btn
                  small
                  variant="primary"
                  onClick={() => setShowAddCategoryModal(true)}
                >
                  + Add category
                </Btn>
              </div>

              {categoriesLoading ? (
                <LoadingSpinner />
              ) : categories.length === 0 ? (
                <div
                  style={{
                    color: 'var(--text3)',
                    fontSize: 13,
                    textAlign: 'center',
                    padding: '40px 0',
                  }}
                >
                  No categories yet — add one to get started
                </div>
              ) : (
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    overflow: 'hidden',
                  }}
                >
                  {/* Table header */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        '90px 1fr 120px 70px 70px 140px',
                      padding: '8px 14px',
                      background: 'var(--surface2)',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    <span>Type</span>
                    <span>Make & Model</span>
                    <span>Default rate</span>
                    <span>Active</span>
                    <span>Idle</span>
                    <span>Actions</span>
                  </div>

                  {/* Table rows */}
                  {categories.map((cat) => {
                    const isSelected = cat._id === selectedCategoryId;
                    return (
                      <div
                        key={cat._id}
                        onClick={() => handleCategoryClick(cat._id)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            '90px 1fr 120px 70px 70px 140px',
                          padding: '10px 14px',
                          borderTop: '1px solid var(--border)',
                          cursor: 'pointer',
                          background: isSelected
                            ? 'rgba(79,142,247,0.06)'
                            : 'transparent',
                          transition: 'background 0.1s',
                          alignItems: 'center',
                        }}
                      >
                        <span>
                          <Badge
                            variant={
                              typeBadgeVariant[cat.type] || 'default'
                            }
                          >
                            {cat.type || 'other'}
                          </Badge>
                        </span>
                        <span>
                          <div style={{ fontSize: 13 }}>
                            {cat.make} {cat.model}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--text3)',
                            }}
                          >
                            {cat.name}
                          </div>
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 12,
                            color: '#4ade80',
                          }}
                        >
                          AED {cat.defaultMonthlyRate || 0}/mo
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 12,
                            color: '#4ade80',
                          }}
                        >
                          {cat.activeCount || 0}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 12,
                            color: 'var(--text3)',
                          }}
                        >
                          {cat.idleCount || 0}
                        </span>
                        <span
                          style={{
                            display: 'flex',
                            gap: 6,
                          }}
                        >
                          <Btn
                            small
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCategoryClick(cat._id);
                            }}
                          >
                            View vehicles
                          </Btn>
                          <Btn
                            small
                            variant="ghost"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Edit
                          </Btn>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* BOTTOM HALF — Vehicle list for selected category */}
        {selectedCategoryId && (
          <div
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: 14,
              marginTop: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {selectedCategory
                  ? `${selectedCategory.make} ${selectedCategory.model}`
                  : 'Category'}{' '}
                — individual units
              </div>
              <PermissionGate permission="vehicles.create">
                <Btn
                  small
                  variant="primary"
                  onClick={() => setShowAddVehicleModal(true)}
                >
                  + Add vehicle
                </Btn>
              </PermissionGate>
            </div>

            {vehiclesLoading ? (
              <LoadingSpinner />
            ) : vehicles.length === 0 ? (
              <div
                style={{
                  color: 'var(--text3)',
                  fontSize: 13,
                  textAlign: 'center',
                  padding: '30px 0',
                }}
              >
                No vehicles in this category
              </div>
            ) : (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                {/* Vehicle table header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      '120px 60px 80px 100px 1fr 120px 80px',
                    padding: '8px 14px',
                    background: 'var(--surface2)',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text3)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  <span>Plate</span>
                  <span>Year</span>
                  <span>Color</span>
                  <span>Status</span>
                  <span>Driver</span>
                  <span>Contract exp.</span>
                  <span>Actions</span>
                </div>

                {/* Vehicle rows */}
                {vehicles.map((v) => (
                  <div
                    key={v._id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        '120px 60px 80px 100px 1fr 120px 80px',
                      padding: '9px 14px',
                      borderTop: '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 12,
                      }}
                    >
                      {v.plateNumber}
                    </span>
                    <span style={{ fontSize: 12 }}>{v.year}</span>
                    <span style={{ fontSize: 12 }}>{v.color}</span>
                    <span>
                      <Badge variant={statusBadge(v.status)}>
                        {v.status || 'unknown'}
                      </Badge>
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {v.currentDriver?.name || '—'}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 11,
                        color: 'var(--text3)',
                      }}
                    >
                      {v.contractExpiry
                        ? new Date(v.contractExpiry).toLocaleDateString()
                        : '—'}
                    </span>
                    <span>
                      <Btn
                        small
                        variant="ghost"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View
                      </Btn>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddCategoryModal && selectedSupplier && (
        <AddCategoryModal
          supplierId={selectedSupplierId}
          supplierName={selectedSupplier.name}
          onClose={() => setShowAddCategoryModal(false)}
          onSuccess={() => setShowAddCategoryModal(false)}
        />
      )}

      {showAddVehicleModal && selectedCategory && (
        <AddVehicleModal
          category={selectedCategory}
          supplierId={selectedSupplierId}
          onClose={() => setShowAddVehicleModal(false)}
          onSuccess={() => setShowAddVehicleModal(false)}
        />
      )}
    </div>
  );
};

export default SupplierCatalogView;
