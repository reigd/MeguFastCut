import React from 'react';
import { useProjectStore } from '../../stores/project';
import { Button } from '../../components/Button/Button';
import { t } from '../../shared/i18n';

export const PositionPresets: React.FC = () => {
  const { setCropPosition } = useProjectStore();

  const positions: { id: 'center' | 'top' | 'bottom' | 'left' | 'right'; label: string }[] = [
    { id: 'center', label: t('transform.pos_center') },
    { id: 'left', label: t('transform.pos_left') },
    { id: 'right', label: t('transform.pos_right') },
    { id: 'top', label: t('transform.pos_top') },
    { id: 'bottom', label: t('transform.pos_bottom') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-primary)' }}>
        {t('transform.position')}
      </label>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '4px',
        }}
      >
        {positions.map((pos) => (
          <Button
            key={pos.id}
            size="sm"
            variant="secondary"
            onClick={() => setCropPosition(pos.id)}
            style={{
              padding: '4px 2px',
              fontSize: 'var(--text-11)',
              justifyContent: 'center',
            }}
          >
            {pos.label}
          </Button>
        ))}
      </div>
    </div>
  );
};
