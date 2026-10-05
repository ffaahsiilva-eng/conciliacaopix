import React from 'react';
import { formatPlate } from '../services/api';

export const LicensePlateBadge: React.FC<{ plate: string | null | undefined, className?: string }> = ({ plate, className = '' }) => {
  if (!plate) return null;
  const formatted = formatPlate(plate);
  
  return (
    <div 
      className={`relative inline-flex items-center justify-center font-extrabold shadow-sm rounded-md overflow-hidden ${className}`}
      style={{
        backgroundImage: "url('/placa.png')",
        backgroundSize: '100% 100%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        width: '110px',
        height: '36px',
        color: '#003399', // Dark blue typical of Mercosul plates
        letterSpacing: '1.5px',
        textTransform: 'uppercase'
      }}
      title={formatted}
    >
      <span className="relative z-10 pt-2.5 text-[15px] leading-none" style={{ textShadow: '0px 1px 0px rgba(255,255,255,0.8)' }}>
        {formatted}
      </span>
    </div>
  );
};
