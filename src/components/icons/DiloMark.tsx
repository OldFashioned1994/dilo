/* Isotipo «¡» de DILO. Hereda color vía currentColor para usarse como ícono. */
const DiloMark = ({
  width,
  height,
  className,
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
}) => (
  <svg
    width={width || 24}
    height={height || 24}
    viewBox="0 0 512 512"
    className={className}
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="256" cy="150" r="74" />
    <rect x="216" y="268" width="80" height="164" rx="40" />
  </svg>
);

export default DiloMark;
