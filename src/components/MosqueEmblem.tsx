import React from 'react';

interface MosqueEmblemProps {
  className?: string;
  variant?: 'emerald' | 'gold';
}

export const MosqueEmblem: React.FC<MosqueEmblemProps> = ({
  className = 'w-11 h-11',
  variant = 'emerald',
}) => {
  const bg = variant === 'emerald' ? '#0B3B2B' : '#FAF8F4';
  const ring = variant === 'emerald' ? '#C9A24D' : '#0B3B2B';
  const crescent = variant === 'emerald' ? '#F5E6C4' : '#0B3B2B';

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2" y="2" width="60" height="60" rx="16" fill={bg} />
      <rect
        x="4.5"
        y="4.5"
        width="55"
        height="55"
        rx="13.5"
        stroke={ring}
        strokeOpacity="0.45"
        strokeWidth="1"
      />
      <g transform="translate(32 32)">
        <polygon
          points="0,-20 5.8,-5.8 20,0 5.8,5.8 0,20 -5.8,5.8 -20,0 -5.8,-5.8"
          stroke={ring}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <polygon
          points="0,-20 5.8,-5.8 20,0 5.8,5.8 0,20 -5.8,5.8 -20,0 -5.8,-5.8"
          transform="rotate(45)"
          stroke={ring}
          strokeOpacity="0.65"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path
          d="M 1.8,-9.2 A 9.4,9.4 0 1,0 9.2,5.8 A 7.2,7.2 0 1,1 1.8,-9.2 Z"
          fill={crescent}
        />
      </g>
    </svg>
  );
};
