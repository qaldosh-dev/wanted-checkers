export function FogOverlay({ hidden }) {
  if (!hidden) return null;
  return (
    <span
      aria-hidden="true"
      className="blind-fog pointer-events-none absolute inset-0 z-20"
    />
  );
}
