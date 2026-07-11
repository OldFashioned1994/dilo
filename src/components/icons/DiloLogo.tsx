import React from "react";

/* Lockup de marca: isotipo «¡» + wordmark DILO en Archivo 900.
   El texto usa la fuente cargada por la app (ver App.css). */
const DiloLogo = ({
  width,
  height,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) => {
  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox="0 0 268 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g className="logo-primary">
        <circle cx="32" cy="44" r="14" />
        <rect x="24" y="64" width="16" height="28" rx="8" />
      </g>
      <text
        x="56"
        y="92"
        fontFamily="Archivo, 'Arial Black', sans-serif"
        fontWeight="900"
        fontSize="72"
        letterSpacing="-2"
        fill="var(--color-text)"
      >
        DILO
      </text>
    </svg>
  );
};

export default DiloLogo;
