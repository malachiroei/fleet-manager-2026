import { Download, Smartphone } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Variant = 'header' | 'auth';

interface PwaInstallButtonProps {
  /** header = icon only on dark bar; auth = slightly larger on login card */
  variant?: Variant;
  className?: string;
}

export function PwaInstallButton({ variant = 'header', className }: PwaInstallButtonProps) {
  const { isInstalled, canPrompt, isIos, promptInstall } = usePwaInstall();

  if (isInstalled) return null;

  const buttonClass =
    variant === 'auth'
      ? 'h-9 w-9 rounded-lg flex items-center justify-center text-cyan-400/80 hover:text-cyan-300 hover:bg-white/10 transition-colors border border-white/10'
      : 'h-8 w-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors';

  const handleNativeInstall = async () => {
    const accepted = await promptInstall();
    if (accepted) {
      toast({ title: 'האפליקציה הותקנה', description: 'תוכלו לפתוח אותה מהמסך הראשי או מתפריט האפליקציות.' });
    }
  };

  // Browser offered install → single click installs
  if (canPrompt) {
    return (
      <button
        type="button"
        onClick={handleNativeInstall}
        title="התקן אפליקציה על המכשיר"
        className={cn(buttonClass, className)}
      >
        <Download className={variant === 'auth' ? 'h-4 w-4' : 'h-4 w-4'} />
      </button>
    );
  }

  // iOS or no prompt – popover with instructions
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="התקן אפליקציה על המכשיר"
          className={cn(buttonClass, className)}
        >
          <Smartphone className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-80 border-white/10 bg-[#0d1b2e] text-white shadow-xl"
      >
        <p className="text-sm font-semibold text-white mb-2">התקנת Fleet Manager</p>
        {isIos ? (
          <ol className="text-xs text-white/80 space-y-2 list-decimal list-inside rtl:text-right">
            <li>לחצו על כפתור השיתוף <span className="font-medium text-cyan-400">״שתף״</span> בסרגל התחתון</li>
            <li>גללו ובחרו <span className="font-medium text-cyan-400">״הוסף למסך הבית״</span></li>
            <li>אשרו – האייקון יופיע במסך הבית כאפליקציה</li>
          </ol>
        ) : (
          <ol className="text-xs text-white/80 space-y-2 list-decimal list-inside rtl:text-right">
            <li>בכרום או אדג&apos;: פתחו את התפריט (⋮) בפינה</li>
            <li>בחרו <span className="font-medium text-cyan-400">״התקן אפליקציה…״</span> או <span className="font-medium text-cyan-400">״התקן Fleet Manager״</span></li>
            <li>במחשב: אפשר גם דרך סרגל הכתובות (אייקון מחשב+חץ)</li>
          </ol>
        )}
        <p className="text-[10px] text-white/50 mt-3">
          לאחר ההתקנה האפליקציה תיפתח במסך מלא בלי סרגל דפדפן.
        </p>
      </PopoverContent>
    </Popover>
  );
}
