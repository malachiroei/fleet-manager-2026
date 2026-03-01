import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  onSign?: (hasSignature: boolean) => void;
}

export interface SignaturePadRef {
  getDataUrl: () => string | null;
  isEmpty: () => boolean;
  clear: () => void;
}

const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(({ onSign }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useImperativeHandle(ref, () => ({
    getDataUrl: () => {
      if (!canvasRef.current || !hasSignature) return null;
      return canvasRef.current.toDataURL('image/png');
    },
    isEmpty: () => !hasSignature,
    clear: () => {
      clearSignature();
    }
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set up canvas
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;

    const coords = getCoordinates(e);
    if (!coords) return;

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    
    if (!hasSignature) {
      setHasSignature(true);
      onSign?.(true);
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSign?.(false);
  };

  return (
    <div className="space-y-2">
      <div className="relative border-2 border-dashed border-border rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          className="w-full h-32 touch-none cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-muted-foreground">
            חתום כאן
          </div>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={clearSignature}
        className="w-full"
      >
        <Eraser className="h-4 w-4 ml-2" />
        נקה חתימה
      </Button>
    </div>
  );
});

SignaturePad.displayName = 'SignaturePad';

export default SignaturePad;
