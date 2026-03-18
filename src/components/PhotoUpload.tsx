import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Check, X, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PhotoUploadProps {
  label: string;
  onPhotoCapture: (file: File) => void;
  required?: boolean;
  icon?: React.ReactNode;
}

export default function PhotoUpload({ label, onPhotoCapture, required, icon }: PhotoUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    onPhotoCapture(file);
    setIsCapturing(false);
  };

  const clearPhoto = () => {
    setPreview(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const openCamera = () => {
    inputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />
      
      <div 
        className={cn(
          "relative aspect-video rounded-lg border-2 border-dashed overflow-hidden transition-all",
          preview ? "border-success" : "border-border",
          !preview && "hover:border-primary/50 cursor-pointer"
        )}
        onClick={!preview ? openCamera : undefined}
      >
        {preview ? (
          <>
            <img 
              src={preview} 
              alt={label} 
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 left-2 bg-success text-success-foreground rounded-full p-1">
              <Check className="h-4 w-4" />
            </div>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                clearPhoto();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            {icon || <Camera className="h-8 w-8" />}
            <span className="text-sm font-medium">{label}</span>
            {required && <span className="text-xs text-destructive">*חובה</span>}
          </div>
        )}
      </div>
    </div>
  );
}
