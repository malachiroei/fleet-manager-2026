import { cn } from '@/lib/utils';
import { Fuel } from 'lucide-react';

interface FuelLevelSelectorProps {
  value: number;
  onChange: (level: number) => void;
}

const FUEL_LEVELS = [
  { value: 1, label: '1/8' },
  { value: 2, label: '2/8' },
  { value: 3, label: '3/8' },
  { value: 4, label: '4/8' },
  { value: 5, label: '5/8' },
  { value: 6, label: '6/8' },
  { value: 7, label: '7/8' },
  { value: 8, label: 'מלא' },
];

export default function FuelLevelSelector({ value, onChange }: FuelLevelSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Fuel className="h-4 w-4" />
        <span>רמת דלק</span>
      </div>
      
      <div className="grid grid-cols-8 gap-1">
        {FUEL_LEVELS.map((level) => (
          <button
            key={level.value}
            type="button"
            onClick={() => onChange(level.value)}
            className={cn(
              'flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-all text-xs',
              value >= level.value
                ? 'bg-primary border-primary text-primary-foreground'
                : 'bg-background border-border hover:border-primary/50'
            )}
          >
            <div className="text-[10px] font-medium">{level.label}</div>
          </button>
        ))}
      </div>
      
      {/* Visual fuel gauge */}
      <div className="relative h-6 bg-muted rounded-full overflow-hidden border border-border">
        <div 
          className="absolute inset-y-0 right-0 bg-gradient-to-l from-amber-400 to-amber-500 transition-all duration-300"
          style={{ width: `${(value / 8) * 100}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-xs font-medium">
          {value}/8
        </div>
      </div>
    </div>
  );
}
