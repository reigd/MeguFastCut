/**
 * Truncates a string with middle ellipsis preserving file extension and start.
 * e.g. "my_long_recording_session_final_render.mp4" -> "my_long_rec...render.mp4"
 */
export function truncateMiddle(str: string, maxLength = 22): string {
  if (!str || str.length <= maxLength) return str;

  const extIndex = str.lastIndexOf('.');
  const ext = extIndex !== -1 && str.length - extIndex <= 6 ? str.substring(extIndex) : '';
  const name = ext ? str.substring(0, extIndex) : str;

  const targetNameLength = maxLength - 3 - ext.length;
  if (targetNameLength <= 2) return `${str.substring(0, maxLength - 3)}...`;

  const headLength = Math.ceil(targetNameLength / 2);
  const tailLength = Math.floor(targetNameLength / 2);

  return `${name.substring(0, headLength)}...${name.substring(name.length - tailLength)}${ext}`;
}

/**
 * Assign consistent distinct color badge to source IDs so clips from the same source share color
 */
const SOURCE_PALETTE = [
  '#38BDF8', // Cyan / Sky
  '#A855F7', // Purple
  '#EC4899', // Pink
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#F43F5E', // Rose
];

export function getSourceColor(sourceId: string, allSources: { id: string }[]): string {
  const index = allSources.findIndex((s) => s.id === sourceId);
  if (index === -1) return SOURCE_PALETTE[0];
  return SOURCE_PALETTE[index % SOURCE_PALETTE.length];
}
