import React from 'react';
import { Modal } from '../../components/Modal/Modal';
import { Button } from '../../components/Button/Button';
import { CheckIcon, FolderIcon, PlayIcon } from '../../components/icons';
import { useExportStore } from '../../stores/export';
import { openFile, openFolder } from '../../shared/ipc';
import { formatTimecode, t } from '../../shared/i18n';

export const ExportCompleteModal: React.FC = () => {
  const {
    isCompleteModalOpen,
    closeCompleteModal,
    lastExportedPath,
    lastExportDurationMs,
  } = useExportStore();

  const handleOpenFile = async () => {
    if (lastExportedPath) {
      await openFile(lastExportedPath);
    }
  };

  const handleShowInFolder = async () => {
    if (lastExportedPath) {
      await openFolder(lastExportedPath);
    }
  };

  const filename = lastExportedPath.split(/[/\\]/).pop() || lastExportedPath;

  return (
    <Modal
      isOpen={isCompleteModalOpen}
      onClose={closeCompleteModal}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <CheckIcon size={18} />
          <span>{t('export.complete_title')}</span>
        </div>
      }
      width="480px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant="secondary" onClick={handleShowInFolder}>
              <FolderIcon size={14} />
              <span>{t('export.show_in_folder')}</span>
            </Button>
            <Button variant="secondary" onClick={handleOpenFile}>
              <PlayIcon size={14} />
              <span>{t('export.open_file')}</span>
            </Button>
          </div>
          <Button variant="primary" onClick={closeCompleteModal}>
            {t('common.close')}
          </Button>
        </div>
      }
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-4)',
          padding: 'var(--space-4) 0',
          textAlign: 'center',
        }}
      >
        {/* Success Icon Badge */}
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: 'var(--r-full)',
            background: 'var(--bg-inset)',
            border: '2px solid var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent)',
          }}
        >
          <CheckIcon size={28} />
        </div>

        {/* File name & Duration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', maxWidth: '100%' }}>
          <div
            style={{
              fontSize: 'var(--text-15)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              wordBreak: 'break-all',
            }}
          >
            {filename}
          </div>
          <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)' }}>
            {formatTimecode(lastExportDurationMs)}
          </div>
        </div>

        {/* Path preview */}
        <div
          style={{
            width: '100%',
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-md)',
            fontSize: 'var(--text-11)',
            color: 'var(--text-secondary)',
            wordBreak: 'break-all',
            textAlign: 'left',
          }}
        >
          {lastExportedPath}
        </div>
      </div>
    </Modal>
  );
};
