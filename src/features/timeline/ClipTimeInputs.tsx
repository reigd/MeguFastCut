import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../stores/project';
import { usePlayerStore } from '../../stores/player';
import { formatTimecode, t } from '../../shared/i18n';

/** Parse HH:MM:SS or MM:SS or seconds string to milliseconds */
function parseTimecodeToMs(text: string): number | null {
  const clean = text.trim();
  if (!clean) return null;

  // Check if it's pure seconds/milliseconds
  if (!clean.includes(':')) {
    const num = parseFloat(clean);
    return isNaN(num) ? null : Math.round(num * 1000);
  }

  const parts = clean.split(':').map((p) => parseFloat(p));
  if (parts.some((p) => isNaN(p))) return null;

  if (parts.length === 2) {
    // MM:SS[.fff]
    const [mm, ss] = parts;
    return Math.round((mm * 60 + ss) * 1000);
  }

  if (parts.length === 3) {
    // HH:MM:SS[.fff]
    const [hh, mm, ss] = parts;
    return Math.round((hh * 3600 + mm * 60 + ss) * 1000);
  }

  return null;
}

export const ClipTimeInputs: React.FC = () => {
  const { project, sources, activeClipId, trimClip } = useProjectStore();
  const { seek } = usePlayerStore();

  const activeClip = project.clips.find((c) => c.id === activeClipId);
  const activeSource = activeClip ? sources.find((s) => s.id === activeClip.sourceId) : undefined;
  const fps = activeSource?.probe.video
    ? activeSource.probe.video.fpsNum / activeSource.probe.video.fpsDen
    : 30;
  const frameMs = 1000 / (fps || 30);

  const [inStr, setInStr] = useState('');
  const [outStr, setOutStr] = useState('');

  // Sync internal string when active clip changes
  useEffect(() => {
    if (activeClip) {
      setInStr(formatTimecode(activeClip.inMs));
      setOutStr(formatTimecode(activeClip.outMs));
    }
  }, [activeClip?.id, activeClip?.inMs, activeClip?.outMs]);

  if (!activeClip || !activeSource) {
    return null;
  }

  const durationMs = Math.max(0, activeClip.outMs - activeClip.inMs);

  const commitIn = (valMs: number) => {
    const clampedIn = Math.max(0, Math.min(activeClip.outMs - 50, valMs));
    trimClip(activeClip.id, clampedIn, activeClip.outMs, true);
    setInStr(formatTimecode(clampedIn));
    seek(clampedIn);
  };

  const commitOut = (valMs: number) => {
    const maxDur = activeSource.probe.durationMs;
    const clampedOut = Math.min(maxDur, Math.max(activeClip.inMs + 50, valMs));
    trimClip(activeClip.id, activeClip.inMs, clampedOut, true);
    setOutStr(formatTimecode(clampedOut));
    seek(clampedOut);
  };

  const handleKeyDownIn = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.shiftKey ? 1000 : frameMs;
      commitIn(activeClip.inMs + step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? 1000 : frameMs;
      commitIn(activeClip.inMs - step);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const parsed = parseTimecodeToMs(inStr);
      if (parsed !== null) commitIn(parsed);
      else setInStr(formatTimecode(activeClip.inMs));
    }
  };

  const handleKeyDownOut = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.shiftKey ? 1000 : frameMs;
      commitOut(activeClip.outMs + step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? 1000 : frameMs;
      commitOut(activeClip.outMs - step);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const parsed = parseTimecodeToMs(outStr);
      if (parsed !== null) commitOut(parsed);
      else setOutStr(formatTimecode(activeClip.outMs));
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        userSelect: 'none',
      }}
    >
      {/* In Input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-muted)', fontWeight: 600 }}>
          {t('common.in')}:
        </span>
        <input
          type="text"
          className="timecode"
          value={inStr}
          onChange={(e) => setInStr(e.target.value)}
          onKeyDown={handleKeyDownIn}
          onBlur={() => {
            const parsed = parseTimecodeToMs(inStr);
            if (parsed !== null) commitIn(parsed);
            else setInStr(formatTimecode(activeClip.inMs));
          }}
          style={{
            width: '78px',
            height: '22px',
            padding: '0 4px',
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-sm)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-11)',
            textAlign: 'center',
          }}
        />
      </div>

      {/* Out Input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-muted)', fontWeight: 600 }}>
          {t('common.out')}:
        </span>
        <input
          type="text"
          className="timecode"
          value={outStr}
          onChange={(e) => setOutStr(e.target.value)}
          onKeyDown={handleKeyDownOut}
          onBlur={() => {
            const parsed = parseTimecodeToMs(outStr);
            if (parsed !== null) commitOut(parsed);
            else setOutStr(formatTimecode(activeClip.outMs));
          }}
          style={{
            width: '78px',
            height: '22px',
            padding: '0 4px',
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-sm)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-11)',
            textAlign: 'center',
          }}
        />
      </div>

      {/* Duration Display */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-muted)', fontWeight: 600 }}>
          {t('common.duration')}:
        </span>
        <span
          className="timecode"
          style={{
            fontSize: 'var(--text-11)',
            color: 'var(--accent)',
            fontWeight: 600,
          }}
        >
          {formatTimecode(durationMs)}
        </span>
      </div>
    </div>
  );
};
