import React, { useState } from 'react';
import { Modal } from '../../components/Modal/Modal';
import { Button } from '../../components/Button/Button';
import { AlertIcon, TrashIcon } from '../../components/icons';
import { useProjectStore } from '../../stores/project';
import { useSettingsStore } from '../../stores/settings';
import { useUiStore } from '../../stores/ui';
import { usePlayerStore } from '../../stores/player';
import { useExportStore } from '../../stores/export';
import {
  checkReplaceEligibility,
  generateReplaceTempPath,
  finalizeReplace,
} from '../../shared/ipc';
import { formatTimecode, t } from '../../shared/i18n';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const ReplaceConfirmModal: React.FC = () => {
  const { isReplaceConfirmOpen, setReplaceConfirmOpen, addToast } = useUiStore();
  const { project, sources, updateSourceAfterReplace } = useProjectStore();
  const { alwaysConfirmReplace, setAlwaysConfirmReplace } = useSettingsStore();
  const { startExportJob } = useExportStore();
  const { seek } = usePlayerStore();

  const [dontAskAgain, setDontAskAgain] = useState(!alwaysConfirmReplace);
  const [isReplacing, setIsReplacing] = useState(false);

  const source = sources[0];
  const enabledClips = project.clips.filter((c) => c.enabled);
  const newDurationMs = enabledClips.reduce((sum, c) => sum + (c.outMs - c.inMs), 0);
  const origDurationMs = source?.probe.durationMs || 0;
  const origSizeBytes = source?.probe.sizeBytes || 0;

  // Estimate new file size proportional to duration
  const estSizeBytes = origDurationMs > 0
    ? Math.round((newDurationMs / origDurationMs) * origSizeBytes)
    : origSizeBytes;

  const handleConfirm = async () => {
    if (!source) return;

    if (dontAskAgain) {
      setAlwaysConfirmReplace(false);
    }

    setReplaceConfirmOpen(false);
    setIsReplacing(true);

    try {
      // Step 1: Pre-flight eligibility check
      await checkReplaceEligibility(source.path);

      // Step 2: Generate temp path
      const tempPath = await generateReplaceTempPath(source.path);

      // Step 3: Run export directly into the temp file
      await startExportJob(tempPath);

      // Listen for export completion or poll briefly
      // Wait for finalize once exported
      const pollComplete = async () => {
        const checkState = async () => {
          const exportState = useExportStore.getState();
          if (!exportState.isExporting && exportState.progress?.status === 'complete') {
            try {
              // Finalize atomic swap and move original to Recycle Bin
              const newProbe = await finalizeReplace(tempPath, source.path);
              updateSourceAfterReplace(source.id, newProbe);
              seek(0);

              addToast({
                message: t('replace.toast_replaced'),
                durationMs: 10000,
              });
            } catch (err) {
              addToast({
                message: typeof err === 'string' ? err : JSON.stringify(err),
                durationMs: 8000,
              });
            }
          } else if (!exportState.isExporting && exportState.errorMessage) {
            addToast({
              message: exportState.errorMessage,
              durationMs: 8000,
            });
          } else if (exportState.isExporting) {
            setTimeout(checkState, 300);
          }
        };
        setTimeout(checkState, 300);
      };

      pollComplete();
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : String(err),
        durationMs: 8000,
      });
    } finally {
      setIsReplacing(false);
    }
  };

  if (!source) return null;

  const filename = source.filename;
  const origResolution = source.probe.video
    ? `${source.probe.video.width}×${source.probe.video.height}`
    : 'Unknown';

  return (
    <Modal
      isOpen={isReplaceConfirmOpen}
      onClose={() => setReplaceConfirmOpen(false)}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <AlertIcon size={18} />
          <span>{t('replace.confirm_title')}</span>
        </div>
      }
      width="500px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <Button variant="secondary" onClick={() => setReplaceConfirmOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" disabled={isReplacing} onClick={handleConfirm}>
            <TrashIcon size={14} />
            <span>{t('replace.replace_btn')}</span>
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-2) 0' }}>
        <div style={{ fontSize: 'var(--text-13)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {t('replace.confirm_msg')}
        </div>

        {/* File name box */}
        <div
          style={{
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-md)',
            fontSize: 'var(--text-12)',
            color: 'var(--text-primary)',
            fontWeight: 500,
            wordBreak: 'break-all',
          }}
        >
          {filename}
        </div>

        {/* Before / After Comparison Table */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr 1fr',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-md)',
            overflow: 'hidden',
            fontSize: 'var(--text-12)',
          }}
        >
          <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--bg-inset)', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {t('replace.before_after')}
          </div>
          <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--bg-inset)', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {t('replace.was')}
          </div>
          <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--bg-inset)', fontWeight: 600, color: 'var(--accent)' }}>
            {t('replace.will_be')}
          </div>

          {/* Duration */}
          <div style={{ padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
            {t('replace.duration')}
          </div>
          <div style={{ padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
            {formatTimecode(origDurationMs)}
          </div>
          <div style={{ padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--border-subtle)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {formatTimecode(newDurationMs)}
          </div>

          {/* Resolution */}
          <div style={{ padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
            {t('replace.resolution')}
          </div>
          <div style={{ padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
            {origResolution}
          </div>
          <div style={{ padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--border-subtle)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {origResolution}
          </div>

          {/* Size */}
          <div style={{ padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
            {t('replace.size')}
          </div>
          <div style={{ padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
            {formatBytes(origSizeBytes)}
          </div>
          <div style={{ padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--border-subtle)', fontWeight: 600, color: 'var(--text-primary)' }}>
            ~{formatBytes(estSizeBytes)}
          </div>
        </div>

        {/* Recycle Bin Notice */}
        <div
          style={{
            padding: 'var(--space-3)',
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-md)',
            fontSize: 'var(--text-12)',
            color: 'var(--text-secondary)',
            lineHeight: 1.4,
          }}
        >
          {t('replace.recycle_bin_warning')}
        </div>

        {/* Do Not Ask Again Checkbox */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: 'var(--text-12)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
            style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
          />
          <span>{t('replace.do_not_ask_again')}</span>
        </label>
      </div>
    </Modal>
  );
};
