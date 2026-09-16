import React, { useState } from 'react';
import { useProjectStore } from '../../stores/project';
import { checkClipsCompatibility } from '../../shared/compatibility';
import { t } from '../../shared/i18n';
import { InfoIcon, ChevronDownIcon } from '../../components/icons';

export const CompatibilityBanner: React.FC = () => {
  const { project, sources } = useProjectStore();
  const [isExpanded, setIsExpanded] = useState(false);

  const check = checkClipsCompatibility(project.clips, sources);

  if (check.isCompatible) {
    return null;
  }

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        borderLeft: '3px solid var(--accent)',
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
        userSelect: 'none',
        transition: 'all var(--dur-fast) var(--ease-out)',
      }}
    >
      {/* Banner Summary Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <InfoIcon size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 'var(--text-12)', fontWeight: 500, color: 'var(--text-primary)' }}>
            {t('clips.incompatible_notice')}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', color: 'var(--text-muted)' }}>
          <span style={{ fontSize: 'var(--text-11)' }}>{t('clips.incompatible_details')}</span>
          <ChevronDownIcon
            size={14}
            style={{
              transform: isExpanded ? 'rotate(180deg)' : 'none',
              transition: 'transform var(--dur-fast) var(--ease-out)',
            }}
          />
        </div>
      </div>

      {/* Expanded Differences Table */}
      {isExpanded && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-3) var(--space-3)',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-inset)',
            overflowX: 'auto',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 'var(--text-11)',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '4px 8px' }}>Property</th>
                {check.diffs[0]?.values.map((v) => (
                  <th key={v.sourceId} style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {v.filename}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {check.diffs.map((diff) => (
                <tr
                  key={diff.property}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: diff.isMismatch ? 'var(--accent-muted)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {diff.property}
                  </td>
                  {diff.values.map((v) => (
                    <td
                      key={v.sourceId}
                      style={{
                        padding: '4px 8px',
                        color: diff.isMismatch ? 'var(--accent)' : 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {v.value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
